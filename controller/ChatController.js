const MAX_MESSAGE_LENGTH = 200;
const MAX_USERNAME_LENGTH = 20;

// Lobby chat over socket.io (F5). Messages are relayed to the room, never stored.
exports.registerChatHandlers = function (io, socket) {
  socket.on("chat:join", ({ lobbyId, username } = {}) => {
    if (typeof lobbyId !== "string" || !lobbyId) return;

    // TODO: take username from auth login once P2 exists
    const name = typeof username === "string" ? username.trim().slice(0, MAX_USERNAME_LENGTH) : "";

    if (socket.data.room) socket.leave(socket.data.room);
    socket.data.room = `lobby:${lobbyId}`;
    socket.data.username = name || "Player";
    socket.join(socket.data.room);
  });

  // Client sends a message to everyone at its table
  socket.on("chat:send", ({ text } = {}) => {
    if (!socket.data.room) return socket.emit("chat:error", "Join a lobby before chatting.");
    if (typeof text !== "string") return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) {
      return socket.emit("chat:error", `Messages must be 1-${MAX_MESSAGE_LENGTH} characters.`);
    }

    io.to(socket.data.room).emit("chat:message", {
      user: socket.data.username,
      text: trimmed,
      sentAt: Date.now(),
    });
  });
};
