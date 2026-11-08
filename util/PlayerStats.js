const HAND_RANKS = [
    'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];
exports.HAND_RANKS = HAND_RANKS;

exports.toPublicStats = function(stats = {}) {
    const handsPlayed = stats.handsPlayed ?? 0;
    const handsWon = stats.handsWon ?? 0;
    return {
        handsPlayed, handsWon,
        winRate: handsPlayed > 0 ? Number((handsWon / handsPlayed * 100).toFixed(2)) : 0,
        totalWinnings: stats.totalWinnings ?? 0,
        biggestWin: stats.biggestWin ?? 0,
        bestHand: HAND_RANKS[stats.bestHandRank] || null,
        timesFolded: stats.timesFolded ?? 0,
        sideBetWinnings: null,
    };
};
