const dao = require('../model/ContactDao');

exports.postCreate = async function(req, res) {
    const body = req.body || {};
    const newcontact = {
        name: body.txt_name,
        email: body.txt_email,
        subject: body.txt_subject,
        message: body.txt_message
    };
    // Identity comes from the session, never a submitted user ID or email.
    if (req.user) {
        newcontact.userId = req.user._id;
        newcontact.name = req.user.username;
        newcontact.email = req.user.email;
    }

    if (typeof newcontact.email !== 'string' || !newcontact.email.trim() ||
        typeof newcontact.message !== 'string' || !newcontact.message.trim()) {
        res.status(400);
        return res.json({ error: 'Email and message are required.' });
    }

    newcontact.email = newcontact.email.trim();
    newcontact.message = newcontact.message.trim();
    if (newcontact.message.length > 5000 || (newcontact.subject != null && (typeof newcontact.subject !== 'string' || newcontact.subject.length > 150))) {
        res.status(400);
        return res.json({ error: 'Use a subject of up to 150 characters and a message of up to 5000 characters.' });
    }

    try {
        const contact = await dao.create(newcontact);
        if (!contact || !contact._id) {
            res.status(400);
            return res.json({ error: 'Unable to create contact message.' });
        }

        res.status(201);
        return res.json({ message: 'Your message has been sent to the admin.' });
    } catch (error) {
        res.status(error.name === 'ValidationError' ? 400 : 500);
        return res.json({ error: 'Unable to create contact message.' });
    }
};

exports.getMine = async function(req, res) {
    try { res.json(await dao.readMine(req.user._id)); }
    catch (error) { res.status(500).json({ error: 'Unable to retrieve your messages.' }); }
};

exports.respond = async function(req, res) {
    const reply = req.body?.reply;
    if (typeof reply !== 'string' || !reply.trim() || reply.length > 5000)
        return res.status(400).json({ error: 'A response of 1-5000 characters is required.' });
    try {
        const contact = await dao.respond(req.params.id, reply.trim());
        if (!contact) return res.status(404).json({ error: 'Message not found.' });
        res.json(contact);
    } catch (error) { res.status(500).json({ error: 'Unable to save response.' }); }
};

// Protect the Express route with admin authentication middleware.
exports.getAll = async function(req, res) {
    try {
        const contacts = await dao.readAll();
        res.status(200);
        return res.json(contacts);
    } catch (error) {
        res.status(500);
        return res.json({ error: 'Unable to retrieve contact messages.' });
    }
};
