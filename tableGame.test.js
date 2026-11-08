const tableGame = require("./tableGame");

const VALUES = { 2: 2, 5: 5, 8: 8, 10: 10, Q: 12, K: 13, A: 14 };
const c = (rank, suit) => ({ rank: String(rank), suit, value: VALUES[rank] });

let counter = 0;
function newTable(names = ["a", "b"]) {
  const table = tableGame.getOrCreateTable({ _id: `test${counter++}`, ante: 10, turnTimer: 30 });
  names.forEach((name) => tableGame.sitDown(table, name));
  tableGame.startHand(table);
  return table;
}

test("every seat antes and gets five cards", () => {
  const table = newTable();
  for (const seat of table.seats.values()) {
    expect(seat.hand).toHaveLength(5);
    expect(seat.balance).toBe(990);
  }
});

test("the hand settles only after every seat has acted", () => {
  const table = newTable();
  tableGame.act(table, "a", "fold");
  expect(table.phase).toBe("decision");
  tableGame.act(table, "b", "fold");
  expect(table.phase).toBe("done");
});

test("each raising seat is paid separately", () => {
  const table = newTable();
  // Dealer has Q-high, so does not qualify
  table.dealerHand = [c("Q", "♠"), c(10, "♥"), c(8, "♦"), c(5, "♠"), c(2, "♥")];
  tableGame.act(table, "a", "raise");
  tableGame.act(table, "b", "fold");
  expect(table.seats.get("a").balance).toBe(1010);
  expect(table.seats.get("b").balance).toBe(990);
});

test("other players' cards are hidden until the showdown", () => {
  const table = newTable();
  const view = tableGame.publicState(table, "a");
  expect(view.seats.find((s) => s.username === "a").hand).toHaveLength(5);
  expect(view.seats.find((s) => s.username === "b").hand).toBeNull();
  expect(view.dealerHand).toBeNull();
});

test("running out the timer folds everyone still deciding", () => {
  const table = newTable();
  tableGame.act(table, "a", "raise");
  tableGame.foldIdle(table);
  expect(table.phase).toBe("done");
  expect(table.seats.get("b").status).toBe("folded");
});

test("a seat can't act twice", () => {
  const table = newTable();
  tableGame.act(table, "a", "fold");
  expect(() => tableGame.act(table, "a", "raise")).toThrow("You can't act right now.");
});

const hand5 = (...cards) => cards;

test("a swap costs 2x the ante and can only be used once", () => {
  const table = newTable();
  const before = table.seats.get("a").hand[0];
  tableGame.act(table, "a", "swap", 0);
  const seat = table.seats.get("a");
  expect(seat.balance).toBe(970);
  expect(seat.hand[0]).not.toBe(before);
  expect(seat.status).toBe("deciding"); // hand stays open
  expect(() => tableGame.act(table, "a", "swap", 1)).toThrow("You already swapped a card this hand.");
});

test("a winning raise against a qualifying dealer pays the pair", () => {
  const table = newTable();
  table.seats.get("a").hand = hand5(c("A", "♠"), c("A", "♥"), c("K", "♦"), c(8, "♣"), c(5, "♠"));
  table.dealerHand = hand5(c("K", "♠"), c("K", "♥"), c("Q", "♦"), c(8, "♦"), c(2, "♠"));
  tableGame.act(table, "a", "raise");
  tableGame.act(table, "b", "fold");
  expect(table.seats.get("a").result).toBe("win");
  expect(table.seats.get("a").balance).toBe(1030);
});

test("a losing raise loses both bets", () => {
  const table = newTable();
  table.seats.get("a").hand = hand5(c(2, "♠"), c(2, "♥"), c("K", "♦"), c(8, "♣"), c(5, "♠"));
  table.dealerHand = hand5(c("K", "♠"), c("K", "♥"), c("Q", "♦"), c(8, "♦"), c(10, "♠"));
  tableGame.act(table, "a", "raise");
  tableGame.act(table, "b", "fold");
  expect(table.seats.get("a").result).toBe("loss");
  expect(table.seats.get("a").balance).toBe(970);
});

test("a seat without enough chips sits the hand out", () => {
  const table = tableGame.getOrCreateTable({ _id: `test${counter++}`, ante: 10, turnTimer: 30 });
  tableGame.sitDown(table, "a");
  tableGame.sitDown(table, "broke");
  table.seats.get("broke").balance = 5;
  tableGame.startHand(table);
  expect(table.seats.get("broke").hand).toHaveLength(0);
  expect(table.seats.get("broke").balance).toBe(5);
  tableGame.act(table, "a", "fold"); // the broke seat doesn't block settling
  expect(table.phase).toBe("done");
});

