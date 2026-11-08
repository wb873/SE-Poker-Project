const router = require('express').Router();
const auth = require('../util/AuthSession');
const controller = require('../controller/LeaderboardController');

// Public rankings for guests; authenticate a supplied token for personal rank.
router.get('/', (req, res, next) => {
    if (req.get('Authorization')) return auth.requireUser(req, res, next);
    next();
}, controller.getMonthly);

module.exports = router;
