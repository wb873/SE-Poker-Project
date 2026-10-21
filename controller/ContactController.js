const dao = require('../model/ContactDao');

exports.postCreate = async function(req, res) {
    const body = req.body || {};
    const newcontact = {
        name: body.txt_name,
        email: body.txt_email,
        subject: body.txt_subject,
        message: body.txt_message
    };

    if (typeof newcontact.email !== 'string' || !newcontact.email.trim() ||
        typeof newcontact.message !== 'string' || !newcontact.message.trim()) {
        res.status(400);
        return res.json({ error: 'Email and message are required.' });
    }

    newcontact.email = newcontact.email.trim();
    newcontact.message = newcontact.message.trim();

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
