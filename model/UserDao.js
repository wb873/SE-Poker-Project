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

exports.create = (data) => User.create(data);

// Login accepts either a username or an email, matching the login screen's
// "Username / E-Mail" field. Returns the full document: the caller needs
// passwordHash to verify, and is responsible for not exposing it.
exports.findByIdentifier = (identifier) => {
  if (typeof identifier !== "string" || !identifier.trim()) return Promise.resolve(null);
  const value = identifier.trim();
  return User.findOne({
    $or: [{ email: value.toLowerCase() }, { username: value }],
  });
};

exports.findByEmail = (email) => {
  if (typeof email !== "string" || !email.trim()) return Promise.resolve(null);
  return User.findOne({ email: email.trim().toLowerCase() });
};

exports.findById = (id) => {
  if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
  return User.findById(id);
};

exports.updatePassword = (id, passwordHash) => {
  if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
  return User.findByIdAndUpdate(id, { passwordHash }, { returnDocument: "after" });
};

exports.deleteAll = () => User.deleteMany({}); // tests only

exports.model = User;

// Admin operations never return password hashes.
exports.listForAdmin = () => User.find().select('username email isAdmin isBanned').sort({ username: 1 }).lean();
exports.setBanned = (id, isBanned) => User.findByIdAndUpdate(id, { isBanned }, { returnDocument: 'after' }).select('username email isAdmin isBanned');
