require("dotenv").config();
const express = require("express");
const cors = require("cors");
const gameRoutes = require("./routes/game_routes");
const lobbyRoutes = require("./routes/lobby_routes");
const db = require("./model/DbConnection");

const app = express();
const PORT = process.env.PORT || 5000;

if (process.env.DB_URI || process.env.CI) {
  db.connect();
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

app.listen(PORT, () => {
  console.log(`Poker API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});