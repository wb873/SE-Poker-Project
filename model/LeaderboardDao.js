const mongoose = require('mongoose');
const UserDao = require('./UserDao');
const periods = require('../util/LeaderboardPeriod');

const monthlyStatsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true },
    netChips: { type: Number, default: 0 },
    handsPlayed: { type: Number, default: 0 },
}, { timestamps: true });
monthlyStatsSchema.index({ month: 1, userId: 1 }, { unique: true });
const MonthlyStats = mongoose.models.MonthlyStats || mongoose.model('MonthlyStats', monthlyStatsSchema);

// Server-only integration point. Call ONCE after a registered player's hand is
// settled, with the net change including ante, raise, swap fees and payouts.
// Guests never have a User document and cannot create an entry here.
exports.recordResult = async function(userId, netChips, settledAt = new Date()) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('A registered user ID is required.');
    if (!Number.isSafeInteger(netChips)) throw new Error('Net chips must be a whole number.');
    if (!(settledAt instanceof Date) || !Number.isFinite(settledAt.getTime())) throw new Error('A valid settlement date is required.');
    const user = await UserDao.findById(userId);
    if (!user || user.isBanned) throw new Error('An active registered user is required.');
    return MonthlyStats.findOneAndUpdate(
        { userId: user._id, month: periods.current(settledAt).month },
        { $inc: { netChips, handsPlayed: 1 } },
        { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );
};

exports.readMonthly = async function(month, userId = null) {
    // Rank only accounts with a settled hand this month. The ID breaks ties
    // consistently, giving exactly ten positions rather than expanding ties.
    const [result] = await MonthlyStats.aggregate([
        { $match: { month, handsPlayed: { $gt: 0 } } },
        { $lookup: { from: UserDao.model.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $match: { 'user.isBanned': { $ne: true } } },
        { $setWindowFields: { sortBy: { netChips: -1, userId: 1 }, output: { rank: { $documentNumber: {} } } } },
        { $sort: { rank: 1 } },
        { $project: { _id: 0, userId: { $toString: '$userId' }, username: '$user.username', netChips: 1, handsPlayed: 1, rank: 1 } },
        { $facet: {
            topPlayers: [{ $limit: 10 }],
            currentPlayer: [{ $match: { userId: userId ? String(userId) : null } }, { $limit: 1 }],
        } },
    ]);
    return { topPlayers: result?.topPlayers || [], currentPlayer: result?.currentPlayer?.[0] || null };
};

exports.model = MonthlyStats;
