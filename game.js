
const { randomUUID } = require("crypto");

const games = new Map();
const STARTING_BALANCE = 1000;
const DEFAULT_ANTE = 10;

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 11 },
  { rank: "Q", value: 12 },
  { rank: "K", value: 13 },
  { rank: "A", value: 14 },
];

// Create and shuffle a standard 52-card deck.
function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const card of RANKS) {
      deck.push({ rank: card.rank, suit, value: card.value });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

function combinations(values) {
  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
}

// Returns a comparable score: higher score means a stronger hand.
function evaluateHand(hand) {
  if (!Array.isArray(hand) || hand.length !== 5) {
    throw new Error("A poker hand must contain exactly five cards.");
  }

  const values = hand.map((card) => card.value).sort((a, b) => b - a);
  const isFlush = hand.every((card) => card.suit === hand[0].suit);

  let isStraight = values.every(
    (value, index) => index === 0 || values[index - 1] - value === 1
  );
  let straightHigh = values[0];

  // Ace can be low in A-2-3-4-5.
  if (
    values.join(",") === "14,5,4,3,2"
  ) {
    isStraight = true;
    straightHigh = 5;
  }

  const groups = combinations(values);
  const counts = groups.map((group) => group.count);
  const groupedValues = groups.map((group) => group.value);

  if (isStraight && isFlush) {
    if (straightHigh === 14) {
      return { score: [9, 14], rank: "Royal Flush", payout: 100 };
    }
    return { score: [8, straightHigh], rank: "Straight Flush", payout: 50 };
  }

  if (counts[0] === 4) {
    return {
      score: [7, groupedValues[0], groupedValues[1]],
      rank: "Four of a Kind",
      payout: 20,
    };
  }

  if (counts[0] === 3 && counts[1] === 2) {
    return {
      score: [6, groupedValues[0], groupedValues[1]],
      rank: "Full House",
      payout: 7,
    };
  }

  if (isFlush) {
    return { score: [5, ...values], rank: "Flush", payout: 5 };
  }

  if (isStraight) {
    return { score: [4, straightHigh], rank: "Straight", payout: 4 };
  }

  if (counts[0] === 3) {
    const kickers = groups
      .filter((group) => group.count === 1)
      .map((group) => group.value)
      .sort((a, b) => b - a);

    return {
      score: [3, groupedValues[0], ...kickers],
      rank: "Three of a Kind",
      payout: 3,
    };
  }

  if (counts[0] === 2 && counts[1] === 2) {
    return {
      score: [
        2,
        Math.max(groupedValues[0], groupedValues[1]),
        Math.min(groupedValues[0], groupedValues[1]),
        groupedValues[2],
      ],
      rank: "Two Pair",
      payout: 2,
    };
  }

  if (counts[0] === 2) {
    const kickers = groups
      .filter((group) => group.count === 1)
      .map((group) => group.value)
      .sort((a, b) => b - a);

    return {
      score: [1, groupedValues[0], ...kickers],
      rank: "One Pair",
      payout: 1,
    };
  }

  return { score: [0, ...values], rank: "High Card", payout: 1 };
}

function compareHands(first, second) {
  const a = evaluateHand(first).score;
  const b = evaluateHand(second).score;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;

    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

// Dealer qualifies with a pair or better, or Ace-King high or better.
function dealerQualifies(hand) {
  const result = evaluateHand(hand);

  if (result.score[0] > 0) return true;

  return result.score[1] === 14 && result.score[2] === 13;
}

function startHand(game) {
  if (game.balance < game.ante) {
    throw new Error("Not enough chips to place the ante.");
  }

  game.balance -= game.ante;

  const deck = createDeck();
  game.playerHand = deck.splice(0, 5);
  game.dealerHand = deck.splice(0, 5);
  game.dealerUpCard = game.dealerHand[0];

  game.raiseAmount = game.ante * 2;
  game.phase = "decision";
  game.result = null;
  game.message = "Choose Raise or Fold.";
  game.playerHandRank = null;
  game.dealerHandRank = null;
  game.antePlaced = true;

  return getPublicState(game);
}

function createGame(ante = DEFAULT_ANTE) {
  if (!Number.isSafeInteger(ante) || ante < 1) {
    throw new Error("Ante must be a positive whole number.");
  }

  const game = {
    id: randomUUID(),
    balance: STARTING_BALANCE,
    ante,
    raiseAmount: ante * 2,
    phase: "waiting",
    playerHand: [],
    dealerHand: [],
    dealerUpCard: null,
    antePlaced: false,
    result: null,
    message: "Ready to start a hand.",
    playerHandRank: null,
    dealerHandRank: null,
  };

  games.set(game.id, game);
  startHand(game);

  return getPublicState(game);
}

function getGame(gameId) {
  return games.get(gameId);
}

function getPublicState(game) {
  const finished = game.phase === "done";

  return {
    gameId: game.id,
    balance: game.balance,
    ante: game.ante,
    raiseAmount: game.raiseAmount,
    phase: game.phase,
    playerHand: game.playerHand.map(({ rank, suit }) => ({ rank, suit })),
    dealerUpCard: game.dealerUpCard
      ? { rank: game.dealerUpCard.rank, suit: game.dealerUpCard.suit }
      : null,
    // Never send the dealer's hidden cards before the hand is over.
    dealerHand: finished
      ? game.dealerHand.map(({ rank, suit }) => ({ rank, suit }))
      : null,
    playerHandRank: game.playerHandRank,
    dealerHandRank: game.dealerHandRank,
    result: game.result,
    message: game.message,
    antePlaced: game.antePlaced,
  };
}

function applyAction(game, action) {
  if (!game) throw new Error("Game not found.");
  if (game.phase !== "decision") {
    throw new Error("This hand is not accepting actions.");
  }

  if (action === "fold") {
    game.phase = "done";
    game.result = "fold";
    game.message = "You folded and lost your ante.";
    game.playerHandRank = evaluateHand(game.playerHand).rank;
    game.dealerHandRank = null;

    return getPublicState(game);
  }

  if (action !== "raise") {
    throw new Error("Choose either fold or raise.");
  }

  if (game.balance < game.raiseAmount) {
    throw new Error("Not enough chips to raise.");
  }

  // The raise must be exactly twice the ante.
  game.balance -= game.raiseAmount;

  const player = evaluateHand(game.playerHand);
  const dealer = evaluateHand(game.dealerHand);

  game.playerHandRank = player.rank;
  game.dealerHandRank = dealer.rank;
  game.phase = "done";

  if (!dealerQualifies(game.dealerHand)) {
    // Ante wins even money; raise is returned.
    game.balance += game.ante * 2 + game.raiseAmount;
    game.result = "dealer_not_qualified";
    game.message =
      "Dealer does not qualify. Your ante wins even money and your raise is returned.";
    return getPublicState(game);
  }

  const comparison = compareHands(game.playerHand, game.dealerHand);

  if (comparison > 0) {
    // Return raise stake plus its winnings, and pay the ante even money.
    game.balance += game.ante * 2 + game.raiseAmount * (player.payout + 1);
    game.result = "win";
    game.message =
      `You win with ${player.rank}! Raise pays ${player.payout}:1.`;
  } else if (comparison < 0) {
    game.result = "loss";
    game.message = `Dealer wins with ${dealer.rank}. You lose both bets.`;
  } else {
    // Return both bets on a tie.
    game.balance += game.ante + game.raiseAmount;
    game.result = "push";
    game.message = "It's a tie. Both bets are returned.";
  }

  return getPublicState(game);
}

function nextHand(game) {
  if (!game) throw new Error("Game not found.");
  if (game.phase !== "done") {
    throw new Error("Finish the current hand before starting another.");
  }

  return startHand(game);
}

module.exports = {
  createGame,
  getGame,
  getPublicState,
  applyAction,
  nextHand,
};
