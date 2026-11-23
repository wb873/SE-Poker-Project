import { test, expect } from "@jest/globals";
import { createRequire } from "node:module";
import { calculateHandOdds } from "./hand_odds.mjs";

const { compareHands } = createRequire(import.meta.url)("../../game.js");
const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const card = (rank, suit) => ({ rank, suit, value: ranks.indexOf(rank) + 2 });
const hand = (ranksInHand, suitsInHand = suits.concat(suits[0])) =>
  ranksInHand.map((rank, i) => card(rank, suitsInHand[i]));
const total = 163185; // C(46, 4)

// Independent oracle: use the game's existing evaluator and enumerate all
// possible hidden dealer cards, without knowing the game's actual deck.
function referenceWins(player, up) {
  const known = [...player, up];
  const deck = suits.flatMap((suit) => ranks.map((rank) => card(rank, suit)))
    .filter((c) => !known.some((k) => c.rank === k.rank && c.suit === k.suit));
  let wins = 0;
  for (let a = 0; a < 43; a++)
    for (let b = a + 1; b < 44; b++)
      for (let c = b + 1; c < 45; c++)
        for (let d = c + 1; d < 46; d++)
          if (compareHands(player, [up, deck[a], deck[b], deck[c], deck[d]]) > 0) wins++;
  return wins;
}

test("royal flush excludes the one possible tied dealer royal flush", () => {
  const player = hand(["A", "K", "Q", "J", "10"], Array(5).fill("♠"));
  expect(calculateHandOdds(player, card("A", "♥")))
    .toEqual({ wins: total - 1, total, probability: (total - 1) / total });
});

test("beating the dealer means a stronger hand, independent of qualification payouts", () => {
  expect(calculateHandOdds(hand(["7", "5", "4", "3", "2"]), card("A", "♥")))
    .toEqual({ wins: 0, total, probability: 0 });
});

test.each([
  ["high card", hand(["A", "K", "9", "6", "3"])],
  ["pair", hand(["Q", "Q", "9", "6", "3"])],
  ["two pair", hand(["Q", "Q", "9", "9", "3"])],
  ["trips", hand(["Q", "Q", "Q", "6", "3"])],
  ["ace-low straight", hand(["A", "2", "3", "4", "5"])],
  ["straight", hand(["9", "8", "7", "6", "5"])],
  ["flush", hand(["A", "J", "8", "6", "3"], Array(5).fill("♠"))],
  ["full house", hand(["Q", "Q", "Q", "6", "6"])],
  ["quads", hand(["Q", "Q", "Q", "Q", "3"])],
  ["straight flush", hand(["9", "8", "7", "6", "5"], Array(5).fill("♠"))],
])("exact %s odds agree with the game's evaluator", (_, player) => {
  const up = card("K", "♣");
  const expected = referenceWins(player, up);
  expect(calculateHandOdds(player, up)).toEqual({ wins: expected, total, probability: expected / total });
}, 30000);

test("only visible rank/suit matter; inputs are unchanged and swapping recalculates", () => {
  const player = hand(["Q", "Q", "9", "6", "3"]);
  const up = card("K", "♣");
  const snapshot = JSON.stringify([player, up]);
  const before = calculateHandOdds(player, up);
  const visibleOnly = player.map(({ rank, suit }) => ({ rank, suit, value: 99 }));
  expect(calculateHandOdds(visibleOnly, { ...up, value: 2 })).toEqual(before);
  expect(calculateHandOdds([...player.slice(0, 4), card("Q", "♦")], up).probability)
    .toBeGreaterThan(before.probability);
  expect(JSON.stringify([player, up])).toBe(snapshot);
});

test("missing, hidden, duplicate and invalid cards cannot produce odds", () => {
  const player = hand(["Q", "Q", "9", "6", "3"]);
  for (const [cards, up] of [
    [null, card("A", "♥")], [player.slice(1), card("A", "♥")],
    [player, null], [player, player[0]], [[...player.slice(1), player[1]], card("A", "♥")],
    [player, { rank: "unknown", suit: "♥" }],
  ]) expect(calculateHandOdds(cards, up)).toBeNull();
});
