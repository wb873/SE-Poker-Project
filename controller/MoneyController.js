const UserDao = require("../model/UserDao");

const REFILL_AMOUNT = 500;
const REFILL_BELOW = 10; // the default ante: below this a player can't start a hand
const AD_REWARD = 1000;
const AD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

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

// POST /api/money/ad-reward (M2): chips for a broke player after watching an ad
exports.adReward = async function (req, res) {
  try {
    const updated = await UserDao.claimAdReward(req.user._id, REFILL_BELOW, AD_REWARD, AD_COOLDOWN_MS);
    if (updated) return res.json({ success: true, balance: updated.balance });

    if (req.user.balance >= REFILL_BELOW) {
      return res.status(409).json({ success: false, error: "You can only watch an ad when you can't afford the ante." });
    }

    // On a double click req.user can be from before the first reward, so there may be no time saved on it yet
    const lastReward = req.user.lastAdRewardAt?.getTime() ?? Date.now();
    const retryAfterSeconds = Math.ceil((lastReward + AD_COOLDOWN_MS - Date.now()) / 1000);
    res.status(429).json({ success: false, error: "You need to wait before watching another ad.", retryAfterSeconds });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not add chips." });
  }
};