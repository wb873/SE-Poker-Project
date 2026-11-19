// Bots at the shared table (story L8)
const tableGame = require("./tableGame");

afterEach(() => { for (const id of tableGame.tableIds()) tableGame.deleteTable(id); });

let counter = 0;
function botTable({ amount = 2, difficulty = "medium", difficulties, enabled = true, humans = ["a"], turnTimer = 30 } = {}) {
  const table = tableGame.getOrCreateTable({
    _id: `bots${counter++}`,
    ante: 10,
    turnTimer,
    bots: { enabled, amount, difficulties: difficulties ?? Array(amount).fill(difficulty) },
  });
  humans.forEach((name) => tableGame.sitDown(table, name));
  return table;
}
const bots = (table) => [...table.seats].filter(([, seat]) => seat.isBot);

// Plays turns until it's `key`'s turn (or the hand ends): bots play, players fold
function playUntil(table, key = null) {
  while (table.phase === "decision" && table.currentTurn !== key) {
    const turn = table.currentTurn;
    if (table.seats.get(turn).isBot) tableGame.playBot(table, turn);
    else tableGame.act(table, turn, "fold");
  }
}

describe("seating", () => {
  test("bots sit down when the table is created", () => {
    const table = botTable({ amount: 3, difficulty: "hard" });
    expect(bots(table)).toHaveLength(3);
    for (const [key, seat] of bots(table)) {
      expect(key).toMatch(/^bot:\d+$/);
      expect(seat.username).toMatch(/^Bot /);
      expect(seat.difficulty).toBe("hard");
      expect(seat.balance).toBe(1000);
      expect(seat.accountId).toBeNull();
    }
  });

  test("each bot gets its own difficulty, in order", () => {
    const table = botTable({ amount: 3, difficulties: ["easy", "medium", "hard"] });
    expect(bots(table).map(([, seat]) => seat.difficulty)).toEqual(["easy", "medium", "hard"]);
  });

  test("a lobby saved without difficulties gets medium bots", () => {
    const table = tableGame.getOrCreateTable({
      _id: `bots${counter++}`,
      ante: 10,
      turnTimer: 30,
      bots: { enabled: true, amount: 2 },
    });
    expect(bots(table).map(([, seat]) => seat.difficulty)).toEqual(["medium", "medium"]);
  });

  test("bots have different names", () => {
    const names = bots(botTable({ amount: 6 })).map(([, seat]) => seat.username);
    expect(new Set(names).size).toBe(6);
  });

  test("no bots when they are turned off", () => {
    expect(bots(botTable({ enabled: false }))).toHaveLength(0);
  });

  test("bots are added only once, not every time someone joins", () => {
    const table = botTable({ amount: 2 });
    tableGame.getOrCreateTable({ _id: table.lobbyId, ante: 10, turnTimer: 30, bots: { enabled: true, amount: 2 } });
    tableGame.sitDown(table, "b");
    expect(bots(table)).toHaveLength(2);
  });

  test("every seat gets its own seat number", () => {
    const table = botTable({ amount: 3, humans: ["a", "b"] });
    const numbers = [...table.seats.values()].map((seat) => seat.seatNumber);
    expect(new Set(numbers).size).toBe(5);
    numbers.forEach((number) => expect(number).toBeGreaterThanOrEqual(0));
    numbers.forEach((number) => expect(number).toBeLessThan(7));
  });

  test("a player can't sit in or act for a bot's seat", () => {
    const table = botTable({ amount: 1 });
    const [, bot] = bots(table)[0];
    tableGame.sitDown(table, bot.username);
    expect(bots(table)).toHaveLength(1);
    expect(table.seats.get(bot.username).isBot).toBe(false);

    // Acting under that name only ever moves the player's own seat
    tableGame.startHand(table);
    playUntil(table, bot.username);
    tableGame.act(table, bot.username, "fold");
    expect(table.seats.get(bot.username).status).toBe("folded");
    const mine = tableGame.publicState(table, bot.username).seats.filter((seat) => seat.isYou);
    expect(mine).toHaveLength(1);
    expect(mine[0].isBot).toBe(false);
  });
});

