const UserDao = require("../model/UserDao");

const REFILL_AMOUNT = 1000;
const REFILL_BELOW = 10; // the default ante: below this a player can't start a hand

// POST /api/money/refill (M1): free chips for a player who has run out
exports.refill = async function (req, res) {
  try {
    const updated = await UserDao.refillBalance(req.user._id, REFILL_BELOW, REFILL_AMOUNT);
    if (!updated) {
      return res.status(409).json({ success: false, error: "You can only get more chips when you can't afford the ante." });
    }

    res.json({ success: true, balance: updated.balance });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not add chips." });
  }
};