const mongoose = require("mongoose");

// Registered player accounts (P1-P4).
// Account fields follow requirements section 3: avatar, balance and statistics
// live on the account; friends are tracked separately (F1-F3).
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 20 },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    avatar: { type: String, default: "default" },
    balance: { type: Number, min: 0, default: 10000 },
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    // Set when an admin picks a temporary password (P4); the player is offered
    // a change at each login until they choose their own
    mustChangePassword: { type: Boolean, default: false },
    stats: {
      handsPlayed: { type: Number, default: 0 },
      handsWon: { type: Number, default: 0 },
      biggestPot: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// One account per email and per username
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

// Usernames keep the capitals they were typed with but match ignoring case,
// so "Will" and "will" are the same account. strength 2 = compare letters, not case.
const IGNORE_CASE = { locale: "en", strength: 2 };

exports.create = (data) => User.create(data);

// Login accepts either a username or an email, matching the login screen's
// "Username / E-Mail" field. Returns the full document: the caller needs
// passwordHash to verify, and is responsible for not exposing it.
exports.findByIdentifier = (identifier) => {
  if (typeof identifier !== "string" || !identifier.trim()) return Promise.resolve(null);
  const value = identifier.trim();
  return User.findOne({
    $or: [{ email: value.toLowerCase() }, { username: value }],
  }).collation(IGNORE_CASE);
};

exports.findByEmail = (email) => {
  if (typeof email !== "string" || !email.trim()) return Promise.resolve(null);
  return User.findOne({ email: email.trim().toLowerCase() });
};

exports.findByUsername = (username) => {
  if (typeof username !== "string" || !username.trim()) return Promise.resolve(null);
  return User.findOne({ username: username.trim() }).collation(IGNORE_CASE);
};

// Forgot password requires both to match one account
exports.findByUsernameAndEmail = (username, email) => {
  if (typeof username !== "string" || !username.trim()) return Promise.resolve(null);
  if (typeof email !== "string" || !email.trim()) return Promise.resolve(null);
  return User.findOne({ username: username.trim(), email: email.trim().toLowerCase() }).collation(IGNORE_CASE);
};

exports.findById = (id) => {
  if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
  return User.findById(id);
};

// temporary is true when an admin sets the password for the player
exports.updatePassword = (id, passwordHash, temporary = false) => {
  if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
  return User.findByIdAndUpdate(
    id,
    { passwordHash, mustChangePassword: temporary },
    { returnDocument: "after" }
  );
};

exports.deleteAll = () => User.deleteMany({}); // tests only

exports.model = User;

// Admin operations never return password hashes.
exports.listForAdmin = () => User.find().select('username email isAdmin isBanned mustChangePassword').sort({ username: 1 }).lean();
exports.setBanned = (id, isBanned) => User.findByIdAndUpdate(id, { isBanned }, { returnDocument: 'after' }).select('username email isAdmin isBanned');
exports.setAdmin = (id, isAdmin) => User.findByIdAndUpdate(id, { isAdmin }, { returnDocument: 'after' }).select('username email isAdmin isBanned mustChangePassword');
exports.countAdmins = () => User.countDocuments({ isAdmin: true });
