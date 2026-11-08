require("dotenv").config();
const express = require("express");
const cors = require("cors");
const gameRoutes = require("./routes/game_routes");
const lobbyRoutes = require("./routes/lobby_routes");
const userRoutes = require("./routes/user_routes");
const friendRoutes = require("./routes/friend_routes");
const messageRoutes = require("./routes/message_routes");
const leaderboardRoutes = require("./routes/leaderboard_routes");
const db = require("./model/DbConnection");
const http = require("http");
const { Server } = require("socket.io");
const ChatController = require("./controller/ChatController");
const TableController = require("./controller/TableController");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Not 5000: macOS AirPlay Receiver listens there. Keep in sync with client/src/api_config.js
const PORT = process.env.PORT || 4000;

if (process.env.DB_URI || process.env.CI) {
  db.connect();
  TableController.startSweeper(io);
} else {
  console.warn("DB_URI is not set: lobby routes will fail until you add it to .env");
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Caribbean Stud Poker server is running!" });
});

app.use("/api/game", gameRoutes);
app.use("/api/lobbies", lobbyRoutes);
app.use("/api/auth", userRoutes);
app.use('/api/contacts', require('./routes/contact_routes'));
app.use('/api/admin', require('./routes/admin_routes'));
app.use("/api/friends", friendRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/leaderboard", leaderboardRoutes);


io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  ChatController.registerChatHandlers(io, socket);
  TableController.registerTableHandlers(io, socket);
  
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Poker API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});