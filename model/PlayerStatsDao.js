const mongoose = require('mongoose');
const users = require('./UserDao');
const { HAND_RANKS } = require('../util/PlayerStats');

// Apply the result and its deduplication key atomically to the same account.
// Leaderboard resets never touch these lifetime counters or keys.
exports.recordHand = function(userId, handId, netChips, result, handRank) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('A registered account ID is required.');
    if (typeof handId !== 'string' || !handId || handId.length > 200) throw new Error('A valid hand ID is required.');
    if (!Number.isSafeInteger(netChips)) throw new Error('Net chips must be a whole number.');
    if (!['win', 'loss', 'push', 'fold', 'dealer_not_qualified'].includes(result)) throw new Error('A completed hand result is required.');
    const bestHandRank = result === 'fold' ? -1 : HAND_RANKS.indexOf(handRank);
    if (result !== 'fold' && bestHandRank < 0) throw new Error('A showdown hand rank is required.');
    return users.model.updateOne({
        _id: userId, isBanned: { $ne: true }, recordedStatsResults: { $ne: handId },
    }, {
        $inc: { 'stats.handsPlayed': 1,
            'stats.handsWon': ['win', 'dealer_not_qualified'].includes(result) ? 1 : 0,
            'stats.totalWinnings': netChips, 'stats.timesFolded': result === 'fold' ? 1 : 0 },
        $max: { 'stats.biggestWin': Math.max(0, netChips), 'stats.bestHandRank': bestHandRank },
        $addToSet: { recordedStatsResults: handId },
    }, { runValidators: true });
};
