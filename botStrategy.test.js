const { decideBotAction } = require("./botStrategy");

const VALUES = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
// hand("A♠ K♥ 7♦ 4♣ 2♠") -> cards
const card = (text) => {
  const rank = text.slice(0, -1);
  return { rank, suit: text.slice(-1), value: VALUES[rank] };
};
const hand = (text) => text.split(" ").map(card);
const always = (value) => () => value;

const PAIR = hand("9♠ 9♥ 7♦ 4♣ 2♠");
const ACE_KING = hand("A♠ K♥ 7♦ 4♣ 2♠");
const ACE_KING_QUEEN = hand("A♠ K♥ Q♦ 4♣ 2♠");
const JUNK = hand("Q♠ 9♥ 7♦ 4♣ 2♠");
const FLUSH_DRAW = hand("A♠ 9♠ 7♠ 4♠ 2♥");
const STRAIGHT_DRAW = hand("8♠ 7♥ 6♦ 5♣ K♠");
const WHEEL_DRAW = hand("A♠ 2♥ 3♦ 4♣ 9♠");

describe("medium", () => {
  const decide = (cards, extra = {}) => decideBotAction({ hand: cards, difficulty: "medium", canSwap: true, ...extra });

  test("raises a pair or better", () => expect(decide(PAIR)).toEqual({ action: "raise" }));
  test("raises Ace-King high", () => expect(decide(ACE_KING)).toEqual({ action: "raise" }));
  test("folds anything weaker", () => expect(decide(JUNK)).toEqual({ action: "fold" }));
  test("never swaps, even with a draw", () => expect(decide(FLUSH_DRAW).action).not.toBe("swap"));
});

describe("hard", () => {
  const decide = (cards, extra = {}) =>
    decideBotAction({ hand: cards, difficulty: "hard", canSwap: true, dealerUpCard: card("5♦"), ...extra });

  test("raises a pair without swapping", () => expect(decide(PAIR)).toEqual({ action: "raise" }));
  test("folds bare Ace-King high", () => expect(decide(ACE_KING)).toEqual({ action: "fold" }));
  test("raises Ace-King with a Queen", () => expect(decide(ACE_KING_QUEEN)).toEqual({ action: "raise" }));
  test("raises Ace-King when a card matches the dealer's up card", () =>
    expect(decide(ACE_KING, { dealerUpCard: card("7♣") })).toEqual({ action: "raise" }));

  test("swaps the off-suit card from a flush draw", () =>
    expect(decide(FLUSH_DRAW)).toEqual({ action: "swap", cardIndex: 4 }));
  test("swaps the outlier from a straight draw", () =>
    expect(decide(STRAIGHT_DRAW)).toEqual({ action: "swap", cardIndex: 4 }));
  test("treats the Ace as low for A-2-3-4", () =>
    expect(decide(WHEEL_DRAW)).toEqual({ action: "swap", cardIndex: 4 }));
  test("does not swap again once canSwap is false", () =>
    expect(decide(FLUSH_DRAW, { canSwap: false }).action).not.toBe("swap"));
  test("folds junk with no draw", () => expect(decide(JUNK)).toEqual({ action: "fold" }));
});

describe("easy", () => {
  const decide = (cards, random, extra = {}) =>
    decideBotAction({ hand: cards, difficulty: "easy", canSwap: true, random, ...extra });

  test("always raises a pair", () => expect(decide(PAIR, always(0)).action).toBe("raise"));
  test("raises or folds junk on a coin flip", () => {
    expect(decide(JUNK, always(0.3)).action).toBe("raise");
    expect(decide(JUNK, always(0.9)).action).toBe("fold");
  });
  test("sometimes swaps a random card", () => {
    const rolls = [0.1, 0.5]; // swap roll, then card roll -> index 2
    expect(decide(JUNK, () => rolls.shift())).toEqual({ action: "swap", cardIndex: 2 });
  });
  test("does not swap when it cannot", () =>
    expect(decide(JUNK, always(0.1), { canSwap: false }).action).not.toBe("swap"));
});

test("unknown difficulty plays like medium", () => {
  expect(decideBotAction({ hand: ACE_KING, difficulty: "silly" })).toEqual({ action: "raise" });
});

test("returns a legal action for random hands at every difficulty", () => {
  const { createDeck } = require("./game");
  for (let i = 0; i < 300; i++) {
    const cards = createDeck().slice(0, 5);
    for (const difficulty of ["easy", "medium", "hard"]) {
      const choice = decideBotAction({ hand: cards, difficulty, canSwap: true, dealerUpCard: card("K♣") });
      expect(["raise", "fold", "swap"]).toContain(choice.action);
      if (choice.action === "swap") {
        expect(Number.isInteger(choice.cardIndex)).toBe(true);
        expect(choice.cardIndex).toBeGreaterThanOrEqual(0);
        expect(choice.cardIndex).toBeLessThan(5);
      }
    }
  }
});
