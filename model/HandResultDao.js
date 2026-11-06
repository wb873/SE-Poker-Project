const mongoose = require("mongoose");

// One document per finished hand by a logged-in player (LB1)
const handResultSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    net: { type: Number, required: true }, // chips won (+) or lost (-) on the hand
    result: { type: String, required: true }, // win, loss, push, fold or dealer_not_qualified
  },
  { timestamps: true }
);

const HandResult = mongoose.models.HandResult || mongoose.model("HandResult", handResultSchema);

exports.record = (username, net, result) => HandResult.create({ username, net, result });

// Players ranked by total net chips since a date, best first
exports.leaderboard = (since, limit = 20) =>
  HandResult.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$username", net: { $sum: "$net" }, hands: { $sum: 1 } } },
    { $sort: { net: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, username: "$_id", net: 1, hands: 1 } },
  ]);

exports.deleteAll = () => HandResult.deleteMany({}); // tests only