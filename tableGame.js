const {
  createDeck,
  evaluateHand,
  compareHands,
  dealerQualifies,
  STARTING_BALANCE,
} = require("./game");

const { decideBotAction } = require("./botStrategy");

// One shared table per lobby. Everyone plays their own hand against one dealer hand.
const tables = new Map(); // lobbyId -> table
const { randomUUID } = require('crypto');

// Seat numbers 0-6 go clockwise around the table. New seats fill this order so a
// small table is spread out instead of everyone bunched on one side.
const SEAT_ORDER = [0, 4, 2, 6, 1, 5, 3];
const BOT_NAMES = [
  "Riley", "Jules", "Morgan", "Casey", "Avery", "Quinn", "Rowan", "Harper",
  "Reese", "Emery", "Parker", "Sage", "Blake", "Drew", "Logan", "Jesse",
];
// Bots are seated under keys like "bot:3", which no username can match, so a
// guest can never sit in or act for a bot's seat.
const BOT_KEY_PREFIX = "bot:";
// How long a bot "thinks" on its turn
const BOT_MIN_DELAY_MS = 1000;
const BOT_MAX_DELAY_MS = 2500;

function getTable(lobbyId) {
  return tables.get(String(lobbyId));
}

function tableIds() {
  return [...tables.keys()];
}

function getOrCreateTable(lobby) {
  const id = String(lobby._id);
  if (!tables.has(id)) {
    tables.set(id, {
      lobbyId: id,
      ante: lobby.ante,
      turnSeconds: lobby.turnTimer,
      phase: "waiting", // waiting | decision | done
      deck: [],
      dealerHand: [],
      dealerHandRank: null,
      dealerQualifies: null,
      deadline: null,
      timer: null, // the current turn's timer, set by the controller
      currentTurn: null, // seat key of whoever is acting now
      botChanges: [], // bots replaced at the start of the latest hand
      nextBotId: 1,
      random: Math.random, // tests swap this out for predictable bots
      seats: new Map(), // username (or bot key) -> seat
    });
    // Bots are only added when the table is first set up (story L8). Each bot
    // has its own difficulty (story L9); older lobbies without one get medium.
    const table = tables.get(id);
    if (lobby.bots?.enabled) {
      for (let i = 0; i < lobby.bots.amount; i++) addBot(table, lobby.bots.difficulties?.[i] ?? "medium");
    }
  }
  return tables.get(id);
}

function newSeat(username, seatNumber, balance) {
  return {
    username,
    seatNumber,
    balance,
    status: "waiting", // waiting | deciding | raised | folded
    hand: [],
    swapUsed: false,
    handRank: null,
    result: null,
    message: "",
    leaving: false,
    accountId: null,
    isBot: false,
  };
}

function freeSeatNumber(table) {
  const taken = new Set([...table.seats.values()].map((seat) => seat.seatNumber));
  return SEAT_ORDER.find((number) => !taken.has(number)) ?? table.seats.size;
}

// Seats a new bot with a name nobody at the table is using (or just left with)
function addBot(table, difficulty, seatNumber = freeSeatNumber(table), avoid = []) {
  const inUse = new Set([...table.seats.values()].map((seat) => seat.username).concat(avoid));
  const choices = BOT_NAMES.map((name) => `Bot ${name}`).filter((name) => !inUse.has(name));
  const id = table.nextBotId++;
  const username = choices.length ? choices[Math.floor(table.random() * choices.length)] : `Bot ${id}`;
  const seat = { ...newSeat(username, seatNumber, STARTING_BALANCE), isBot: true, difficulty };
  table.seats.set(`${BOT_KEY_PREFIX}${id}`, seat);
  return seat;
}

// A bot that can't cover the ante and a raise leaves, and a new bot takes its seat
function replaceBrokeBots(table) {
  table.botChanges = [];
  for (const [key, seat] of [...table.seats]) {
    if (!seat.isBot || seat.balance >= table.ante * 3) continue;
    table.seats.delete(key);
    const fresh = addBot(table, seat.difficulty, seat.seatNumber, [seat.username]);
    table.botChanges.push({ left: seat.username, joined: fresh.username });
  }
}

function deleteTable(lobbyId) {
  const table = tables.get(String(lobbyId));
  if (table) clearTimeout(table.timer);
  tables.delete(String(lobbyId));
}

// accountBalance is the logged-in player's saved balance. Without one (guests)
// the seat gets STARTING_BALANCE, which is never saved
function sitDown(table, username, accountId = null, accountBalance = null) {
  if (!table.seats.has(username)) {
    table.seats.set(username, newSeat(username, freeSeatNumber(table), accountBalance ?? STARTING_BALANCE));
  }
  const seat = table.seats.get(username);
  seat.accountId = accountId;
  seat.leaving = false;
  // Coming back between hands: pick up chips added since (refill, ad, admin)
  if (accountBalance !== null && table.phase !== "decision") seat.balance = accountBalance;
  return seat;
}