describe("playing", () => {
  test("bots take their turns and the hand settles once everyone has acted", () => {
    const table = botTable({ amount: 2 });
    tableGame.startHand(table);
    playUntil(table);
    expect(table.phase).toBe("done");
    for (const [, seat] of bots(table)) expect(["raised", "folded"]).toContain(seat.status);
  });

  test("a bot only plays on its own turn", () => {
    const table = botTable({ amount: 2, humans: [] });
    tableGame.startHand(table);
    const waiting = bots(table).find(([key]) => key !== table.currentTurn);
    tableGame.playBot(table, waiting[0]);
    expect(waiting[1].status).toBe("deciding");
  });

  test("a hard bot swaps for a flush draw, then decides again on the same turn", () => {
    // A player is seated too, so the hand stays open after the bot's turn
    const table = botTable({ amount: 1, difficulty: "hard", humans: ["a"] });
    tableGame.startHand(table);
    const [key, seat] = bots(table)[0];
    playUntil(table, key);
    const card = (value, suit) => ({ rank: String(value), suit, value });
    seat.hand = [card(14, "♠"), card(9, "♠"), card(7, "♠"), card(4, "♠"), card(2, "♥")];
    tableGame.playBot(table, key);
    expect(seat.swapUsed).toBe(true);
    expect(seat.balance).toBeLessThan(990); // paid the swap fee
    expect(["raised", "folded"]).toContain(seat.status);
  });

  test("a bot without enough to raise folds instead of breaking", () => {
    const table = botTable({ amount: 1, humans: [] });
    tableGame.startHand(table);
    const [key, seat] = bots(table)[0];
    seat.balance = 5;
    expect(() => tableGame.playBot(table, key)).not.toThrow();
    expect(seat.status).toBe("folded");
  });

  test("playBot does nothing once the bot has acted", () => {
    const table = botTable({ amount: 2, humans: [] });
    tableGame.startHand(table);
    const key = table.currentTurn;
    tableGame.playBot(table, key);
    const status = table.seats.get(key).status;
    expect(() => tableGame.playBot(table, key)).not.toThrow();
    expect(table.seats.get(key).status).toBe(status);
  });

  test("bot hands are never recorded to the leaderboard or an account", () => {
    const table = botTable({ amount: 2, humans: [] });
    tableGame.sitDown(table, "member", "account-id");
    table.onHandSettled = jest.fn();
    tableGame.startHand(table);
    playUntil(table);
    expect(table.onHandSettled).toHaveBeenCalledTimes(1);
    expect(table.onHandSettled.mock.calls[0][0].ownerId).toBe("account-id");
  });

  test("isBotTurn tells a bot's turn from a player's", () => {
    const table = botTable({ amount: 1 });
    expect(tableGame.isBotTurn(table)).toBe(false); // between hands
    tableGame.startHand(table);
    const [botKey] = bots(table)[0];
    playUntil(table, botKey);
    expect(tableGame.isBotTurn(table)).toBe(true);
    playUntil(table, "a");
    if (table.phase === "decision") expect(tableGame.isBotTurn(table)).toBe(false);
  });

  test("a bot thinks for 1-2.5 seconds", () => {
    const table = botTable();
    for (const roll of [0, 0.5, 0.999]) {
      table.random = () => roll;
      const delay = tableGame.botDelay(table);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  test("a bot's pause fits inside a short turn timer", () => {
    const table = botTable({ turnTimer: 2 });
    table.random = () => 0.999;
    expect(tableGame.botDelay(table)).toBeLessThanOrEqual(1000);
  });
});

describe("running out of chips", () => {
  test("a broke bot leaves and a new bot takes the same seat with a full stack", () => {
    const table = botTable({ amount: 2 });
    const [oldKey, broke] = bots(table)[0];
    broke.balance = 20; // can't cover the ante and a raise
    tableGame.startHand(table);

    expect(table.seats.has(oldKey)).toBe(false);
    const replacement = bots(table).find(([, seat]) => seat.seatNumber === broke.seatNumber)[1];
    expect(replacement.username).not.toBe(broke.username);
    expect(replacement.balance).toBe(990); // 1,000 minus this hand's ante
    expect(replacement.status).toBe("deciding");
    expect(table.botChanges).toEqual([{ left: broke.username, joined: replacement.username }]);
    expect(bots(table)).toHaveLength(2);
  });

  test("the new bot keeps the old bot's difficulty", () => {
    const table = botTable({ amount: 2, difficulties: ["easy", "hard"] });
    const [, broke] = bots(table).find(([, seat]) => seat.difficulty === "hard");
    broke.balance = 0;
    tableGame.startHand(table);
    const replacement = bots(table).find(([, seat]) => seat.seatNumber === broke.seatNumber)[1];
    expect(replacement.difficulty).toBe("hard");
  });

  test("every player is told which bot left and which joined, until the next hand", () => {
    const table = botTable({ amount: 1, humans: ["a", "b"] });
    const [, broke] = bots(table)[0];
    broke.balance = 0;
    tableGame.startHand(table);
    const [, replacement] = bots(table)[0];
    const change = { left: broke.username, joined: replacement.username };
    expect(tableGame.publicState(table, "a").botChanges).toEqual([change]);
    expect(tableGame.publicState(table, "b").botChanges).toEqual([change]);
    expect(tableGame.publicState(table, null).botChanges).toEqual([change]);

    playUntil(table);
    expect(tableGame.publicState(table, "a").botChanges).toEqual([change]); // still shown after the showdown
    tableGame.startHand(table);
    expect(tableGame.publicState(table, "a").botChanges).toEqual([]);
  });

  test("the new bot never gets the name of the bot that just left", () => {
    const table = botTable({ amount: 1 });
    const [, broke] = bots(table)[0];
    broke.username = "Bot Riley"; // first name on the list...
    broke.balance = 0;
    table.random = () => 0; // ...and the one that would be picked next
    tableGame.startHand(table);
    const [, replacement] = bots(table)[0];
    expect(replacement.username).not.toBe("Bot Riley");
  });

  test("bots with enough chips stay put", () => {
    const table = botTable({ amount: 2 });
    const keys = bots(table).map(([key]) => key);
    tableGame.startHand(table);
    expect(bots(table).map(([key]) => key)).toEqual(keys);
    expect(table.botChanges).toEqual([]);
  });
});

describe("what players see", () => {
  test("bot seats are marked and carry seat numbers", () => {
    const table = botTable({ amount: 1 });
    const state = tableGame.publicState(table, "a");
    const bot = state.seats.find((seat) => seat.isBot);
    const me = state.seats.find((seat) => seat.isYou);
    expect(bot.username).toMatch(/^Bot /);
    expect(me.isBot).toBe(false);
    expect(Number.isInteger(bot.seatNumber)).toBe(true);
    expect(Number.isInteger(me.seatNumber)).toBe(true);
  });

  test("bot seats show their difficulty; player seats don't have one", () => {
    const table = botTable({ amount: 2, difficulties: ["easy", "hard"] });
    const seats = tableGame.publicState(table, "a").seats;
    expect(seats.filter((seat) => seat.isBot).map((seat) => seat.difficulty).sort()).toEqual(["easy", "hard"]);
    expect(seats.find((seat) => seat.isYou).difficulty).toBeNull();
  });

  test("a bot's cards stay hidden until the showdown", () => {
    const table = botTable({ amount: 1 });
    tableGame.startHand(table);
    const bot = tableGame.publicState(table, "a").seats.find((seat) => seat.isBot);
    expect(bot.hand).toBeNull();
  });
});
