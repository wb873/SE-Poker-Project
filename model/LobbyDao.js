const mongoose = require("mongoose");

const lobbySchema = new mongoose.Schema(
  {
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
      difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    },
    players: { type: [String], default: [] },
    status: { type: String, enum: ["waiting", "in_progress"], default: "waiting" },
  },
  { timestamps: true }
);

const Lobby = mongoose.models.Lobby || mongoose.model("Lobby", lobbySchema);

exports.create = (data) => Lobby.create(data);

exports.findPublic = () =>
  Lobby.find({ isPrivate: false, status: "waiting" }).sort({ createdAt: -1 }).lean();

exports.findById = (id) => {
  if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
  return Lobby.findById(id).lean();
};

exports.deleteAll = () => Lobby.deleteMany({}); // tests only