const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: String,
    email: { type: String, required: true },
    subject: String,
    message: String,
    status: { type: Number, default: 0 },
    creation: { type: Date, default: Date.now }
});

const contactModel = mongoose.model('contact', contactSchema);

exports.create = async function(contactdata) {
    const newContact = new contactModel(contactdata);
    await newContact.save();
    return newContact;
};

exports.readAll = async function() {
    return await contactModel.find();
};

// Only call this against a dedicated test database.
exports.deleteAll = async function() {
    await contactModel.deleteMany({});
};
