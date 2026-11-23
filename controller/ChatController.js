const MAX_MESSAGE_LENGTH = 200;
const MIN_SEND_INTERVAL_MS = 500;

// Same room TableController puts players and spectators in on table:join
const roomOf = (lobbyId) => `table:${lobbyId}`;

// G12: table chat over socket.io. Messages are relayed to the table, never stored.
// Seating, names and spectator status come from table:join, not from the client's chat messages.
exports.registerChatHandlers = function (io, socket) {
  // Kept so a client that still sends it doesn't break; table:join decides who is at the table
  socket.on("chat:join", () => {});

  socket.on("chat:send", ({ text } = {}) => {
    const { tableLobby, tableUser } = socket.data;
    if (!tableLobby) return socket.emit("chat:error", "Join a table before chatting.");
    if (!tableUser) return socket.emit("chat:error", "Spectators can read the chat but not send messages.");
    if (typeof text !== "string") return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
      return socket.emit("chat:error", `Messages must be 1-${MAX_MESSAGE_LENGTH} characters.`);
    }

    const now = Date.now();
    if (now - (socket.data.lastChatAt ?? 0) < MIN_SEND_INTERVAL_MS) {
      return socket.emit("chat:error", "You're sending messages too fast.");
    }
    socket.data.lastChatAt = now;

    io.to(roomOf(tableLobby)).emit("chat:message", { user: tableUser, text: trimmed, sentAt: now });
  });
};