const express = require("express");

const {
  createGame,
  getGame,
  getPublicState,
  applyAction,
  nextHand,
} = require("../game");

const router = express.Router();

// Start a new game and immediately deal its first hand.
// Optional request body: { "ante": 10 }
router.post("/start", (req, res) => {
  try {
    const ante = req.body?.ante ?? 10;
    const game = createGame(ante);

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