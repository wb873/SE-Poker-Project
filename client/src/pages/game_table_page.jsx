import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { use_session } from "../session.jsx";
import PlayingCard from "../components/playing_card.jsx";
import { mock_hand, mock_dealer_up_card } from "../mock_data.js";

// Seat positions (percent of table area) for 7 seats, mirroring the mockup layout
const seat_positions = [
  { left: "10%", top: "28%" },
  { left: "17%", top: "58%" },
  { left: "32%", top: "82%" },
  { left: "50%", top: "90%" }, // "you" seat
  { left: "68%", top: "82%" },
  { left: "83%", top: "58%" },
  { left: "90%", top: "28%" },
];

const mock_seats = [
  { name: "chrism", status: "Raised", ante: 10 },
  { name: "Bot 1", status: "Waiting", ante: 10 },
  { name: "will_b", status: "Folded", ante: 10 },
  { name: "YOU", status: "", ante: 10 },
  { name: "Bot 2", status: "Thinking", ante: 10 },
  { name: "Jason", status: "Waiting", ante: 10 },
  { name: "mrpoker", status: "Raised", ante: 10 },
];

const turn_seconds = 30;
const hand_rank_label = "Pair of Kings";

// Game table: gameplay mock (stories G1-G7). Real game logic will live on the server.
export default function GameTablePage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const is_spectator = search_params.get("spectate") === "1";
  const { balance, set_balance } = use_session();

  const [phase, set_phase] = useState("ante"); // ante | decision | done
  const [seconds_left, set_seconds_left] = useState(turn_seconds);
  const [status_text, set_status_text] = useState("Your turn: place your ante");
  const [side_bet_on, set_side_bet_on] = useState(false);
  const [chat_input, set_chat_input] = useState("");
  const [chat_log, set_chat_log] = useState([{ user: "chrism", text: "good luck all" }]);

  const ante_amount = 10;
  const raise_amount = ante_amount * 2;

  // Turn timer countdown (G7)
  useEffect(() => {
    if (phase === "done" || is_spectator) return;
    const timer_id = setInterval(() => {
      set_seconds_left((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer_id);
  }, [phase, is_spectator]);

  // Auto-fold when the timer runs out
  useEffect(() => {
    if (seconds_left === 0 && phase !== "done") handle_fold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds_left]);

  function handle_ante() {
    set_balance(balance - ante_amount);
    set_phase("decision");
    set_seconds_left(turn_seconds);
    set_status_text("Your turn: raise or fold");
  }

  function handle_raise() {
    set_balance(balance - raise_amount);
    set_phase("done");
    set_status_text("You Win: $" + ante_amount * 3 + " (mock result)");
  }

  function handle_fold() {
    set_phase("done");
    set_status_text("You folded. Dealer Wins: $" + ante_amount);
  }

  function handle_next_hand() {
    set_phase("ante");
    set_seconds_left(turn_seconds);
    set_side_bet_on(false);
    set_status_text("Your turn: place your ante");
  }

  function handle_send_chat(event) {
    event.preventDefault();
    if (!chat_input.trim()) return;
    set_chat_log([...chat_log, { user: "You", text: chat_input.trim() }]);
    set_chat_input("");
  }

  return (
    <div className="table_page">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={() => navigate("/lobbies")}>Exit Table</button>
        {is_spectator && <span className="tag cyan">Spectating</span>}
      </div>

      {/* Table and seats */}
      <div className="table_wrap">
        <div className="felt" />
        <div className="dealer_seat">
          <div className="seat" style={{ position: "static", transform: "none", margin: "0 auto" }}>
            <div className="circle">DEALER</div>
          </div>
        </div>
        <div className="dealer_cards">
          {[0, 1, 2, 3].map((i) => <PlayingCard key={i} face_down />)}
          <PlayingCard card={mock_dealer_up_card} />
        </div>
        {seat_positions.map((position, index) => {
          const seat = mock_seats[index];
          const is_you = seat.name === "YOU";
          return (
            <div key={index} className={"seat" + (is_you ? " you" : "")} style={position}>
              <div className="circle">{seat.name.slice(0, 6)}</div>
              <div className="status">{seat.status || (is_you ? "You" : "")}</div>
              <span className="ante_chip">ANTE ${seat.ante}</span>
            </div>
          );
        })}
      </div>

      {/* Controls area */}
      <div className="table_controls">
        <div className="panel chat_box">
          <h3>Chat</h3>
          <div className="chat_log">
            {chat_log.map((entry, index) => (
              <div key={index}><b>{entry.user}:</b> {entry.text}</div>
            ))}
          </div>
          <form className="row" onSubmit={handle_send_chat}>
            <input className="input" placeholder="Say something..." value={chat_input} onChange={(e) => set_chat_input(e.target.value)} />
          </form>
        </div>

        <div>
          <div className="panel status_box">
            <div className="big">{status_text}</div>
            {phase === "done" && !is_spectator && (
              <div><button className="btn small primary" onClick={handle_next_hand}>Next Hand</button></div>
            )}
          </div>
          <div className="panel" style={{ marginTop: 10, textAlign: "center" }}>Balance: ${balance.toLocaleString()}</div>

          <div className="hand_row">
            {mock_hand.map((card, index) => <PlayingCard key={index} card={card} big />)}
          </div>

          {!is_spectator && (
            <div className="action_row">
              <button className="action_btn main" disabled={phase !== "ante"} onClick={handle_ante}>Ante<br />${ante_amount}</button>
              <button className="action_btn" disabled={phase === "done"} onClick={() => set_side_bet_on(!side_bet_on)}>
                Side Bet<br />{side_bet_on ? "ON" : "OFF"}
              </button>
              <button className="action_btn" disabled={phase !== "decision"} onClick={handle_fold}>Fold</button>
              <button className="action_btn main" disabled={phase !== "decision"} onClick={handle_raise}>Raise<br />${raise_amount}</button>
            </div>
          )}
        </div>

        <div>
          <div className={"round_badge" + (seconds_left <= 5 ? " low" : "")}>
            <div>
              <div className="num">{seconds_left}</div>
              <div className="muted">Play Timer</div>
            </div>
          </div>
          <div className="round_badge">
            <div>
              <div className="muted">Hand Rank</div>
              <b>{hand_rank_label}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
