const express = require("express");

const {
  createGame,
  getGame,
  getPublicState,
  applyAction,
  nextHand,
} = require("../game");
const { requireUser } = require("../util/AuthSession");
const LeaderboardController = require("../controller/LeaderboardController");

const router = express.Router();

//Logged in players are attached to their game so their hands count for the leaderboard (LB1); guests send no token and play without being recorded
function optionalUser(req, res, next) {
  if (!req.get("Authorization")) return next();
  requireUser(req, res, next);
}

// Start a new game and immediately deal its first hand.
// Optional request body: { "ante": 10 }
router.post("/start", optionalUser, (req, res) => {
  try {
    const ante = req.body?.ante ?? 10;
    const game = createGame(ante);
    if (req.user) getGame(game.gameId).owner = req.user.username;

    res.status(201).json({
      success: true,
      game,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Retrieve the current game state.
// GET /api/game/current?gameId=YOUR_GAME_ID
router.get("/current", (req, res) => {
  const { gameId } = req.query;

  if (typeof gameId !== "string" || !gameId) {
    return res.status(400).json({
      error: "A gameId query parameter is required.",
    });
  }

  const game = getGame(gameId);

  if (!game) {
    return res.status(404).json({
      error: "Game not found.",
    });
  }

  res.json({
    success: true,
    game: getPublicState(game),
  });
});

// Player submits "fold", "raise" or "swap".
// POST /api/game/current/action
// Body: { "gameId": "...", "action": "raise" }
//       { "gameId": "...", "action": "swap", "cardIndex": 0 }
router.post("/current/action", (req, res) => {
  const { gameId, action, cardIndex } = req.body ?? {};
  const game = getGame(gameId);

  if (!game) {
    return res.status(404).json({
      success: false,
      error: "Game not found.",
    });
  }

  try {
    const updatedGame = applyAction(game, action, { cardIndex });
    LeaderboardController.recordHand(game);
    
    res.json({
      success: true,
      game: updatedGame,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Start the next hand for the same game.
// Body: { "gameId": "..." }
router.post("/next", (req, res) => {
  const { gameId } = req.body ?? {};
  const game = getGame(gameId);

  if (!game) {
    return res.status(404).json({
      success: false,
      error: "Game not found.",
    });
  }

  try {
    const updatedGame = nextHand(game);

    res.json({
      success: true,
      game: updatedGame,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;