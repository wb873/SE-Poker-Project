const { toPublicStats } = require('../util/PlayerStats');

// requireUser loads the current account on each request. Never accept an
// account ID or submitted statistics from the browser.
exports.getStats = function(req, res) {
    const createdAt = req.user.createdAt ? new Date(req.user.createdAt) : null;
    res.json({ stats: toPublicStats(req.user.stats), scope: 'lifetime',
        createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null });
};
