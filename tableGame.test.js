const tableGame = require("./tableGame");
afterEach(() => { for (const id of tableGame.tableIds()) tableGame.deleteTable(id); });

test('settlement snapshots include swap fees and distinct hand IDs, excluding guests', () => {
  const table = tableGame.getOrCreateTable({ _id: 'snapshot-test', ante: 10, turnTimer: 30 });
  tableGame.sitDown(table, 'member', 'account-id');
  tableGame.sitDown(table, 'Guest');
  table.onHandSettled = jest.fn();
  tableGame.startHand(table);
  tableGame.act(table, 'member', 'swap', 0);
  tableGame.act(table, 'member', 'fold');
  tableGame.act(table, 'Guest', 'fold');
  expect(table.onHandSettled).toHaveBeenCalledTimes(1);
  const first = table.onHandSettled.mock.calls[0][0];
  expect(first.balance - first.handStartBalance).toBe(-30);
  expect(first.playerHandRank).toEqual(expect.any(String));
  tableGame.foldIdle(table);
  expect(table.onHandSettled).toHaveBeenCalledTimes(1);
  tableGame.startHand(table);
  tableGame.foldIdle(table);
  const next = table.onHandSettled.mock.calls[1][0];
  expect(next.handId).not.toBe(first.handId);
  expect(first.balance).toBe(970);
});

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
