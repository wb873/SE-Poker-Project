const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: String,
    email: { type: String, required: true },
    subject: String,
    message: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reply: { type: String, default: '' },
    repliedAt: Date,
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

exports.readMine = (userId) => contactModel.find({ userId }).sort({ creation: -1 });
exports.respond = (id, reply) => {
    if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
    return contactModel.findByIdAndUpdate(id, { reply, repliedAt: new Date(), status: 1 }, { returnDocument: 'after', runValidators: true });
};

// Only call this against a dedicated test database.
exports.deleteAll = async function() {
    await contactModel.deleteMany({});
};
