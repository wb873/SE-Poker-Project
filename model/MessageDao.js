const mongoose = require("mongoose");

// One document per message between two friends (F4)
const messageSchema = new mongoose.Schema(
  {
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

exports.create = (from, to, text) => Message.create({ from, to, text });

// The latest messages between two players, oldest first so they read top to bottom
exports.conversation = async (a, b, limit = 50) => {
  const latest = await Message.find({
    $or: [
      { from: a, to: b },
      { from: b, to: a },
    ],
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
  return latest.reverse();
};

exports.deleteAll = () => Message.deleteMany({}); // tests only