function startHand(table) {
  if (table.phase === "decision") throw new Error("A hand is already in progress.");
  replaceBrokeBots(table);
  if (![...table.seats.values()].some((seat) => seat.balance >= table.ante))
    throw new Error("Nobody has enough chips to ante.");

  const deck = createDeck();
  table.handId = randomUUID();
  table.dealerHand = deck.splice(0, 5);
  table.dealerHandRank = null;
  table.dealerQualifies = null;

  for (const seat of table.seats.values()) {
    seat.hand = [];
    seat.handRank = null;
    seat.result = null;
    seat.swapUsed = false;
    if (seat.balance >= table.ante) {
      seat.handStartBalance = seat.balance;
      seat.handOwnerId = seat.accountId;
      seat.balance -= table.ante;
      seat.hand = deck.splice(0, 5);
      seat.status = "deciding";
      seat.message = "Waiting for your turn.";
    } else {
      seat.status = "waiting";
      seat.message = "Not enough chips to ante. Sitting this hand out.";
    }
  }

  table.deck = deck; // undealt cards, so swaps draw from the real deck
  table.phase = "decision";
  table.currentTurn = null;
  advanceTurn(table);
}

// Turns go clockwise around the table by seat number. This passes the turn to
// the next seat still deciding and restarts the turn timer. When nobody is
// left to act, the hand settles.
function advanceTurn(table) {
  if (table.phase !== "decision") return;
  const waiting = [...table.seats]
    .filter(([, seat]) => seat.status === "deciding")
    .sort(([, a], [, b]) => a.seatNumber - b.seatNumber);
  if (waiting.length === 0) {
    table.currentTurn = null;
    settle(table);
    return;
  }
  const after = table.seats.get(table.currentTurn)?.seatNumber ?? -1;
  const [key, seat] = waiting.find(([, other]) => other.seatNumber > after) ?? waiting[0];
  table.currentTurn = key;
  table.deadline = Date.now() + table.turnSeconds * 1000;
  seat.message = "Your turn. Choose Raise or Fold.";
}

// Same payout rules as game.js, applied to every seat that raised.
function settle(table) {
  const ante = table.ante;
  const raise = ante * 2;
  const dealer = evaluateHand(table.dealerHand);
  const qualifies = dealerQualifies(table.dealerHand);
  table.dealerHandRank = dealer.rank;
  table.dealerQualifies = qualifies;

  for (const seat of table.seats.values()) {
    if (seat.hand.length !== 5) continue; // sat this hand out
    const player = evaluateHand(seat.hand);
    seat.handRank = player.rank;

    if (seat.status === "folded") {
      seat.result = "fold";
      continue;
    }
    if (seat.status !== "raised") continue;

    if (!qualifies) {
      seat.balance += ante * 2 + raise;
      seat.result = "dealer_not_qualified";
      seat.message = "Dealer does not qualify. Your ante wins even money and your raise is returned.";
      continue;
    }

    const comparison = compareHands(seat.hand, table.dealerHand);
    if (comparison > 0) {
      seat.balance += ante * 2 + raise * (player.payout + 1);
      seat.result = "win";
      seat.message = `You win with ${player.rank}! Raise pays ${player.payout}:1.`;
    } else if (comparison < 0) {
      seat.result = "loss";
      seat.message = `Dealer wins with ${dealer.rank}. You lose both bets.`;
    } else {
      seat.balance += ante + raise;
      seat.result = "push";
      seat.message = "It's a tie. Both bets are returned.";
    }
  }

  table.phase = "done";
  table.deadline = null;
  table.currentTurn = null;
  clearTimeout(table.timer);
  table.timer = null;

  // Capture every result before departing players' seats are removed.
  const settledAt = new Date();
  for (const seat of table.seats.values()) {
    if (seat.result && seat.handOwnerId && table.onHandSettled) {
      table.onHandSettled({ phase: 'done', ownerId: seat.handOwnerId,
        handId: `${table.handId}:${seat.handOwnerId}`, settledAt,
        balance: seat.balance, handStartBalance: seat.handStartBalance, result: seat.result,
        playerHandRank: seat.handRank });
    }
  }

  // Players who left mid-hand lose their seat once the hand is settled
  for (const [name, seat] of table.seats) if (seat.leaving) table.seats.delete(name);
}

function settleIfDone(table) {
  if (table.phase !== "decision") return;
  if ([...table.seats.values()].some((seat) => seat.status === "deciding")) return;
  settle(table);
}

function act(table, username, action, cardIndex) {
  const seat = table.seats.get(username);
  if (!seat) throw new Error("You are not seated at this table.");
  if (table.phase !== "decision" || seat.status !== "deciding")
    throw new Error("You can't act right now.");
  if (table.currentTurn !== username) throw new Error("It's not your turn yet.");

  const raise = table.ante * 2;

  if (action === "swap") {
    const cost = table.ante * 2;
    if (seat.swapUsed) throw new Error("You already swapped a card this hand.");
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 4)
      throw new Error("Choose which card (0-4) to swap.");
    if (seat.balance < cost + raise) throw new Error("Not enough chips to swap and still raise.");
    if (table.deck.length === 0) throw new Error("No cards left to swap.");
    seat.balance -= cost;
    seat.hand[cardIndex] = table.deck.shift();
    seat.swapUsed = true;
    seat.message = `You paid $${cost} and swapped a card. Choose Raise or Fold.`;
    return; // still your turn
  }

  if (action === "fold") {
    seat.status = "folded";
    seat.message = seat.swapUsed
      ? "You folded and lost your ante and your swap fee."
      : "You folded and lost your ante.";
  } else if (action === "raise") {
    if (seat.balance < raise) throw new Error("Not enough chips to raise.");
    seat.balance -= raise;
    seat.status = "raised";
    seat.message = "You raised. Waiting for the other players...";
  } else {
    throw new Error("Choose fold, raise or swap.");
  }

  advanceTurn(table);
}

