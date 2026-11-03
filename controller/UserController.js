const UserDao = require("../model/UserDao");
const ContactDao = require("../model/ContactDao");
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
// Puts a reset request in the admin inbox. The admin sets a temporary password
// and emails it to the player themselves.
exports.forgotPassword = async function (req, res) {
  const body = req.body ?? {};
  const { username, email } = body;

  if (typeof username !== "string" || !username.trim())
    return res.status(400).json({ success: false, error: "Your username is required." });
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()))
    return res.status(400).json({ success: false, error: "A valid email address is required." });

  try {
    const user = await UserDao.findByUsernameAndEmail(username, email);
    if (!user) {
      return res.status(404).json({ success: false, error: "No account matches that username and email." });
    }

    await ContactDao.create({
      userId: user._id,
      name: user.username,
      email: user.email,
      subject: "Password reset request",
      message: `${user.username} (${user.email}) requested a password reset.`,
    });
    res.json({ success: true, message: "Your request has been sent to an admin. They will email you a temporary password." });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not send the reset request." });
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
