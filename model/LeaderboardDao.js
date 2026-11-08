const mongoose = require('mongoose');
const UserDao = require('./UserDao');
const periods = require('../util/LeaderboardPeriod');
const settingsDao = require('./LeaderboardSettingsDao');

const monthlyStatsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true },
    netChips: { type: Number, default: 0 },
    handsPlayed: { type: Number, default: 0 },
    recordedResults: { type: [String], default: [] },
}, { timestamps: true });
monthlyStatsSchema.index({ month: 1, userId: 1 }, { unique: true });
const MonthlyStats = mongoose.models.MonthlyStats || mongoose.model('MonthlyStats', monthlyStatsSchema);

// Server-only integration point. Call ONCE after a registered player's hand is
// settled, with the net change including ante, raise, swap fees and payouts.
// Guests never have a User document and cannot create an entry here.
exports.recordResult = async function(userId, netChips, settledAt = new Date(), resultId = null) {
    if (!mongoose.isValidObjectId(userId)) throw new Error('A registered user ID is required.');
    if (!Number.isSafeInteger(netChips)) throw new Error('Net chips must be a whole number.');
    if (!(settledAt instanceof Date) || !Number.isFinite(settledAt.getTime())) throw new Error('A valid settlement date is required.');
    if (resultId !== null && (typeof resultId !== 'string' || !resultId || resultId.length > 200)) throw new Error('A valid hand result ID is required.');
    const user = await UserDao.findById(userId);
    if (!user || user.isBanned) throw new Error('An active registered user is required.');
    const settings = await settingsDao.read();
    const month = periods.current(settledAt).month;
    const buckets = [];
    // Ignore delayed settlements from before an explicit reset/start.
    if (settings.monthlyReset?.month !== month || settledAt >= new Date(settings.monthlyReset.startedAt)) {
        buckets.push(settingsDao.monthlyBucket(settings, month));
    }
    if (settings.season?.bucket && settledAt >= new Date(settings.season.startedAt)) {
        buckets.push(settings.season.bucket);
    }
    return Promise.all(buckets.map(async (bucket) => {
        const filter = { userId: user._id, month: bucket,
            ...(resultId ? { recordedResults: { $ne: resultId } } : {}) };
        const update = { $inc: { netChips, handsPlayed: 1 },
            ...(resultId ? { $addToSet: { recordedResults: resultId } } : {}) };
        const options = { returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true };
        try {
            return await MonthlyStats.findOneAndUpdate(filter, update, { ...options, upsert: true });
        } catch (error) {
            if (!resultId || error.code !== 11000) throw error;
            // The bucket was created concurrently, or already contains this
            // result. Retry without insertion; the result-ID condition makes
            // a repeated settlement a no-op, including after a partial failure.
            return MonthlyStats.findOneAndUpdate(filter, update, options);
        }
    }));
};

exports.readMonthly = async function(month, userId = null) {
    // Rank only accounts with a settled hand this month. The ID breaks ties
    // consistently, giving exactly ten positions rather than expanding ties.
    const [result] = await MonthlyStats.aggregate([
        { $match: { month, handsPlayed: { $gt: 0 } } },
        { $lookup: { from: UserDao.model.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $match: { 'user.isBanned': { $ne: true } } },
        // $documentNumber requires exactly one sort field. An object key keeps
        // both chip order (descending) and the stable user-ID tie breaker.
        { $set: { rankingOrder: { chips: { $multiply: ['$netChips', -1] }, userId: '$userId' } } },
        { $setWindowFields: { sortBy: { rankingOrder: 1 }, output: { rank: { $documentNumber: {} } } } },
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
