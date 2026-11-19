const { evaluateHand } = require("./game");

// How bots play their own hand (story L9). Bots play against the dealer like
// everyone else, so difficulty only changes how well a bot plays, never anyone
// else's result.
//
//   easy:   raises any pair or better, otherwise flips a coin; sometimes swaps a random card
//   medium: raises a pair or better or Ace-King high, otherwise folds; never swaps
//   hard:   medium's rules plus the usual Ace-King refinements, and swaps for
//           four-card flush and straight draws
//
// After a swap the hand stays open, so the caller asks again with canSwap false.

const DIFFICULTIES = ["easy", "medium", "hard"];
const EASY_SWAP_CHANCE = 0.15;

const isPairOrBetter = (hand) => evaluateHand(hand).score[0] > 0;
const hasAceKing = (hand) => hand.some((card) => card.value === 14) && hand.some((card) => card.value === 13);

// Hard bots raise Ace-King high only with extra help: a Queen or Jack alongside,
// or a card that pairs the dealer's up card (which makes the dealer less likely to pair).
function hardRaisesAceKing(hand, dealerUpCard) {
  if (!hasAceKing(hand)) return false;
  const others = hand.filter((card) => card.value !== 14 && card.value !== 13);
  if (others.some((card) => card.value === 12 || card.value === 11)) return true;
  return Boolean(dealerUpCard) && hand.some((card) => card.value === dealerUpCard.value);
}

// Index of the one card to throw away to keep four to a flush, or -1
function flushDrawDiscard(hand) {
  for (const card of hand) {
    const suited = hand.filter((other) => other.suit === card.suit);
    if (suited.length === 4) return hand.findIndex((other) => other.suit !== card.suit);
  }
  return -1;
}

// Index of the one card to throw away to keep four in a row (A can be low), or -1
function straightDrawDiscard(hand) {
  for (let skip = 0; skip < hand.length; skip++) {
    const kept = hand.filter((_, index) => index !== skip);
    const values = kept.map((card) => card.value);
    if (new Set(values).size !== 4) continue;
    for (const run of [values, values.map((value) => (value === 14 ? 1 : value))]) {
      if (Math.max(...run) - Math.min(...run) === 3) return skip;
    }
  }
  return -1;
}

function hardSwapIndex(hand) {
  if (isPairOrBetter(hand)) return -1;
  const flush = flushDrawDiscard(hand);
  if (flush !== -1) return flush;
  return straightDrawDiscard(hand);
}

// Returns { action: "swap", cardIndex } | { action: "raise" } | { action: "fold" }
function decideBotAction({ hand, dealerUpCard = null, difficulty = "medium", canSwap = false, random = Math.random }) {
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : "medium";
  const strong = isPairOrBetter(hand);

  if (level === "easy") {
    if (canSwap && !strong && random() < EASY_SWAP_CHANCE)
      return { action: "swap", cardIndex: Math.floor(random() * hand.length) };
    return { action: strong || random() < 0.5 ? "raise" : "fold" };
  }

  if (level === "medium") {
    return { action: strong || hasAceKing(hand) ? "raise" : "fold" };
  }

  if (canSwap) {
    const cardIndex = hardSwapIndex(hand);
    if (cardIndex !== -1) return { action: "swap", cardIndex };
  }
  return { action: strong || hardRaisesAceKing(hand, dealerUpCard) ? "raise" : "fold" };
}

module.exports = { decideBotAction, DIFFICULTIES };
