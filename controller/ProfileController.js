const { toPublicStats } = require('../util/PlayerStats');

// requireUser loads the current account on each request. Never accept an
// account ID or submitted statistics from the browser.
exports.getStats = function(req, res) {
    res.json({ stats: toPublicStats(req.user.stats), scope: 'lifetime' });
};
