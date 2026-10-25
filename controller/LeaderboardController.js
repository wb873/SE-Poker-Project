const HandResultDao = require("../model/HandResultDao");

// Called by the game routes after every action: saves a finished hand by a
// logged-in player (LB1). Never throws, so a database problem can't break a game.
exports.recordHand = function (game) {
  if (game.phase !== "done" || !game.owner) return;

  return HandResultDao.record(game.owner, game.balance - game.handStartBalance, game.result)
    .catch((err) => console.error("Could not record hand result:", err.message));
};

// GET /api/leaderboard (LB1): top players by net chips since the 1st of this month
exports.monthly = async function (req, res) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const players = await HandResultDao.leaderboard(monthStart);
    res.json({ success: true, since: monthStart, players });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not load the leaderboard." });
  }
};