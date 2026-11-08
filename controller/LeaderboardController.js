const dao = require('../model/LeaderboardDao');
const periods = require('../util/LeaderboardPeriod');
const settingsDao = require('../model/LeaderboardSettingsDao');
const statsDao = require('../model/PlayerStatsDao');

// Game/table ownership is an authenticated account ID, never a browser name.
// Snapshot before awaiting: the table may deal its next hand while saving.
exports.recordHand = async function(game) {
    if (game.phase !== 'done' || !game.ownerId || !game.handId) return;
    const { ownerId, handId, settledAt, balance, handStartBalance, result, playerHandRank } = game;
    // Failure of one store must not prevent the independent lifetime or
    // leaderboard update from running. Both writes are idempotent per hand.
    const writes = await Promise.allSettled([
        Promise.resolve().then(() => dao.recordResult(ownerId, balance - handStartBalance, settledAt || new Date(), handId)),
        Promise.resolve().then(() => statsDao.recordHand(ownerId, handId, balance - handStartBalance, result, playerHandRank)),
    ]);
    for (const write of writes) {
        if (write.status === 'rejected') console.error('Could not record hand result:', write.reason.message);
    }
};

exports.getMonthly = async function(req, res) {
    try {
        const period = periods.current();
        const settings = await settingsDao.read();
        const seasonal = settings.mode === 'seasonal' && settings.season?.bucket;
        const bucket = seasonal ? settings.season.bucket : settingsDao.monthlyBucket(settings, period.month);
        const rankings = await dao.readMonthly(bucket, req.user?._id);
        res.json({ ...period, mode: seasonal ? 'seasonal' : 'monthly',
            label: seasonal ? settings.season.name : period.label, ...rankings });
    } catch (error) {
        res.status(500).json({ error: 'Could not load the leaderboard.' });
    }
};

exports.getSettings = async function(req, res) {
    try { res.json(await settingsDao.read()); }
    catch (error) { res.status(500).json({ error: 'Could not load leaderboard settings.' }); }
};

exports.updateSettings = async function(req, res) {
    const { action, name, mode, target, seasonId } = req.body || {};
    if (action === 'start-season' && (typeof name !== 'string' || !name.trim() || name.trim().length > 60))
        return res.status(400).json({ error: 'Season name must be 1-60 characters.' });
    if (action === 'set-mode' && !['monthly', 'seasonal'].includes(mode))
        return res.status(400).json({ error: 'Choose monthly or seasonal.' });
    if (action === 'reset' && !['monthly', 'seasonal'].includes(target))
        return res.status(400).json({ error: 'Choose a leaderboard to reset.' });
    if ((['select-season', 'delete-season'].includes(action) || (action === 'reset' && target === 'seasonal')) &&
        (typeof seasonId !== 'string' || !seasonId.trim() || seasonId.length > 100))
        return res.status(400).json({ error: 'Choose a saved season.' });
    if (!['start-season', 'set-mode', 'reset', 'select-season', 'delete-season'].includes(action))
        return res.status(400).json({ error: 'Choose a valid leaderboard action.' });
    try {
        const result = action === 'start-season' ? await settingsDao.startSeason(name.trim())
            : action === 'set-mode' ? await settingsDao.setMode(mode)
            : action === 'select-season' ? await settingsDao.selectSeason(seasonId)
            : action === 'delete-season' ? await settingsDao.deleteSeason(seasonId)
            : await settingsDao.reset(target, seasonId);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not update the leaderboard.' });
    }
};
