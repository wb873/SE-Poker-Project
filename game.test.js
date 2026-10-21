
const {
  createGame,
  getGame,
  getPublicState,
  applyAction,
  nextHand,
} = require("./game");

const STARTING_BALANCE = 1000;

// Build cards with the same structure used by game.js.
const VALUES = {
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
  8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14,
};

const card = (rank, suit) => ({
  rank: String(rank),
  suit,
  value: VALUES[rank],
});

const hand = (...cards) => cards;

// Replace dealt cards to make outcomes deterministic.
function setHands(game, playerHand, dealerHand) {
  const internalGame = getGame(game.gameId);
  internalGame.playerHand = playerHand;
  internalGame.dealerHand = dealerHand;
  internalGame.dealerUpCard = dealerHand[0];
  return internalGame;
}

describe("createGame", () => {
  test("creates a game with the default ante and starting balance", () => {
    const game = createGame();

    expect(game.gameId).toEqual(expect.any(String));
    expect(game.balance).toBe(STARTING_BALANCE - 10);
    expect(game.ante).toBe(10);
    expect(game.raiseAmount).toBe(20);
    expect(game.phase).toBe("decision");
    expect(game.antePlaced).toBe(true);
    expect(game.message).toBe("Choose Raise or Fold.");
  });

  test("creates a game with a custom ante", () => {
    const game = createGame(25);

    expect(game.ante).toBe(25);
    expect(game.raiseAmount).toBe(50);
    expect(game.balance).toBe(975);
  });

  test.each([0, -1, 1.5, NaN, Infinity, "10", null])(
    "rejects invalid ante: %s",
    (ante) => {
      expect(() => createGame(ante)).toThrow(
        "Ante must be a positive whole number."
      );
    }
  );

  test("rejects an ante larger than the starting balance", () => {
    expect(() => createGame(1001)).toThrow(
      "Not enough chips to place the ante."
    );
  });

  test("assigns each game a unique ID", () => {
    const first = createGame();
    const second = createGame();

    expect(first.gameId).not.toBe(second.gameId);
  });

  test("deals five cards to each player", () => {
    const game = createGame();

    expect(game.playerHand).toHaveLength(5);
    expect(game.dealerUpCard).toEqual(
      expect.objectContaining({
        rank: expect.any(String),
        suit: expect.any(String),
      })
    );
  });

  test("deals ten distinct cards from a standard deck", () => {
    const game = createGame();
    const internalGame = getGame(game.gameId);

    const cards = [
      ...internalGame.playerHand,
      ...internalGame.dealerHand,
    ];

    expect(cards).toHaveLength(10);

    const labels = cards.map((c) => `${c.rank}${c.suit}`);
    expect(new Set(labels).size).toBe(10);
  });
});

describe("getGame and getPublicState", () => {
  test("returns the internal game for a valid ID", () => {
    const game = createGame();

    expect(getGame(game.gameId)).toBeDefined();
    expect(getGame(game.gameId).id).toBe(game.gameId);
  });

  test("returns undefined for an unknown ID", () => {
    expect(getGame("unknown-game-id")).toBeUndefined();
  });

  test("does not expose the dealer's hidden cards during a decision", () => {
    const game = createGame();

    expect(game.phase).toBe("decision");
    expect(game.dealerHand).toBeNull();
  });

  test("exposes the dealer's cards after the hand finishes", () => {
    const game = createGame();

    applyAction(getGame(game.gameId), "fold");

    const updated = getPublicState(getGame(game.gameId));

    expect(updated.phase).toBe("done");
    expect(updated.dealerHand).toHaveLength(5);
  });

  test("does not expose card values in public hands", () => {
    const game = createGame();

    for (const c of game.playerHand) {
      expect(c).toHaveProperty("rank");
      expect(c).toHaveProperty("suit");
      expect(c).not.toHaveProperty("value");
    }
  });

  test("returns null for the dealer hand rank before the hand finishes", () => {
    const game = createGame();

    expect(game.dealerHandRank).toBeNull();
    expect(game.playerHandRank).toBeNull();
  });
});

describe("applyAction validation", () => {
  
test("throws when the game does not exist", () => {
  expect(() => applyAction(undefined, "fold")).toThrow(
    "Game not found."
  );
});


  test("rejects an invalid action", () => {
    const game = createGame();

    expect(() => applyAction(getGame(game.gameId), "check")).toThrow(
      "Choose either fold or raise."
    );
  });

  test("rejects actions after the hand is finished", () => {
    const game = createGame();

    applyAction(getGame(game.gameId), "fold");

    expect(() => applyAction(getGame(game.gameId), "raise")).toThrow(
      "This hand is not accepting actions."
    );
  });

  test("rejects a raise when the player cannot afford it", () => {
    const game = createGame();
    const internalGame = getGame(game.gameId);

    internalGame.balance = internalGame.raiseAmount - 1;

    expect(() => applyAction(getGame(game.gameId), "raise")).toThrow(
      "Not enough chips to raise."
    );
  });

  test("does not deduct the raise when a raise is rejected", () => {
    const game = createGame();
    const internalGame = getGame(game.gameId);

    internalGame.balance = 19;
    const balanceBefore = internalGame.balance;

    expect(() => applyAction(getGame(game.gameId), "raise")).toThrow(
      "Not enough chips to raise."
    );

    expect(internalGame.balance).toBe(balanceBefore);
    expect(internalGame.phase).toBe("decision");
  });
});

