const mongoose = require("mongoose");

// A lobby's id is also its join code: 5 random capital letters, e.g. "QXMRT"
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LENGTH = 5;
const CODE_ATTEMPTS = 10;

function newLobbyCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

// Codes are matched ignoring case and spaces; anything else isn't a lobby code
function toLobbyCode(id) {
  const code = String(id ?? "").trim().toUpperCase();
  return /^[A-Z]{5}$/.test(code) ? code : null;
}

// Inserts with a fresh code, trying another one if the code is already taken
async function createWithUniqueCode(insert, makeCode = newLobbyCode, attempts = CODE_ATTEMPTS) {
  for (let i = 1; ; i++) {
    try {
      return await insert(makeCode());
    } catch (err) {
      if (err?.code !== 11000 || i >= attempts) throw err; // 11000: duplicate key
    }
  }
}

const lobbySchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    host: { type: String, required: true, trim: true },
    isPrivate: { type: Boolean, default: false },
    passwordHash: { type: String, default: null },
    maxPlayers: { type: Number, min: 2, max: 7, default: 7 },
    ante: { type: Number, min: 1, default: 10 },
    turnTimer: { type: Number, default: 30 },
    sideBets: { type: Boolean, default: true },
    bots: {
      enabled: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      // One difficulty per bot, in seating order
      difficulties: { type: [{ type: String, enum: ["easy", "medium", "hard"] }], default: [] },
    },
    players: { type: [String], default: [] },
    status: { type: String, enum: ["waiting", "in_progress"], default: "waiting" },
  },
  { timestamps: true }
);

const Lobby = mongoose.models.Lobby || mongoose.model("Lobby", lobbySchema);

exports.newLobbyCode = newLobbyCode;
exports.toLobbyCode = toLobbyCode;
exports.createWithUniqueCode = createWithUniqueCode;

exports.create = (data) => createWithUniqueCode((code) => Lobby.create({ ...data, _id: code }));

exports.findPublic = () =>
  Lobby.find({ isPrivate: false, status: "waiting" }).sort({ createdAt: -1 }).lean();

exports.findById = (id) => {
  const code = toLobbyCode(id);
  if (!code) return Promise.resolve(null);
  return Lobby.findById(code).lean();
};

exports.deleteAll = () => Lobby.deleteMany({}); // tests only

// Atomically adds a human player. Returns null if the lobby is missing, not
// waiting, already contains the player, or has no free seat (bots take seats
// too). It is one query, so two simultaneous joins can't overfill a table.
exports.addPlayer = (id, username) => {
  const code = toLobbyCode(id);
  if (!code) return Promise.resolve(null);
  return Lobby.findOneAndUpdate(
    {
      _id: code,
      status: "waiting",
      players: { $ne: username },
      $expr: {
        $lt: [
          { $add: [{ $size: "$players" }, { $cond: ["$bots.enabled", "$bots.amount", 0] }] },
          "$maxPlayers",
        ],
      },
    },
    { $push: { players: username } },
    { returnDocument: "after" }
  ).lean();
};

// Removes a human player. If the host leaves, the next player becomes host.
exports.removePlayer = async (id, username) => {
  const code = toLobbyCode(id);
  if (!code) return null;
  const updated = await Lobby.findOneAndUpdate(
    { _id: code, players: username },
    { $pull: { players: username } },
    { returnDocument: "after" }
  ).lean();
  if (updated && updated.host === username && updated.players.length > 0) {
    return Lobby.findByIdAndUpdate(code, { host: updated.players[0] }, { returnDocument: "after" }).lean();
  }
  return updated;
};

exports.deleteById = (id) => {
  const code = toLobbyCode(id);
  if (!code) return Promise.resolve(null);
  return Lobby.findByIdAndDelete(code).lean();
};

exports.findAll = () => Lobby.find({}).lean();