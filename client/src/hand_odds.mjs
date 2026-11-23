const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

// Accept the public card shape (rank and suit); never accept table state or a deck.
function cardId(card) {
  const rank = RANKS.indexOf(card?.rank);
  const suit = SUITS.indexOf(card?.suit);
  return rank < 0 || suit < 0 ? -1 : suit * 13 + rank;
}

// Fixed-width base-15 scores preserve category and every kicker for comparisons.
function strength(hand) {
  const counts = new Uint8Array(15);
  const suit = Math.floor(hand[0] / 13);
  let flush = true;
  for (const card of hand) {
    counts[card % 13 + 2]++;
    if (Math.floor(card / 13) !== suit) flush = false;
  }
  const values = [];
  const groups = [[], [], [], [], []];
  for (let value = 14; value >= 2; value--) {
    if (counts[value]) {
      values.push(value);
      groups[counts[value]].push(value);
    }
  }
  let straight = 0;
  if (values.length === 5) {
    if (values[0] - values[4] === 4) straight = values[0];
    else if (values.join(",") === "14,5,4,3,2") straight = 5;
  }
  let category;
  let kickers;
  if (flush && straight) [category, kickers] = [8, [straight]];
  else if (groups[4].length) [category, kickers] = [7, [...groups[4], ...groups[1]]];
  else if (groups[3].length && groups[2].length) [category, kickers] = [6, [...groups[3], ...groups[2]]];
  else if (flush) [category, kickers] = [5, values];
  else if (straight) [category, kickers] = [4, [straight]];
  else if (groups[3].length) [category, kickers] = [3, [...groups[3], ...groups[1]]];
  else if (groups[2].length === 2) [category, kickers] = [2, [...groups[2], ...groups[1]]];
  else if (groups[2].length) [category, kickers] = [1, [...groups[2], ...groups[1]]];
  else [category, kickers] = [0, values];
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] ?? 0);
  return score;
}

// Exact P(player's current hand > dealer's hand), with ties excluded.
// Only these six visible cards are removed from a fresh standard deck. Other
// players' hands, the actual dealer hole cards, discards and deck order are unknown.
export function calculateHandOdds(playerHand, dealerUpCard) {
  if (!Array.isArray(playerHand) || playerHand.length !== 5) return null;
  const player = playerHand.map(cardId);
  const up = cardId(dealerUpCard);
  const known = new Set([...player, up]);
  if (known.size !== 6 || known.has(-1)) return null;
  const unseen = Array.from({ length: 52 }, (_, id) => id).filter((id) => !known.has(id));
  const playerScore = strength(player);
  const dealer = [up, 0, 0, 0, 0];
  let wins = 0;
  let total = 0;
  for (let a = 0; a < unseen.length - 3; a++) {
    dealer[1] = unseen[a];
    for (let b = a + 1; b < unseen.length - 2; b++) {
      dealer[2] = unseen[b];
      for (let c = b + 1; c < unseen.length - 1; c++) {
        dealer[3] = unseen[c];
        for (let d = c + 1; d < unseen.length; d++) {
          dealer[4] = unseen[d];
          if (playerScore > strength(dealer)) wins++;
          total++;
        }
      }
    }
  }
  return { wins, total, probability: wins / total };
}
