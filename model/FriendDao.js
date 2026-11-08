const mongoose = require("mongoose");

//One document per pair of players (F1-F3)
const friendshipSchema = new mongoose.Schema(
    {
        requester : { type: String, required: true, trim: true },
        recipient : { type: String, required: true, trim: true },
        status: { type : String, enum: ["pending", "accepted"], default: "pending" },
    },
    { timestamps: true }
);

const Friendship = mongoose.models.Friendship || mongoose.model("Friendship", friendshipSchema);

//the friendship between two players, whichever of them sent the request
exports.findBetween = (a, b) =>
    Friendship.findOne({
        $or: [
            { requester: a, recipient: b },
            { requester: b, recipient: a },
        ],
    }).lean();

//every friendship and request this player is part of
exports.listFor = (username) =>
    Friendship.find({ $or: [{ requester: username}, { recipient: username}] })
        .sort({ updatedAt: -1 })
        .lean();

exports.create = (requester, recipient) => Friendship.create({ requester, recipient });

exports.accept = (id) => Friendship.updateOne({ _id: id}, { status: "accepted"});

exports.remove = (id) => Friendship.deleteOne({ _id: id });

exports.deleteAll = () => Friendship.deleteMany({}); // tests only
