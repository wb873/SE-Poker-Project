import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import GameTableView from "../components/game_table_view.jsx";
import { use_session } from "../session.jsx";

// Interactive tutorial (story T1): one scripted practice hand on the real table view.
// Nothing here talks to the server, so the player's real balance never changes.

const ANTE = 10;
const RAISE = ANTE * 2;
const SWAP_COST = ANTE * 2;
const START_BALANCE = 1000;
const TURN_SECONDS = 30;
const FREEZE_DELAY_MS = 3000; // let the timer visibly tick before pausing it

const card = (rank, suit) => ({ rank, suit });
const label = (c) => `${c.rank}${c.suit}`;

// Scripted cards: you hold a pair of Queens, the dealer has a pair of 8s (qualifies)
const STARTING_HAND = [card("Q", "♥"), card("Q", "♠"), card("9", "♦"), card("6", "♣"), card("3", "♥")];
const DEALER_HAND = [card("K", "♣"), card("8", "♠"), card("8", "♦"), card("5", "♥"), card("2", "♣")];
const BOT_1_HAND = [card("A", "♠"), card("A", "♦"), card("7", "♣"), card("4", "♦"), card("2", "♥")];
// Swapping any other card draws a third Queen; swapping a Queen draws a 9 (pair of 9s)
const GOOD_DRAW = card("Q", "♦");
const BAD_DRAW = card("9", "♣");

const practice_lobby = {
  name: "Practice Table",
  host: "Tutorial",
  id: "PRACTICE",
  ante: ANTE,
  turnTimer: TURN_SECONDS,
  sideBets: false,
  bots: { enabled: true, amount: 2, difficulty: "easy" },
};

// Steps that wait for a table action instead of a Next click
const ACTION_STEPS = ["deal", "choose", "pick_swap", "choose_after"];

const initial_state = {
  step: "welcome",
  phase: "waiting",
  hand: STARTING_HAND,
  status: "waiting",
  balance: START_BALANCE,
  swap_used: false,
  swapped_queen: false,
  swap_note: null,
  seconds_left: TURN_SECONDS,
  timer_frozen: false,
};

