// R1: placeholder ads. No credits are given; real ad content comes later.
const PLACEHOLDER_ADS = [
  { id: 1, title: "Your Ad Here", body: "Advertise with Caribbean Stud Poker." },
  { id: 2, title: "Sponsored", body: "This is a placeholder advertisement." },
  { id: 3, title: "Ad Space Available", body: "Placeholder for a future advertisement." },
];

// GET /api/ads
exports.getAd = function (req, res) {
  const ad = PLACEHOLDER_ADS[Math.floor(Math.random() * PLACEHOLDER_ADS.length)];
  res.json({ success: true, ad });
};

exports.PLACEHOLDER_ADS = PLACEHOLDER_ADS;