describe("fold action", () => {
  test("finishes the hand and loses the ante", () => {
    const game = createGame();
    const result = applyAction(getGame(game.gameId), "fold");

    expect(result.phase).toBe("done");
    expect(result.result).toBe("fold");
    expect(result.balance).toBe(990);
    expect(result.message).toBe("You folded and lost your ante.");
    expect(result.playerHandRank).toEqual(expect.any(String));
    expect(result.dealerHandRank).toBeNull();
    expect(result.dealerHand).toHaveLength(5);
  });

  test("does not charge the raise when folding", () => {
    const game = createGame();

    const result = applyAction(getGame(game.gameId), "fold");

    expect(result.balance).toBe(STARTING_BALANCE - game.ante);
  });
});

describe("raise action and payouts", () => {
  test("wins when the dealer does not qualify", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("A", "♠"),
        card("A", "♥"),
        card("7", "♦"),
        card("5", "♣"),
        card("2", "♠")
      ),
      hand(
        card("Q", "♠"),
        card("10", "♥"),
        card("8", "♦"),
        card("5", "♠"),
        card("2", "♥")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.phase).toBe("done");
    expect(result.result).toBe("dealer_not_qualified");
    expect(result.playerHandRank).toBe("One Pair");
    expect(result.dealerHandRank).toBe("High Card");
    expect(result.balance).toBe(1010);
    expect(result.dealerHand).toHaveLength(5);
  });

  test("pays a winning one-pair hand against a qualifying dealer", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("A", "♠"),
        card("A", "♥"),
        card("K", "♦"),
        card("9", "♣"),
        card("4", "♠")
      ),
      hand(
        card("K", "♠"),
        card("K", "♥"),
        card("Q", "♦"),
        card("8", "♣"),
        card("3", "♠")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.result).toBe("win");
    expect(result.playerHandRank).toBe("One Pair");
    expect(result.dealerHandRank).toBe("One Pair");
    expect(result.balance).toBe(1030);
    expect(result.message).toContain("You win with One Pair!");
  });

  test("loses both bets when the dealer has the stronger hand", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("2", "♠"),
        card("2", "♥"),
        card("K", "♦"),
        card("9", "♣"),
        card("4", "♠")
      ),
      hand(
        card("3", "♠"),
        card("3", "♥"),
        card("Q", "♦"),
        card("8", "♣"),
        card("5", "♠")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.result).toBe("loss");
    expect(result.balance).toBe(970);
    expect(result.message).toContain("Dealer wins with One Pair.");
  });

  test("returns both bets when the hands tie", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("A", "♠"),
        card("K", "♥"),
        card("Q", "♦"),
        card("J", "♣"),
        card("9", "♠")
      ),
      hand(
        card("A", "♥"),
        card("K", "♦"),
        card("Q", "♣"),
        card("J", "♠"),
        card("9", "♥")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.result).toBe("push");
    expect(result.balance).toBe(1000);
    expect(result.message).toBe(
      "It's a tie. Both bets are returned."
    );
  });

  test("pays the correct multiplier for a straight flush", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("9", "♠"),
        card("8", "♠"),
        card("7", "♠"),
        card("6", "♠"),
        card("5", "♠")
      ),
      hand(
        card("A", "♥"),
        card("A", "♦"),
        card("A", "♣"),
        card("K", "♥"),
        card("K", "♦")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.result).toBe("win");
    expect(result.playerHandRank).toBe("Straight Flush");
    expect(result.dealerHandRank).toBe("Full House");
    expect(result.balance).toBe(2010);
  });

  test("pays the correct multiplier for a royal flush", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("A", "♠"),
        card("K", "♠"),
        card("Q", "♠"),
        card("J", "♠"),
        card("10", "♠")
      ),
      hand(
        card("9", "♥"),
        card("9", "♦"),
        card("9", "♣"),
        card("8", "♥"),
        card("8", "♦")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.result).toBe("win");
    expect(result.playerHandRank).toBe("Royal Flush");
    expect(result.balance).toBe(3010);
  });

  test("recognizes an ace-low straight flush", () => {
    const game = createGame();

    setHands(
      game,
      hand(
        card("A", "♠"),
        card("2", "♠"),
        card("3", "♠"),
        card("4", "♠"),
        card("5", "♠")
      ),
      hand(
        card("9", "♥"),
        card("9", "♦"),
        card("9", "♣"),
        card("8", "♥"),
        card("8", "♦")
      )
    );

    const result = applyAction(getGame(game.gameId), "raise");

    expect(result.playerHandRank).toBe("Straight Flush");
    expect(result.result).toBe("win");
    expect(result.balance).toBe(2010);
  });
});

describe("nextHand", () => {
  test("rejects starting another hand before finishing the current one", () => {
    const game = createGame();

    expect(() => nextHand(getGame(game.gameId))).toThrow(
      "Finish the current hand before starting another."
    );
  });

  test("throws when the game does not exist", () => {
  expect(() => applyAction(undefined, "fold")).toThrow(
    "Game not found."
  );
});

  test("starts a new hand after folding", () => {
    const game = createGame();

    applyAction(getGame(game.gameId), "fold");

    const result = nextHand(getGame(game.gameId));

    expect(result.phase).toBe("decision");
    expect(result.result).toBeNull();
    expect(result.antePlaced).toBe(true);
    expect(result.balance).toBe(980);
    expect(result.playerHand).toHaveLength(5);
    expect(result.dealerHand).toBeNull();
    expect(result.playerHandRank).toBeNull();
    expect(result.dealerHandRank).toBeNull();
    expect(result.message).toBe("Choose Raise or Fold.");
  });

  test("preserves the game ID and ante between hands", () => {
    const game = createGame(25);

    applyAction(getGame(game.gameId), "fold");

    const next = nextHand(getGame(game.gameId));

    expect(next.gameId).toBe(game.gameId);
    expect(next.ante).toBe(25);
    expect(next.raiseAmount).toBe(50);
  });
});