// Called when the turn timer runs out: whoever's turn it is folds
function foldIdle(table) {
  if (table.phase !== "decision") return;
  const seat = table.seats.get(table.currentTurn);
  if (seat?.status === "deciding") {
    seat.status = "folded";
    seat.message = "Time ran out, so you folded.";
  }
  advanceTurn(table);
}

// Whether it's a bot's turn right now
function isBotTurn(table) {
  return table.phase === "decision" && Boolean(table.seats.get(table.currentTurn)?.isBot);
}

// How long a bot thinks on its turn: a random 1-2.5 seconds, always well inside
// the turn timer. The controller waits this long, then calls playBot.
function botDelay(table) {
  const latest = Math.max(0, Math.min(BOT_MAX_DELAY_MS, table.turnSeconds * 1000 - 1000));
  const earliest = Math.min(BOT_MIN_DELAY_MS, latest);
  return Math.round(earliest + table.random() * (latest - earliest));
}

// Plays one bot's turn through act(), so bots follow exactly the same rules as
// players. A swap leaves the hand open, so the bot then decides again.
function playBot(table, key) {
  const seat = table.seats.get(key);
  if (!seat?.isBot || table.currentTurn !== key || seat.status !== "deciding") return;
  const raise = table.ante * 2;
  const ask = (canSwap) =>
    decideBotAction({
      hand: seat.hand,
      dealerUpCard: table.dealerHand[0] ?? null,
      difficulty: seat.difficulty,
      canSwap,
      random: table.random,
    });

  let choice = ask(!seat.swapUsed && seat.balance >= raise * 2 && table.deck.length > 0);
  if (choice.action === "swap") {
    act(table, key, "swap", choice.cardIndex);
    choice = ask(false);
  }
  if (choice.action !== "raise" || seat.balance < raise) choice = { action: "fold" };
  act(table, key, choice.action);
}

// A player who leaves mid-hand folds, and the seat is removed when the hand ends
function leave(table, username) {
  const seat = table.seats.get(username);
  if (!seat) return;
  if (table.phase === "decision" && seat.hand.length === 5) {
    if (seat.status === "deciding") {
      seat.status = "folded";
      seat.message = "You left the table.";
    }
    seat.leaving = true;
    if (table.currentTurn === username) advanceTurn(table);
    else settleIfDone(table);
  } else {
    table.seats.delete(username);
  }
}

const strip = ({ rank, suit }) => ({ rank, suit });

// What one viewer is allowed to see. Other players' cards stay hidden until the
// showdown, and folded hands are never shown.
function publicState(table, viewer) {
  const done = table.phase === "done";
  const raise = table.ante * 2;
  const mine = viewer ? table.seats.get(viewer) : null;

  return {
    lobbyId: table.lobbyId,
    ante: table.ante,
    raiseAmount: raise,
    swapCost: raise,
    phase: table.phase,
    deadline: table.deadline,
    serverNow: Date.now(),
    dealerUpCard: table.dealerHand.length ? strip(table.dealerHand[0]) : null,
    dealerHand: done ? table.dealerHand.map(strip) : null,
    dealerHandRank: done ? table.dealerHandRank : null,
    dealerQualifies: done ? table.dealerQualifies : null,
    botChanges: table.botChanges.map((change) => ({ ...change })), // bots replaced this hand
    canSwap:
      Boolean(mine) &&
      table.phase === "decision" &&
      table.currentTurn === viewer &&
      mine.status === "deciding" &&
      !mine.swapUsed &&
      mine.balance >= raise * 2,
    seats: [...table.seats].map(([key, seat]) => {
      const isYou = key === viewer;
      const showCards = isYou || (done && seat.status === "raised");
      return {
        username: seat.username,
        seatNumber: seat.seatNumber,
        isBot: seat.isBot,
        difficulty: seat.isBot ? seat.difficulty : null,
        isTurn: key === table.currentTurn,
        isYou,
        balance: seat.balance,
        status: seat.status,
        inHand: seat.hand.length === 5,
        swapUsed: seat.swapUsed,
        hand: showCards ? seat.hand.map(strip) : null,
        handRank: showCards ? seat.handRank : null,
        result: done ? seat.result : null,
        message: isYou ? seat.message : null,
      };
    }),
  };
}

module.exports = {
  getTable,
  tableIds,
  getOrCreateTable,
  deleteTable,
  sitDown,
  startHand,
  act,
  isBotTurn,
  botDelay,
  playBot,
  foldIdle,
  leave,
  publicState,
};
