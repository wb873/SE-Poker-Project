const mongoose = require('mongoose');
const dao = require('../model/UserDao');
const passwords = require('../util/PasswordUtil');
const sessions = require('../util/AuthSession');

exports.listUsers = async function(req, res) {
    try { res.json(await dao.listForAdmin()); }
    catch (error) { res.status(500).json({ error: 'Could not load users.' }); }
};

async function target(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(404).json({ error: 'User not found.' });
        return null;
    }
    const user = await dao.findById(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return null; }
    // Keep these tools limited to player accounts, avoiding admin lockouts.
    if (user.isAdmin) { res.status(403).json({ error: 'These tools cannot modify administrator accounts.' }); return null; }
    return user;
}

exports.resetPassword = async function(req, res) {
    const error = passwords.validate(req.body?.newPassword);
    if (error) return res.status(400).json({ error });
    try {
        const user = await target(req, res);
        if (!user) return;
        const updated = await dao.updatePassword(user._id, passwords.hash(req.body.newPassword));
        if (!updated) return res.status(404).json({ error: 'User not found.' });
        sessions.revokeUser(user._id);
        res.json({ message: 'Password changed. Previous sessions are invalidated.' });
    } catch (error) { res.status(500).json({ error: 'Could not reset password.' }); }
};

exports.setBan = async function(req, res) {
    if (typeof req.body?.isBanned !== 'boolean') return res.status(400).json({ error: 'isBanned must be true or false.' });
    try {
        const user = await target(req, res);
        if (!user) return;
        const updated = await dao.setBanned(user._id, req.body.isBanned);
        if (!updated) return res.status(404).json({ error: 'User not found.' });
        if (req.body.isBanned) sessions.revokeUser(user._id);
        res.json(updated);
    } catch (error) { res.status(500).json({ error: 'Could not change ban status.' }); }
};