test("a new hand can't start while one is in progress", () => {
  const table = newTable();
  expect(() => tableGame.startHand(table)).toThrow("A hand is already in progress.");
});

test("leaving mid-hand folds, and the seat is removed once the hand settles", () => {
  const table = newTable();
  tableGame.leave(table, "a");
  expect(table.seats.get("a").status).toBe("folded");
  tableGame.act(table, "b", "fold");
  expect(table.phase).toBe("done");
  expect(table.seats.has("a")).toBe(false);
});

test("leaving between hands removes the seat immediately", () => {
  const table = newTable();
  tableGame.foldIdle(table); // settles the hand
  tableGame.leave(table, "a");
  expect(table.seats.has("a")).toBe(false);
});

test("at showdown raised hands are shown, folded hands stay hidden", () => {
  const table = newTable();
  tableGame.act(table, "a", "raise");
  tableGame.act(table, "b", "fold");
  const spectator = tableGame.publicState(table, null);
  expect(spectator.dealerHand).toHaveLength(5);
  expect(spectator.seats.find((s) => s.username === "a").hand).toHaveLength(5);
  expect(spectator.seats.find((s) => s.username === "b").hand).toBeNull();
  expect(spectator.canSwap).toBe(false);
});

describe("account balances", () => {
  const account = (id, balance) => ({ _id: id, balance });

  function tableWith(seats) {
    const table = tableGame.getOrCreateTable({ _id: `acct${counter++}`, ante: 10, turnTimer: 30 });
    for (const [name, acct] of seats) tableGame.sitDown(table, name, acct);
    return table;
  }

  test("a logged-in seat starts with the account balance, a guest with 1,000", () => {
    const table = tableWith([["a", account("u1", 5000)], ["guest", null]]);
    expect(table.seats.get("a")).toMatchObject({ userId: "u1", balance: 5000 });
    expect(table.seats.get("guest")).toMatchObject({ userId: null, balance: 1000 });
  });

  test("sitting down again between hands picks up chips added to the account", () => {
    const table = tableWith([["a", account("u1", 0)]]);
    tableGame.sitDown(table, "a", account("u1", 500)); // refilled from the main menu
    expect(table.seats.get("a").balance).toBe(500);
  });

  test("sitting down again mid-hand keeps the seat's balance", () => {
    const table = tableWith([["a", account("u1", 100)]]);
    tableGame.startHand(table);
    tableGame.sitDown(table, "a", account("u1", 100)); // reconnect: the ante is already bet
    expect(table.seats.get("a").balance).toBe(90);
  });

  test("settling records each logged-in player's net for the hand, not guests'", () => {
    const table = tableWith([["a", account("u1", 1000)], ["b", account("u2", 1000)], ["guest", null]]);
    tableGame.startHand(table);
    // Dealer has Q-high, so does not qualify: a raiser wins the ante and gets the raise back
    table.dealerHand = [c("Q", "♠"), c(10, "♥"), c(8, "♦"), c(5, "♠"), c(2, "♥")];
    tableGame.act(table, "a", "raise");
    tableGame.act(table, "b", "fold");
    tableGame.act(table, "guest", "fold");
    expect(tableGame.takeUnsaved(table)).toEqual([
      { userId: "u1", net: 10 },
      { userId: "u2", net: -10 },
    ]);
  });

  test("a swap fee counts in the net", () => {
    const table = tableWith([["a", account("u1", 1000)]]);
    tableGame.startHand(table);
    tableGame.act(table, "a", "swap", 0);
    tableGame.act(table, "a", "fold");
    expect(tableGame.takeUnsaved(table)).toEqual([{ userId: "u1", net: -30 }]); // ante 10 + swap 20
  });

  test("a player who leaves mid-hand still has their result recorded", () => {
    const table = tableWith([["a", account("u1", 1000)], ["b", null]]);
    tableGame.startHand(table);
    tableGame.leave(table, "a");
    tableGame.act(table, "b", "fold");
    expect(table.seats.has("a")).toBe(false);
    expect(tableGame.takeUnsaved(table)).toEqual([{ userId: "u1", net: -10 }]);
  });

  test("a player who sat the hand out has no result", () => {
    const table = tableWith([["a", account("u1", 1000)], ["broke", account("u2", 5)]]);
    tableGame.startHand(table);
    tableGame.act(table, "a", "fold");
    expect(tableGame.takeUnsaved(table)).toEqual([{ userId: "u1", net: -10 }]);
  });

  test("takeUnsaved empties the list so a result is saved once", () => {
    const table = tableWith([["a", account("u1", 1000)]]);
    tableGame.startHand(table);
    tableGame.act(table, "a", "fold");
    expect(tableGame.takeUnsaved(table)).toHaveLength(1);
    expect(tableGame.takeUnsaved(table)).toEqual([]);
  });
});
