import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PlayingCard from "../components/playing_card.jsx";
import { io } from "socket.io-client";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";

const seat_positions = [
  { left: "10%", top: "28%" },
  { left: "17%", top: "58%" },
  { left: "32%", top: "82%" },
  { left: "50%", top: "90%" },
  { left: "68%", top: "82%" },
  { left: "83%", top: "58%" },
  { left: "90%", top: "28%" },
];
const MY_POSITION = 3; // bottom centre

const status_labels = { waiting: "Waiting", deciding: "Deciding...", raised: "Raised", folded: "Folded" };
const result_labels = {
  win: "Won",
  loss: "Lost",
  push: "Push (tie)",
  fold: "Folded",
  dealer_not_qualified: "Dealer didn't qualify",
};

export default function GameTablePage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const is_spectator = search_params.get("spectate") === "1";
  const { lobby_id } = useParams();
  const { player, token } = use_session();
  const socket_ref = useRef(null);
  const clock_offset = useRef(0); // server time minus this browser's time

  const [lobby, set_lobby] = useState(null);
  const [table, set_table] = useState(null);
  const [error, set_error] = useState("");
  const [seconds_left, set_seconds_left] = useState(0);
  const [swap_mode, set_swap_mode] = useState(false);
  const [chat_input, set_chat_input] = useState("");
  const [chat_log, set_chat_log] = useState([
    { user: "System", text: "Welcome to Caribbean Stud Poker!" },
  ]);

  // Static lobby info (name, host, settings)
  useEffect(() => {
    let active = true;
    async function load_lobby() {
      try {
        const response = await fetch(`${API_URL}/api/lobbies/${encodeURIComponent(lobby_id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the lobby.");
        if (active) set_lobby(data.lobby);
      } catch (err) {
        if (active) set_error(err.message);
      }
    }
    load_lobby();
    return () => { active = false; };
  }, [lobby_id]);

  // One socket for chat and the live table
  useEffect(() => {
    const socket = io(API_URL);
    socket_ref.current = socket;

    // Join on every connect, so a dropped connection rejoins
    socket.on("connect", () => {
      socket.emit("chat:join", { lobbyId: lobby_id, username: player.username });
      socket.emit("table:join", { lobbyId: lobby_id, username: player.username, spectate: is_spectator, token });
    });

    socket.on("table:state", (state) => {
      clock_offset.current = state.serverNow - Date.now();
      set_table(state);
    });
    socket.on("table:error", (message) => set_error(message));
    socket.on("table:closed", () => navigate("/lobbies"));

    socket.on("chat:message", (message) => {
      set_chat_log((previous) => [...previous, { user: message.user, text: message.text }]);
    });
    socket.on("chat:error", (message) => {
      set_chat_log((previous) => [...previous, { user: "System", text: message }]);
    });

    return () => socket.disconnect();
  }, [lobby_id, player.username, is_spectator, token, navigate]);

  // Countdown to the server's deadline
  useEffect(() => {
    if (table?.phase !== "decision" || !table.deadline) {
      set_seconds_left(0);
      return;
    }
    const tick = () =>
      set_seconds_left(
        Math.max(0, Math.ceil((table.deadline - (Date.now() + clock_offset.current)) / 1000))
      );
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [table?.phase, table?.deadline]);

  function send(event, payload) {
    set_error("");
    socket_ref.current?.emit(event, payload);
  }

  function exit_table() {
    socket_ref.current?.emit("table:leave");
    navigate("/lobbies");
  }

  function swap_card(index) {
    send("table:action", { action: "swap", cardIndex: index });
    set_swap_mode(false);
  }

  function handle_send_chat(event) {
    event.preventDefault();
    if (!chat_input.trim()) return;
    socket_ref.current?.emit("chat:send", { text: chat_input });
    set_chat_input("");
  }

  const phase = table?.phase ?? "waiting";
  const me = table?.seats.find((seat) => seat.isYou) ?? null;
  const others = (table?.seats ?? []).filter((seat) => !seat.isYou);
  const can_act = !is_spectator && phase === "decision" && me?.status === "deciding";
  const can_deal = !is_spectator && Boolean(me) && phase !== "decision";
  const swap_active = swap_mode && can_act && Boolean(table?.canSwap);

  // You sit at the bottom; everyone else fills the remaining seats
  const all_positions = seat_positions.map((_, index) => index);
  const other_positions = me ? all_positions.filter((index) => index !== MY_POSITION) : all_positions;
  const placed = [
    ...(me ? [{ seat: me, index: MY_POSITION }] : []),
    ...others.map((seat, i) => ({ seat, index: other_positions[i] })),
  ].filter((entry) => entry.index !== undefined);

  const player_names = table ? table.seats.map((seat) => seat.username) : (lobby?.players ?? []);
  const status_text = !table
    ? "Connecting to the table..."
    : is_spectator
      ? "You are spectating."
      : me?.message || (phase === "decision" ? "Waiting for the next hand." : "Press Deal to start a hand.");

  return (
    <div className="table_page">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={exit_table}>Exit Table</button>
        {is_spectator && <span className="tag cyan">Spectating</span>}
      </div>

      {error && (
        <div className="panel" role="alert" style={{ marginBottom: 10 }}>
          {error}
          <button className="btn small" onClick={() => set_error("")} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      {lobby && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <b>{lobby.name}</b> <span className="muted">(Host: {lobby.host})</span>
          <div className="muted" style={{ fontSize: 13 }}>Lobby code: {lobby.id}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Players: {player_names.join(", ")} · Ante ${lobby.ante} · {lobby.turnTimer}s timer ·
            Side bets: {lobby.sideBets ? "Yes" : "No"} ·
            Bots: {lobby.bots?.enabled ? `${lobby.bots.amount} (${lobby.bots.difficulty})` : "No"}
          </div>
        </div>
      )}

      {/* Table and seats */}
      <div className="table_wrap">
        <div className="felt" />

        <div className="dealer_seat">
          <div className="seat" style={{ position: "static", transform: "none", margin: "0 auto" }}>
            <div className="circle">DEALER</div>
          </div>
        </div>

        <div className="dealer_cards">
          {table?.dealerHand
            ? table.dealerHand.map((card, index) => <PlayingCard key={index} card={card} />)
            : table?.dealerUpCard && (
                <>
                  {[0, 1, 2, 3].map((index) => <PlayingCard key={index} face_down />)}
                  <PlayingCard card={table.dealerUpCard} />
                </>
              )}
        </div>

        {placed.map(({ seat, index }) => (
          <div key={seat.username} className={"seat" + (seat.isYou ? " you" : "")} style={seat_positions[index]}>
            <div className="circle">{(seat.isYou ? "YOU" : seat.username).slice(0, 6)}</div>
            <div className="status">
              {phase === "done" && seat.result ? result_labels[seat.result] : status_labels[seat.status]}
            </div>
            <div className="muted">${seat.balance.toLocaleString()}</div>
            {seat.inHand && <span className="ante_chip">ANTE ${table.ante}</span>}
            {seat.handRank && <div className="muted">{seat.handRank}</div>}
          </div>
        ))}
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
            <input className="input" placeholder="Say something..." value={chat_input} onChange={(event) => set_chat_input(event.target.value)} />
            <button className="btn small" type="submit">Send</button>
          </form>
        </div>

        <div>
          <div className="panel status_box">
            <div className="big">{status_text}</div>
            {can_deal && (
              <div>
                <button className="btn small primary" onClick={() => send("table:deal")}>
                  {phase === "waiting" ? "Deal" : "Next Hand"}
                </button>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 10, textAlign: "center" }}>
            Balance: ${me ? me.balance.toLocaleString() : "—"}
            {table && (
              <div className="muted">
                Ante: ${table.ante} · Raise: ${table.raiseAmount}
                <br />
                Phase: {phase} · Swap: {me?.swapUsed ? "used" : `available ($${table.swapCost})`}
              </div>
            )}
          </div>

          <div className="hand_row">
            {me?.hand?.map((card, index) => (
              <div
                key={index}
                role={swap_active ? "button" : undefined}
                tabIndex={swap_active ? 0 : undefined}
                aria-label={swap_active ? `Swap ${card.rank}${card.suit}` : undefined}
                style={swap_active ? { cursor: "pointer", outline: "2px dashed gold", borderRadius: 8 } : undefined}
                onClick={swap_active ? () => swap_card(index) : undefined}
                onKeyDown={
                  swap_active
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          swap_card(index);
                        }
                      }
                    : undefined
                }
              >
                <PlayingCard card={card} big />
              </div>
            ))}
          </div>

          {me && (me.handRank || table.dealerHandRank) && (
            <div className="panel" style={{ textAlign: "center" }}>
              {me.handRank && <p>Your hand: {me.handRank}</p>}
              {table.dealerHandRank && <p>Dealer hand: {table.dealerHandRank}</p>}
              {phase === "done" && me.result && <p>Result: {result_labels[me.result]}</p>}
            </div>
          )}

          {!is_spectator && me && (
            <div className="action_row">
              <button className="action_btn" disabled={!can_act} onClick={() => send("table:action", { action: "fold" })}>
                Fold
              </button>
              <button
                className="action_btn"
                disabled={!can_act || !table.canSwap}
                onClick={() => set_swap_mode((on) => !on)}
                title={me.swapUsed ? "You already swapped this hand" : `Replace one card for $${table.swapCost}`}
              >
                {swap_active ? "Cancel swap" : "Swap Card"}
                <br />
                {me.swapUsed ? "used" : `$${table.swapCost}`}
              </button>
              <button
                className="action_btn main"
                disabled={!can_act || me.balance < table.raiseAmount}
                onClick={() => send("table:action", { action: "raise" })}
              >
                Raise
                <br />${table.raiseAmount}
              </button>
            </div>
          )}
        </div>

        <div>
          <div className={"round_badge" + (seconds_left <= 5 && phase === "decision" ? " low" : "")}>
            <div>
              <div className="num">{phase === "decision" ? seconds_left : "—"}</div>
              <div className="muted">Play Timer</div>
            </div>
          </div>
          <div className="round_badge">
            <div>
              <div className="muted">Hand Rank</div>
              <b>{me?.handRank || "Not revealed"}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
