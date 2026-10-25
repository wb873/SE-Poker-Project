const express = require("express");
const LeaderboardController = require("../controller/LeaderboardController");

const router = express.Router();

// Public: guests can see the leaderboard too
router.get("/", LeaderboardController.monthly);

module.exports = router;