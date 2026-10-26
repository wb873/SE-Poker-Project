const crypto = require('crypto');
const UserDao = require('../model/UserDao');

// Sessions are held in memory; restarting the server requires signing in again.
const sessions = new Map();
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

exports.create = function(user) {
    for (const [key, session] of sessions) {
        if (session.expires <= Date.now()) sessions.delete(key);
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(digest(token), {
        id: String(user._id),
        passwordHash: user.passwordHash,
        expires: Date.now() + 8 * 60 * 60 * 1000,
    });
    return token;
};

exports.revoke = function(token) {
    if (token) sessions.delete(digest(token));
};

exports.revokeUser = function(id) {
    for (const [key, session] of sessions) {
        if (session.id === String(id)) sessions.delete(key);
    }
};

exports.requireUser = async function(req, res, next) {
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    const session = sessions.get(digest(token));
    if (!session || session.expires <= Date.now()) {
        exports.revoke(token);
        return res.status(401).json({ error: 'Please log in again.' });
    }
    try {
        const user = await UserDao.findById(session.id);
        if (!user || user.isBanned || user.passwordHash !== session.passwordHash) {
            exports.revoke(token);
            return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Could not verify your session.' });
    }
};

exports.requireAdmin = function(req, res, next) {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
    next();
};
