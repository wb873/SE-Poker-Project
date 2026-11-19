// Works out which chip and card animations to play by comparing two table states.
//
//   swap:            the old card slides to the dealer, a new one slides back ("Swapped 1 card · -$20")
//   fold:            the seat's ante slides to the dealer ("-$10")
//   hand over, win:  chips slide from the dealer to the seat ("+$30")
//   hand over, loss: the seat's bets slide to the dealer ("-$30")
//   hand over, push: the bets slide back to the seat ("Push")
//
// Folds are animated when they happen, so they're skipped when the hand ends.
// Nothing plays on the first state (joining or reconnecting mid-hand).
//
// Each event has a delay in ms. A bot swaps and then raises or folds in one
// update, so anything after a swap waits for the swap to finish first.

export const HAND_END_DELAY = 500; // let the dealer's cards show before chips move
export const SWAP_TIME = 1700; // how long the swap animation and its label take

const money = (amount) => `${amount < 0 ? "-" : "+"}$${Math.abs(amount).toLocaleString()}`;

export function chipEvents(prev, next) {
  if (!prev || !next || prev.lobbyId !== next.lobbyId) return [];
  const before = new Map(prev.seats.map((seat) => [seat.username, seat]));
  const handEnded = prev.phase !== "done" && next.phase === "done";
  const events = [];

  for (const seat of next.seats) {
    const old = before.get(seat.username);
    if (!old) continue;

    const swapped = !old.swapUsed && Boolean(seat.swapUsed);
    if (swapped) {
      const cost = Number.isFinite(next.swapCost) ? ` · ${money(-next.swapCost)}` : "";
      events.push({ username: seat.username, kind: "swap", toDealer: false, label: `Swapped 1 card${cost}`, delay: 0 });
    }
    const after = swapped ? SWAP_TIME : 0;

    if (old.status === "deciding" && seat.status === "folded") {
      events.push({
        username: seat.username,
        kind: "fold",
        toDealer: true,
        label: Number.isFinite(next.ante) ? money(-next.ante) : "Folded",
        delay: after,
      });
      continue;
    }
    if (!handEnded) continue;

    const delay = Math.max(after, HAND_END_DELAY);
    const known = Number.isFinite(seat.net);
    if (seat.result === "win" || seat.result === "dealer_not_qualified") {
      events.push({ username: seat.username, kind: "win", toDealer: false, label: known ? money(seat.net) : "Won", delay });
    } else if (seat.result === "loss") {
      events.push({ username: seat.username, kind: "loss", toDealer: true, label: known ? money(seat.net) : "Lost", delay });
    } else if (seat.result === "push") {
      events.push({ username: seat.username, kind: "push", toDealer: false, label: "Push", delay });
    }
  }
  return events;
}
