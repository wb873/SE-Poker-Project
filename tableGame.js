const {
  createDeck,
  evaluateHand,
  compareHands,
  dealerQualifies,
  STARTING_BALANCE,
} = require("./game");

// One shared table per lobby. Everyone plays their own hand against one dealer hand.
const tables = new Map(); // lobbyId -> table
const { randomUUID } = require('crypto');

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
      timer: null,
      seats: new Map(), // username -> seat
    });
  }
  return tables.get(id);
}

function deleteTable(lobbyId) {
  const table = tables.get(String(lobbyId));
  if (table) clearTimeout(table.timer);
  tables.delete(String(lobbyId));
}

function sitDown(table, username, accountId = null) {
  if (!table.seats.has(username)) {
    table.seats.set(username, {
      username,
      balance: STARTING_BALANCE,
      status: "waiting", // waiting | deciding | raised | folded
      hand: [],
      swapUsed: false,
      handRank: null,
      result: null,
      message: "",
      leaving: false,
    });
  }
  const seat = table.seats.get(username);
  seat.accountId = accountId;
  seat.leaving = false;
  return seat;
}

function startHand(table) {
  if (table.phase === "decision") throw new Error("A hand is already in progress.");
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
      seat.message = "Choose Raise or Fold.";
    } else {
      seat.status = "waiting";
      seat.message = "Not enough chips to ante. Sitting this hand out.";
    }
  }

  table.deck = deck; // undealt cards, so swaps draw from the real deck
  table.phase = "decision";
  table.deadline = Date.now() + table.turnSeconds * 1000;
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
    return; // hand stays open
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

  settleIfDone(table);
}

// Called when the turn timer runs out: everyone still deciding folds
function foldIdle(table) {
  if (table.phase !== "decision") return;
  for (const seat of table.seats.values()) {
    if (seat.status === "deciding") {
      seat.status = "folded";
      seat.message = "Time ran out, so you folded.";
    }
  }
  settleIfDone(table);
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
    settleIfDone(table);
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
    canSwap:
      Boolean(mine) &&
      table.phase === "decision" &&
      mine.status === "deciding" &&
      !mine.swapUsed &&
      mine.balance >= raise * 2,
    seats: [...table.seats.values()].map((seat) => {
      const isYou = seat.username === viewer;
      const showCards = isYou || (done && seat.status === "raised");
      return {
        username: seat.username,
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
  foldIdle,
  leave,
  publicState,
};
