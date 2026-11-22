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
  tableGame.foldIdle(table); // member's turn times out
  tableGame.foldIdle(table); // then Guest's
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

test("running out the timer folds the player whose turn it is", () => {
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

describe("how much each seat won or lost", () => {
  const netOf = (table, name) => tableGame.publicState(table, name).seats.find((seat) => seat.isYou).net;

  test("a win shows the ante plus the raise payout, a fold shows the lost ante", () => {
    const table = newTable();
    table.seats.get("a").hand = hand5(c("A", "♠"), c("A", "♥"), c("K", "♦"), c(8, "♣"), c(5, "♠"));
    table.dealerHand = hand5(c("K", "♠"), c("K", "♥"), c("Q", "♦"), c(8, "♦"), c(2, "♠"));
    tableGame.act(table, "a", "raise");
    expect(netOf(table, "a")).toBeNull(); // hidden until the hand is over
    tableGame.act(table, "b", "fold");
    expect(netOf(table, "a")).toBe(30);
    expect(netOf(table, "b")).toBe(-10);
  });

  test("a loss shows both bets lost", () => {
    const table = newTable();
    table.seats.get("a").hand = hand5(c(2, "♠"), c(2, "♥"), c("K", "♦"), c(8, "♣"), c(5, "♠"));
    table.dealerHand = hand5(c("K", "♠"), c("K", "♥"), c("Q", "♦"), c(8, "♦"), c(10, "♠"));
    tableGame.act(table, "a", "raise");
    tableGame.act(table, "b", "fold");
    expect(netOf(table, "a")).toBe(-30);
  });

  test("a dealer who doesn't qualify pays the ante; a tie pays nothing", () => {
    const noQualify = newTable();
    noQualify.seats.get("a").hand = hand5(c(2, "♠"), c(5, "♥"), c("K", "♦"), c(8, "♣"), c(10, "♠"));
    noQualify.dealerHand = hand5(c(2, "♦"), c(5, "♣"), c(8, "♦"), c(10, "♦"), c("Q", "♠"));
    tableGame.act(noQualify, "a", "raise");
    tableGame.act(noQualify, "b", "fold");
    expect(netOf(noQualify, "a")).toBe(10);

    const tie = newTable();
    tie.seats.get("a").hand = hand5(c("K", "♠"), c("K", "♥"), c("Q", "♦"), c(8, "♦"), c(2, "♠"));
    tie.dealerHand = hand5(c("K", "♦"), c("K", "♣"), c("Q", "♠"), c(8, "♣"), c(2, "♥"));
    tableGame.act(tie, "a", "raise");
    tableGame.act(tie, "b", "fold");
    expect(tie.seats.get("a").result).toBe("push");
    expect(netOf(tie, "a")).toBe(0);
  });

  test("the next hand clears it", () => {
    const table = newTable();
    tableGame.act(table, "a", "fold");
    tableGame.act(table, "b", "fold");
    tableGame.startHand(table);
    expect(table.seats.get("a").net).toBeNull();
  });
});

test("the dealer's scoring cards are sent only once the hand is over", () => {
  const table = newTable();
  table.dealerHand = hand5(c("K", "♠"), c(2, "♥"), c("K", "♦"), c(8, "♦"), c(5, "♠"));
  expect(tableGame.publicState(table, "a").dealerHighlight).toBeNull();
  tableGame.act(table, "a", "fold");
  tableGame.act(table, "b", "fold");
  expect(tableGame.publicState(table, "a").dealerHighlight).toEqual([0, 2]);
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
  tableGame.foldIdle(table); // a's turn times out
  tableGame.foldIdle(table); // b's turn times out, which settles the hand
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
  const tableFor = () => tableGame.getOrCreateTable({ _id: `acct${counter++}`, ante: 10, turnTimer: 30 });

  test("a logged-in seat starts with the account balance, a guest with 1,000", () => {
    const table = tableFor();
    tableGame.sitDown(table, "a", "u1", 5000);
    tableGame.sitDown(table, "guest");
    expect(table.seats.get("a").balance).toBe(5000);
    expect(table.seats.get("guest").balance).toBe(1000);
  });

  test("sitting down again between hands picks up chips added to the account", () => {
    const table = tableFor();
    tableGame.sitDown(table, "a", "u1", 0);
    tableGame.sitDown(table, "a", "u1", 500); // refilled from the main menu
    expect(table.seats.get("a").balance).toBe(500);
  });

  test("sitting down again mid-hand keeps the seat's balance", () => {
    const table = tableFor();
    tableGame.sitDown(table, "a", "u1", 100);
    tableGame.startHand(table);
    tableGame.sitDown(table, "a", "u1", 100); // reconnect: the ante is already bet
    expect(table.seats.get("a").balance).toBe(90);
  });

  test("the settled hand reports the net from the account balance", () => {
    const table = tableFor();
    table.onHandSettled = jest.fn();
    tableGame.sitDown(table, "a", "u1", 5000);
    tableGame.startHand(table);
    tableGame.act(table, "a", "fold");
    const hand = table.onHandSettled.mock.calls[0][0];
    expect(hand.balance - hand.handStartBalance).toBe(-10);
    expect(hand.balance).toBe(4990);
  });
});

describe("taking turns", () => {
  test("turns go around the table in seat order", () => {
    const table = newTable(["a", "b", "c"]);
    const order = [...table.seats.values()].sort((x, y) => x.seatNumber - y.seatNumber).map((seat) => seat.username);
    for (const name of order) {
      expect(table.currentTurn).toBe(name);
      tableGame.act(table, name, "fold");
    }
    expect(table.phase).toBe("done");
    expect(table.currentTurn).toBeNull();
  });

  test("acting out of turn is refused", () => {
    const table = newTable();
    const waiting = table.currentTurn === "a" ? "b" : "a";
    expect(() => tableGame.act(table, waiting, "raise")).toThrow("It's not your turn yet.");
    expect(table.seats.get(waiting).status).toBe("deciding");
  });

  test("a swap keeps the turn, raise or fold passes it on", () => {
    const table = newTable();
    const first = table.currentTurn;
    tableGame.act(table, first, "swap", 0);
    expect(table.currentTurn).toBe(first);
    tableGame.act(table, first, "raise");
    expect(table.currentTurn).not.toBe(first);
  });

  test("each turn gets the full turn timer", () => {
    const table = newTable();
    table.deadline = 0;
    tableGame.act(table, table.currentTurn, "fold");
    expect(table.deadline).toBeGreaterThan(Date.now() + 29000);
  });

  test("the timer folds only the player whose turn it is", () => {
    const table = newTable();
    const first = table.currentTurn;
    tableGame.foldIdle(table);
    expect(table.seats.get(first).status).toBe("folded");
    expect([...table.seats.values()].filter((seat) => seat.status === "deciding")).toHaveLength(1);
  });

  test("leaving on your turn passes the turn on", () => {
    const table = newTable();
    const first = table.currentTurn;
    tableGame.leave(table, first);
    expect(table.currentTurn).not.toBe(first);
    expect(table.phase).toBe("decision");
  });

  test("only the player whose turn it is can swap", () => {
    const table = newTable();
    const waiting = table.currentTurn === "a" ? "b" : "a";
    expect(tableGame.publicState(table, table.currentTurn).canSwap).toBe(true);
    expect(tableGame.publicState(table, waiting).canSwap).toBe(false);
  });

  test("players can see whose turn it is", () => {
    const table = newTable();
    const seats = tableGame.publicState(table, "a").seats;
    expect(seats.filter((seat) => seat.isTurn).map((seat) => seat.username)).toEqual([table.currentTurn]);
  });
});
