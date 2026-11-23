const crypto = require("crypto");
const UserDao = require("../model/UserDao");
const Mailer = require("../util/Mailer");
const PasswordUtil = require("../util/PasswordUtil");
const AuthSession = require('../util/AuthSession');

// User accounts: register (P1), login (P2), logout (P3), password reset (P4).

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Never includes passwordHash: this is the only user shape sent to a client
function toPublicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    balance: user.balance,
    isAdmin: user.isAdmin,
    mustChangePassword: Boolean(user.mustChangePassword),
    stats: {
      handsPlayed: user.stats?.handsPlayed ?? 0,
      handsWon: user.stats?.handsWon ?? 0,
      biggestPot: user.stats?.biggestPot ?? 0,
    },
  };
}

// Returns an error message, or null when valid
function validateRegistration(body) {
  const { username, email, password } = body;

  if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim()))
    return "Username must be 3-20 characters, letters, numbers or underscores.";
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return "A valid email address is required.";

  return PasswordUtil.validate(password);
}

// POST /api/auth/register  (P1)
exports.register = async function (req, res) {
  const body = req.body ?? {};
  const error = validateRegistration(body);
  if (error) return res.status(400).json({ success: false, error });

  try {
    // Checked separately so the player is told which one is taken
    if (await UserDao.findByUsername(body.username))
      return res.status(409).json({ success: false, field: "username", error: "That username is already in use." });
    if (await UserDao.findByEmail(body.email))
      return res.status(409).json({ success: false, field: "email", error: "That email is already in use." });

    const user = await UserDao.create({
      username: body.username.trim(),
      email: body.email.trim(),
      passwordHash: PasswordUtil.hash(body.password),
    });
    res.status(201).json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    // 11000 is Mongo's duplicate key error: another signup took the name between the check and the insert
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, error: "That username or email is already taken." });
    }
    res.status(500).json({ success: false, error: "Could not create the account." });
  }
};

// POST /api/auth/login  (P2)
exports.login = async function (req, res) {
  const body = req.body ?? {};
  const { identifier, password } = body;

  if (typeof identifier !== "string" || !identifier.trim())
    return res.status(400).json({ success: false, error: "A username or email is required." });
  if (typeof password !== "string" || !password)
    return res.status(400).json({ success: false, error: "A password is required." });

  try {
    const user = await UserDao.findByIdentifier(identifier);

    // The login screen sends the player to Create Account on this code
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "ACCOUNT_NOT_FOUND",
        error: "No account found with that username or email. Please create an account first.",
      });
    }

    if (!PasswordUtil.verify(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: "Incorrect username or password." });
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: 'This account is banned.' });
    res.json({ success: true, user: toPublicUser(user), token: AuthSession.create(user) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not log in." });
  }
};

// GET /api/auth/availability?username=&email=  (P1)
// Lets the Create Account form say a name or email is taken before submitting
exports.checkAvailability = async function (req, res) {
  const { username, email } = req.query ?? {};

  try {
    const result = { success: true };
    if (typeof username === "string" && username.trim())
      result.usernameAvailable = !(await UserDao.findByUsername(username));
    if (typeof email === "string" && email.trim())
      result.emailAvailable = !(await UserDao.findByEmail(email));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not check availability." });
  }
};

// POST /api/auth/logout  (P3)
// Revoke the bearer session held by this client.
exports.logout = async function (req, res) {
  AuthSession.revoke((req.get?.('Authorization') || '').replace(/^Bearer /, ''));
  res.json({ success: true });
};

