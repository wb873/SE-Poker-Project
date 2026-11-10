const LobbyDao = require("../model/LobbyDao");
const tableGame = require("../tableGame");
const sessions = require('../util/AuthSession');
const leaderboard = require('./LeaderboardController');
const UserDao = require("../model/UserDao");

// How often the sweeper runs, and how long a player may be offline before
// they lose their seat. When the last player is removed, the lobby is deleted.
const SWEEP_INTERVAL_MS = 10 * 1000;
const PLAYER_GRACE_MS = 30 * 1000;

const lastSeen = new Map(); // "lobbyId|username" -> last time seen connected

const roomOf = (lobbyId) => `table:${lobbyId}`;

// tableGame calls this inside settle for each logged-in player's hand, before
// the seats of players who left are removed, so no result is lost. It records
// the hand for the leaderboard and saves the win or loss to the account.
// Errors are logged, not thrown, so one failed save doesn't break the table.
function handSettled(hand) {
  leaderboard.recordHand(hand);
  const net = hand.balance - hand.handStartBalance;
  if (net === 0) return;
  UserDao.applyHandResult(hand.ownerId, net)
    .catch((err) => console.error("Could not save hand result:", err.message));
}

// Sends every socket at the table its own view of the state
function broadcast(io, table) {
  const ids = io.sockets.adapter.rooms.get(roomOf(table.lobbyId)) || [];
  for (const id of ids) {
    const socket = io.sockets.sockets.get(id);
    if (socket) socket.emit("table:state", tableGame.publicState(table, socket.data.tableUser));
  }
}

function armTimer(io, table) {
  clearTimeout(table.timer);
  table.timer = setTimeout(() => {
    tableGame.foldIdle(table);
    broadcast(io, table);
  }, table.turnSeconds * 1000);
}

async function closeLobby(io, lobbyId) {
  await LobbyDao.deleteById(lobbyId);
  tableGame.deleteTable(lobbyId);
  io.to(roomOf(lobbyId)).emit("table:closed");
}

// Takes a player out of the lobby and the table. Deletes the lobby if nobody is left.
async function removeFromLobby(io, lobbyId, username) {
  const table = tableGame.getTable(lobbyId);
  if (table) tableGame.leave(table, username);

  const updated = await LobbyDao.removePlayer(lobbyId, username);
  if (updated && updated.players.length === 0) return closeLobby(io, lobbyId);
  if (table) broadcast(io, table);
}

exports.registerTableHandlers = function (io, socket) {
  const fail = (message) => socket.emit("table:error", message);

  // Runs a handler for the table this socket is seated at
  function seated(handler) {
    return (payload) => {
      const table = socket.data.tableLobby && tableGame.getTable(socket.data.tableLobby);
      if (!table || !socket.data.tableUser) return fail("You are not seated at a table.");
      try {
        handler(table, payload ?? {});
      } catch (err) {
        fail(err.message);
      }
    };
  }

  // Seats a lobby member (or lets someone watch with spectate: true)
  socket.on("table:join", async ({ lobbyId, username, spectate, token } = {}) => {
    if (typeof lobbyId !== "string" || typeof username !== "string") return;
    try {
      const lobby = await LobbyDao.findById(lobbyId);
      if (!lobby) return fail("Lobby not found.");

      const user = token ? await sessions.authenticate(token) : null;
      const name = user ? user.username : username.trim();
      if (!spectate && !lobby.players.includes(name))
        return fail("Join this lobby before sitting at its table.");

      const existingSeat = tableGame.getTable(String(lobby._id))?.seats.get(name);
      if (!spectate && existingSeat?.accountId && String(existingSeat.accountId) !== String(user?._id))
        return fail('Sign in to rejoin this player’s seat.');

      if (socket.data.tableLobby) socket.leave(roomOf(socket.data.tableLobby));
      socket.data.tableLobby = String(lobby._id);
      socket.data.tableUser = spectate ? null : name;
      socket.join(roomOf(socket.data.tableLobby));

      const table = tableGame.getOrCreateTable(lobby);
      table.onHandSettled = handSettled;
      // Logged-in seats play with the account balance; guests get the starting 1,000
      if (!spectate) tableGame.sitDown(table, name, user ? String(user._id) : null, user ? user.balance : null);
      broadcast(io, table);
    } catch (err) {
      fail(err.status ? err.message : "Could not join the table.");
    }
  });

  socket.on("table:deal", seated((table) => {
    tableGame.startHand(table);
    armTimer(io, table);
    broadcast(io, table);
  }));

  socket.on("table:action", seated((table, { action, cardIndex }) => {
    tableGame.act(table, socket.data.tableUser, action, cardIndex);
    broadcast(io, table);
  }));

  // The Exit Table button: leave right away instead of waiting for the sweeper
  socket.on("table:leave", async () => {
    const { tableLobby, tableUser } = socket.data;
    if (tableLobby) socket.leave(roomOf(tableLobby));
    socket.data.tableLobby = null;
    socket.data.tableUser = null;
    if (tableLobby && tableUser) {
      try {
        await removeFromLobby(io, tableLobby, tableUser);
      } catch (err) {
        console.error("Leave failed:", err.message);
      }
    }
  });
};

// Every few seconds: remove players who have been offline too long from tables
// on this server, delete lobbies with no players left, and drop tables whose lobby is gone.
exports.startSweeper = function (io) {
  setInterval(async () => {
    try {
      const online = new Set();
      for (const s of io.sockets.sockets.values()) {
        if (s.data.tableLobby && s.data.tableUser) online.add(`${s.data.tableLobby}|${s.data.tableUser}`);
      }

      const now = Date.now();
      const lobbies = await LobbyDao.findAll();

      for (const lobby of lobbies) {
        const lobbyId = String(lobby._id);
        if (lobby.players.length === 0) {
          await closeLobby(io, lobbyId);
          continue;
        }
        // Teammates' servers can share one database; only sweep tables this server runs
        if (!tableGame.getTable(lobbyId)) continue;
        for (const name of lobby.players) {
          const key = `${lobbyId}|${name}`;
          if (online.has(key) || !lastSeen.has(key)) {
            lastSeen.set(key, now); // connected, or first time seen: start the clock
          } else if (now - lastSeen.get(key) > PLAYER_GRACE_MS) {
            lastSeen.delete(key);
            await removeFromLobby(io, lobbyId, name);
          }
        }
      }

      const live = new Set(lobbies.map((lobby) => String(lobby._id)));
      for (const id of tableGame.tableIds()) if (!live.has(id)) tableGame.deleteTable(id);
    } catch (err) {
      console.error("Lobby sweep failed:", err.message);
    }
  }, SWEEP_INTERVAL_MS);
};
