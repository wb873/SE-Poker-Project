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

exports.authenticate = async function(token) {
    if (typeof token !== 'string') token = '';
    const session = sessions.get(digest(token));
    if (!session || session.expires <= Date.now()) {
        exports.revoke(token);
        throw Object.assign(new Error('Please log in again.'), { status: 401 });
    }
    try {
        const user = await UserDao.findById(session.id);
        if (!user || user.isBanned || user.passwordHash !== session.passwordHash) {
            exports.revoke(token);
            throw Object.assign(new Error('Your session is no longer valid. Please log in again.'), { status: 401 });
        }
        return user;
    } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Could not verify your session.'), { status: 500 });
    }
};

exports.requireUser = async function(req, res, next) {
    try {
        req.user = await exports.authenticate((req.get('Authorization') || '').replace(/^Bearer /, ''));
        next();
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
};

exports.requireAdmin = function(req, res, next) {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Administrator access required.' });
    next();
};
