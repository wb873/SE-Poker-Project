const UserDao = require("../model/UserDao");
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
    const user = await UserDao.create({
      username: body.username.trim(),
      email: body.email.trim(),
      passwordHash: PasswordUtil.hash(body.password),
    });
    res.status(201).json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    // 11000 is Mongo's duplicate key error: the unique index on email/username rejected it
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

    // Same message and status whether the account is missing or the password is
    // wrong, so this endpoint cannot be used to discover which accounts exist
    if (!user || !PasswordUtil.verify(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: "Incorrect username or password." });
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: 'This account is banned.' });
    res.json({ success: true, user: toPublicUser(user), token: AuthSession.create(user) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not log in." });
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
