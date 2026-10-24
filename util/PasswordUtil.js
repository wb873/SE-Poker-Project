const crypto = require("crypto");

// Password hashing for user accounts (P1, P2, P4).
// scrypt matches the approach already used for lobby passwords in LobbyController.

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

// Returns an error message, or null when the password is acceptable
exports.validate = function (password) {
  if (typeof password !== "string" || !password) return "A password is required.";
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Password must be ${MAX_LENGTH} characters or fewer.`;
  return null;
};

// Stored as "salt:hash" so the salt travels with the hash
exports.hash = function (password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
};

// Compared in constant time so a wrong password cannot be found by timing the response
exports.verify = function (password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;

  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(expected, actual);
};

exports.MIN_LENGTH = MIN_LENGTH;
exports.MAX_LENGTH = MAX_LENGTH;
