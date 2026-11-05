const dao = require('../model/LeaderboardDao');
const periods = require('../util/LeaderboardPeriod');

exports.getMonthly = async function(req, res) {
    try {
        const period = periods.current();
        const rankings = await dao.readMonthly(period.month, req.user?._id);
        res.json({ ...period, ...rankings });
    } catch (error) {
        res.status(500).json({ error: 'Could not load the leaderboard.' });
    }
};
