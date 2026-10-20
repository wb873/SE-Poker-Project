const crypto = require("crypto");
const LobbyDao = require("../model/LobbyDao");

const ALLOWED_TIMERS = [15, 30, 45, 60];
const DIFFICULTIES = ["easy", "medium", "hard"];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Never includes the password hash
function toPublicLobby(lobby) {
  return {
    id: String(lobby._id),
    name: lobby.name,
    host: lobby.host,
    isPrivate: lobby.isPrivate,
    maxPlayers: lobby.maxPlayers,
    playerCount: lobby.players.length,
    ante: lobby.ante,
    turnTimer: lobby.turnTimer,
    sideBets: lobby.sideBets,
    bots: lobby.bots,
    status: lobby.status,
  };
}

// Returns an error message, or null when valid
function validateLobby(body) {
  const { name, host, visibility, password, maxPlayers, ante, turnTimer, botsEnabled, botAmount, botDifficulty } = body;

  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 30)
    return "Lobby name must be 1-30 characters.";
  if (typeof host !== "string" || !host.trim()) return "A host name is required.";
  if (visibility !== "public" && visibility !== "private") return "Visibility must be public or private.";
  if (visibility === "private" && (typeof password !== "string" || password.length < 1))
    return "Private lobbies need a password.";
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 7) return "Max players must be 2-7.";
  if (!Number.isSafeInteger(ante) || ante < 1) return "Ante must be a positive whole number.";
  if (!ALLOWED_TIMERS.includes(turnTimer)) return "Turn timer must be 15, 30, 45 or 60 seconds.";
  if (botsEnabled) {
    if (!Number.isInteger(botAmount) || botAmount < 1 || botAmount > maxPlayers - 1)
      return "Bot amount must leave room for at least one human player.";
    if (!DIFFICULTIES.includes(botDifficulty)) return "Bot difficulty must be easy, medium or hard.";
  }
  return null;
}

// POST /api/lobbies
exports.createLobby = async function (req, res) {
  const body = req.body ?? {};
  const error = validateLobby(body);
  if (error) return res.status(400).json({ success: false, error });

  try {
    const isPrivate = body.visibility === "private";
    const lobby = await LobbyDao.create({
      name: body.name.trim(),
      host: body.host.trim(),
      isPrivate,
      passwordHash: isPrivate ? hashPassword(body.password) : null,
      maxPlayers: body.maxPlayers,
      ante: body.ante,
      turnTimer: body.turnTimer,
      sideBets: body.sideBets !== false,
      bots: body.botsEnabled
        ? { enabled: true, amount: body.botAmount, difficulty: body.botDifficulty }
        : { enabled: false, amount: 0, difficulty: "medium" },
      players: [body.host.trim()],
    });
    res.status(201).json({ success: true, lobby: toPublicLobby(lobby) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not create lobby." });
  }
};

// GET /api/lobbies
exports.listLobbies = async function (req, res) {
  try {
    const lobbies = await LobbyDao.findPublic();
    res.json({ success: true, lobbies: lobbies.map(toPublicLobby) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not load lobbies." });
  }
};

// GET /api/lobbies/:id
exports.getLobby = async function (req, res) {
  try {
    const lobby = await LobbyDao.findById(req.params.id);
    if (!lobby) return res.status(404).json({ success: false, error: "Lobby not found." });
    res.json({ success: true, lobby: toPublicLobby(lobby) });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not load lobby." });
  }
};