export default function TutorialPage() {
  const navigate = useNavigate();
  const { player } = use_session();
  const [state, set_state] = useState(initial_state);
  const [swap_mode, set_swap_mode] = useState(false);
  const [chat_input, set_chat_input] = useState("");
  const [chat_log, set_chat_log] = useState([{ user: "System", text: "Welcome to the practice table!" }]);

  const update = (changes) => set_state((previous) => ({ ...previous, ...changes }));
  const go_to = (step) => update({ step });

  const { phase, step, status, balance, swap_used } = state;
  const active_step = step === "choose" && swap_mode ? "pick_swap" : step;
  const hand_rank = swap_used && !state.swapped_queen ? "Three of a Kind" : "One Pair";
  const payout = hand_rank === "Three of a Kind" ? 3 : 1;
  const hand_name = !swap_used ? "pair of Queens" : state.swapped_queen ? "pair of 9s" : "Three of a Kind";

  // Count down once cards are dealt, until the tutorial freezes the clock
  useEffect(() => {
    if (phase !== "decision" || state.timer_frozen) return;
    const id = setInterval(() => {
      set_state((previous) => ({ ...previous, seconds_left: Math.max(1, previous.seconds_left - 1) }));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, state.timer_frozen]);

  // Freeze the timer shortly after pointing it out
  useEffect(() => {
    if (step !== "timer") return;
    const id = setTimeout(() => update({ timer_frozen: true }), FREEZE_DELAY_MS);
    return () => clearTimeout(id);
  }, [step]);

  // Keep whatever the tutorial is pointing at on screen
  useEffect(() => {
    document.querySelector(".tutorial_highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active_step]);

  function deal() {
    update({ phase: "decision", status: "deciding", balance: balance - ANTE, step: "timer" });
  }

  function swap_card(index) {
    const old_card = state.hand[index];
    const swapped_queen = old_card.rank === "Q";
    const new_card = swapped_queen ? BAD_DRAW : GOOD_DRAW;
    const hand = state.hand.map((c, i) => (i === index ? new_card : c));
    set_swap_mode(false);
    update({
      hand,
      balance: balance - SWAP_COST,
      swap_used: true,
      swapped_queen,
      swap_note: { old_card, new_card },
      step: "swapped",
    });
  }

  function raise() {
    // Ante pays 1:1 and the raise pays by hand rank (same math as tableGame.js)
    update({
      phase: "done",
      status: "raised",
      balance: balance - RAISE + ANTE * 2 + RAISE * (payout + 1),
      step: "reveal",
    });
  }

  function fold() {
    set_swap_mode(false);
    update({ phase: "done", status: "folded", step: "folded" });
  }

  function replay() {
    set_swap_mode(false);
    set_chat_input("");
    set_chat_log([{ user: "System", text: "Welcome to the practice table!" }]);
    set_state(initial_state);
  }

  function handle_send_chat(event) {
    event.preventDefault();
    if (!chat_input.trim()) return;
    const first_message = !chat_log.some((entry) => entry.user === player.username);
    set_chat_log((previous) => [
      ...previous,
      { user: player.username, text: chat_input },
      ...(first_message ? [{ user: "Bot 1", text: "Good luck!" }] : []),
    ]);
    set_chat_input("");
  }

  // Build the same table state shape the server sends, from the scripted hand
  const done = phase === "done";
  const dealt = phase !== "waiting";
  const my_message = done
    ? status === "raised"
      ? `You win with ${hand_rank}! Raise pays ${payout}:1.`
      : swap_used
        ? "You folded and lost your ante and your swap fee."
        : "You folded and lost your ante."
    : swap_used
      ? `You paid $${SWAP_COST} and swapped a card. Choose Raise or Fold.`
      : "Choose Raise or Fold.";

  const table = {
    ante: ANTE,
    raiseAmount: RAISE,
    swapCost: SWAP_COST,
    phase,
    dealerUpCard: dealt ? DEALER_HAND[0] : null,
    dealerHand: done ? DEALER_HAND : null,
    dealerHandRank: done ? "One Pair" : null,
    canSwap: phase === "decision" && !swap_used,
    seats: [
      {
        username: player.username,
        isYou: true,
        balance,
        status,
        inHand: dealt,
        swapUsed: swap_used,
        hand: dealt ? state.hand : null,
        handRank: done ? hand_rank : null,
        result: done ? (status === "raised" ? "win" : "fold") : null,
        message: dealt ? my_message : null,
      },
      {
        username: "Bot 1",
        isYou: false,
        balance: done ? START_BALANCE + ANTE + RAISE : dealt ? START_BALANCE - ANTE : START_BALANCE,
        status: done ? "raised" : dealt ? "deciding" : "waiting",
        inHand: dealt,
        swapUsed: false,
        hand: done ? BOT_1_HAND : null,
        handRank: done ? "One Pair" : null,
        result: done ? "win" : null,
        message: null,
      },
      {
        username: "Bot 2",
        isYou: false,
        balance: dealt ? START_BALANCE - ANTE : START_BALANCE,
        status: done ? "folded" : dealt ? "deciding" : "waiting",
        inHand: dealt,
        swapUsed: false,
        hand: null,
        handRank: null,
        result: done ? "fold" : null,
        message: null,
      },
    ],
  };

  // What the player would have ended with by raising instead of folding
  const raise_balance = balance - RAISE + ANTE * 2 + RAISE * (payout + 1);
  const swap_note = state.swap_note;

  const steps = {
    welcome: {
      text: `Welcome to the practice table! You'll play one hand of Caribbean Stud Poker against the dealer. You have $${START_BALANCE.toLocaleString()} in practice chips. Nothing here changes your real balance.`,
      next: "lobby",
    },
    lobby: {
      highlight: "lobby",
      text: "This panel shows the lobby you're in: its name, the host, the lobby code friends can use to join, and the settings (ante, turn timer, and bots).",
      next: "seats",
    },
    seats: {
      highlight: "seats",
      text: "This is the table. You always sit at the bottom (YOU), and the other seats are the other players. Here there are two practice bots. Everyone plays their own hand against the dealer, so you never have to beat the other players.",
      next: "chat",
    },
    chat: {
      highlight: "chat",
      text: "Use chat to talk with everyone at your table. Try sending a message if you like.",
      next: "balance",
    },
    balance: {
      highlight: "balance",
      text: `This shows your balance and the bets. The ante ($${ANTE}) is what everyone pays to be dealt in. The raise is always 2× the ante ($${RAISE}), and swapping a card also costs $${SWAP_COST}.`,
      next: "deal",
    },
    deal: {
      highlight: "status",
      text: `Click Deal to place your $${ANTE} ante and get your cards.`,
    },
    timer: {
      highlight: "timer",
      text: state.timer_frozen
        ? "We've paused the timer so you can take your time. In a real game it keeps going, and if it hits 0 before you act, you automatically fold."
        : "The cards are out and the timer is running! Each turn has a time limit...",
      next: state.timer_frozen ? "dealer" : null,
    },
    dealer: {
      highlight: "dealer",
      text: `The dealer gets five cards. Four are face down, and one is face up (the ${label(DEALER_HAND[0])}). The face-up card is your only hint about the dealer's hand.`,
      next: "hand",
    },
    hand: {
      highlight: "hand",
      text: "These are your cards, and only you can see them. You have a pair of Queens (Q♥ Q♠), which is a solid hand.",
      next: "choose",
    },
    choose: {
      highlight: "actions",
      text: `Now it's your call. Pick one:\n• Raise ($${RAISE}): stay in and play your hand against the dealer.\n• Swap Card ($${SWAP_COST}): once per hand, trade one card for a new one, then decide.\n• Fold: give up the hand and lose only your $${ANTE} ante.`,
    },
    pick_swap: {
      highlight: "hand",
      text: "Click the card you want to replace. Think about which cards are helping your hand.",
    },
    swapped: {
      highlight: "hand",
      text: !swap_note
        ? ""
        : state.swapped_queen
          ? `You swapped away a Queen and drew the ${label(swap_note.new_card)}. You still have a pair, but now it's a pair of 9s, which is weaker, and the swap cost $${SWAP_COST}. Tip: keep the cards that make your hand.`
          : `Nice! You traded the ${label(swap_note.old_card)} for the ${label(swap_note.new_card)}. Now you have Three of a Kind, which pays 3:1 on the raise instead of 1:1.`,
      next: "choose_after",
    },
    choose_after: {
      highlight: "actions",
      text: "You can only swap once per hand. Now choose: Raise or Fold.",
    },
    reveal: {
      highlight: "dealer",
      text: "The dealer flips their cards and has a pair of 8s. The dealer needs Ace-King high or better to qualify, so they qualify, and your hand is compared with theirs.\nIf the dealer doesn't qualify, your ante pays 1:1 and your raise is returned, no matter what you hold.",
      next: "result",
    },
    result: {
      highlight: "balance",
      text: `Your ${hand_name} beats the dealer's pair of 8s. You win! Your ante pays 1:1 (+$${ANTE}) and your raise pays ${payout}:1 (+$${RAISE * payout}).${swap_used ? ` The swap cost $${SWAP_COST}.` : ""} You started with $${START_BALANCE.toLocaleString()} and now have $${balance.toLocaleString()}.`,
      next: "end",
    },
    folded: {
      highlight: "dealer",
      text: `You folded, so you lose your $${ANTE} ante${swap_used ? ` and the $${SWAP_COST} swap fee` : ""}, but nothing more. The hand still plays out for the others, so the dealer's cards are revealed: a pair of 8s. Your hand would have beaten it, and raising would have left you with $${raise_balance.toLocaleString()} instead of $${balance.toLocaleString()}.`,
      next: "end",
    },
    end: {
      text: "That's a full hand of Caribbean Stud! Stronger hands pay more on the raise, up to 100:1 for a Royal Flush. Replay the tutorial to try a different choice, or head to the lobbies to play for real.",
    },
  };

  const current = steps[active_step];
  const locked = !ACTION_STEPS.includes(active_step);

  return (
    <div style={{ paddingBottom: 240 }}>
      <GameTableView
        table={table}
        lobby={practice_lobby}
        status_text={dealt ? my_message : "Press Deal to start a hand."}
        seconds_left={state.seconds_left}
        timer_label={state.timer_frozen && !done ? "Paused" : "Play Timer"}
        chat_log={chat_log}
        chat_input={chat_input}
        on_chat_input_change={set_chat_input}
        on_send_chat={handle_send_chat}
        swap_mode={swap_mode}
        on_toggle_swap={() => set_swap_mode((on) => !on)}
        on_swap_card={swap_card}
        on_fold={fold}
        on_raise={raise}
        on_deal={deal}
        on_exit={() => navigate("/menu")}
        exit_label="Exit Tutorial"
        locked={locked}
        highlight={current.highlight}
      />

      <div className="panel tutorial_coach" role="status">
        <div className="tutorial_coach_text">{current.text}</div>
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          {active_step === "end" ? (
            <>
              <button className="btn" onClick={() => navigate("/menu")}>Exit</button>
              <button className="btn" onClick={replay}>Replay Tutorial</button>
              <button className="btn primary" onClick={() => navigate("/lobbies")}>Find a Game</button>
            </>
          ) : (
            current.next && <button className="btn primary" onClick={() => go_to(current.next)}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