// POST /api/auth/reset-password  (P4)
exports.resetPassword = async function (req, res) {
  const body = req.body ?? {};
  const { email, currentPassword, newPassword } = body;

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return res.status(400).json({ success: false, error: "A valid email address is required." });
  if (typeof currentPassword !== "string" || !currentPassword)
    return res.status(400).json({ success: false, error: "Your current password is required." });

  const passwordError = PasswordUtil.validate(newPassword);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  if (currentPassword === newPassword)
    return res.status(400).json({ success: false, error: "The new password must be different." });

  try {
    const user = await UserDao.findByEmail(email);

    if (!user || !PasswordUtil.verify(currentPassword, user.passwordHash)) {
      return res.status(401).json({ success: false, error: "Incorrect email or password." });
    }

    const updated = await UserDao.updatePassword(user._id, PasswordUtil.hash(newPassword));
    res.json({ success: true, user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not reset the password." });
  }
};

// POST /api/auth/forgot-password  (P4)
// Emails the player a one-time link to choose a new password. The reply is the
// same whether or not the email has an account, so this can't be used to find
// out who is registered.
const RESET_LINK_MINUTES = 30;
const FORGOT_REPLY = "If an account uses that email, we've sent it a link to reset the password. The link expires in 30 minutes.";
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

exports.forgotPassword = async function (req, res) {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return res.status(400).json({ success: false, error: "A valid email address is required." });

  try {
    const user = await UserDao.findByEmail(email);
    if (user && !user.isBanned) {
      const token = crypto.randomBytes(32).toString("hex");
      await UserDao.setResetToken(user._id, hashResetToken(token), new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000));
      // The client uses a HashRouter, so its pages live after "#/"
      const link = `${Mailer.appUrl()}/#/reset-password?token=${token}`;
      try {
        await Mailer.sendPasswordReset(user, link, RESET_LINK_MINUTES);
      } catch (err) {
        // Not reported to the client: a different reply would show the account exists
        console.error("[forgotPassword] Could not send the reset email:", err.message);
      }
    }
    res.json({ success: true, message: FORGOT_REPLY });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not start the password reset." });
  }
};

// POST /api/auth/reset-password/confirm  (P4)
// The page behind the emailed link sends the token with the new password.
// Signs the player out everywhere, since someone else may have had the old password.
exports.confirmPasswordReset = async function (req, res) {
  const { token, newPassword } = req.body ?? {};
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))
    return res.status(400).json({ success: false, error: "This reset link is invalid or has expired." });

  const passwordError = PasswordUtil.validate(newPassword);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  try {
    const user = await UserDao.resetPasswordWithToken(hashResetToken(token), PasswordUtil.hash(newPassword));
    if (!user) return res.status(400).json({ success: false, error: "This reset link is invalid or has expired." });
    AuthSession.revokeUser(user._id);
    res.json({ success: true, message: "Your password has been changed. You can log in with it now." });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not reset the password." });
  }
};

// POST /api/auth/change-password  (P4), behind AuthSession.requireUser
// Changing the password invalidates every session, so a fresh token is returned
exports.changePassword = async function (req, res) {
  const body = req.body ?? {};
  const { currentPassword, newPassword } = body;

  if (typeof currentPassword !== "string" || !currentPassword)
    return res.status(400).json({ success: false, error: "Your current password is required." });

  const passwordError = PasswordUtil.validate(newPassword);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  if (currentPassword === newPassword)
    return res.status(400).json({ success: false, error: "The new password must be different." });

  try {
    if (!PasswordUtil.verify(currentPassword, req.user.passwordHash))
      return res.status(401).json({ success: false, error: "Your current password is incorrect." });

    const updated = await UserDao.updatePassword(req.user._id, PasswordUtil.hash(newPassword));
    AuthSession.revokeUser(req.user._id);
    res.json({ success: true, user: toPublicUser(updated), token: AuthSession.create(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not change the password." });
  }
};

// Emoji only (with optional skin tone, variation selector or joined emoji), so nothing else can be stored
const AVATAR_PATTERN = /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*$/u;

// GET /api/auth/me, behind AuthSession.requireUser
exports.getMe = function (req, res) {
  res.json({ success: true, user: toPublicUser(req.user) });
};

// PUT /api/auth/avatar  (P10), behind AuthSession.requireUser
exports.updateAvatar = async function (req, res) {
  const { avatar } = req.body ?? {};
  if (typeof avatar !== "string" || avatar.length > 16 || !AVATAR_PATTERN.test(avatar))
    return res.status(400).json({ success: false, error: "Choose a valid avatar." });

  try {
    const updated = await UserDao.setAvatar(req.user._id, avatar);
    if (!updated) return res.status(404).json({ success: false, error: "Account not found." });
    res.json({ success: true, user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not save your avatar." });
  }
};