
const express = require("express");
const cors = require("cors");
const gameRoutes = require("./routes/game_routes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Caribbean Stud Poker server is running!",
  });
});

app.use("/api/game", gameRoutes);

app.listen(PORT, () => {
  console.log(`Poker API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
