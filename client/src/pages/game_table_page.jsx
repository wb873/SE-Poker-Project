import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PlayingCard from "../components/playing_card.jsx";
import { io } from "socket.io-client";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";

const turn_seconds = 30;

// These seats are visual placeholders for the existing table design.
// Caribbean Stud is one player against the dealer.
const seat_positions = [
  { left: "10%", top: "28%" },
  { left: "17%", top: "58%" },
  { left: "32%", top: "82%" },
  { left: "50%", top: "90%" },
  { left: "68%", top: "82%" },
  { left: "83%", top: "58%" },
  { left: "90%", top: "28%" },
];

const mock_seats = [
  { name: "chris", status: "Waiting" },
  { name: "Bot 1", status: "Waiting" },
  { name: "will", status: "Waiting" },
  { name: "YOU", status: "You" },
  { name: "Bot 2", status: "Waiting" },
  { name: "brendan", status: "Waiting" },
  { name: "aidan", status: "Waiting" },
];

export default function GameTablePage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const is_spectator = search_params.get("spectate") === "1";
  const { lobby_id } = useParams();
  const { player } = use_session();
  const socket_ref = React.useRef(null);

  const [game, set_game] = useState(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState("");
  const [seconds_left, set_seconds_left] = useState(turn_seconds);
  // When true, clicking one of your cards swaps it (costs 2x ante, once per hand).
  const [swap_mode, set_swap_mode] = useState(false);

  const [chat_input, set_chat_input] = useState("");
  const [chat_log, set_chat_log] = useState([
    { user: "System", text: "Welcome to Caribbean Stud Poker!" },
  ]);

  // Start a game and let the server deal the first hand.
  async function start_game() {
    set_loading(true);
    set_error("");

    try {
      const response = await fetch(`${API_URL}/api/game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ante: 10 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not start the game.");
      }

      set_game(data.game);
      set_seconds_left(turn_seconds);
    } catch (err) {
      set_error(err.message || "Could not connect to the server.");
    } finally {
      set_loading(false);
    }
  }

  // Send an action to the backend. The backend calculates the result.
  async function send_action(action, extra = {}) {
    if (!game?.gameId || loading || is_spectator) return;

    set_loading(true);
    set_error("");

    try {
      const response = await fetch(
        `${API_URL}/api/game/current/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: game.gameId,
            action,
            ...extra,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Action failed.");
      }

      set_game(data.game);
      set_swap_mode(false);

      // A swap keeps the hand open, so only stop the timer when the hand ends.
      if (data.game.phase !== "decision") {
        set_seconds_left(0);
      }

      set_chat_log((previous) => [
        ...previous,
        { user: "System", text: data.game.message },
      ]);
    } catch (err) {
      set_error(err.message || "Could not submit your action.");
    } finally {
      set_loading(false);
    }
  }

  // Fetch the current state from the server.
  async function load_game(gameId) {
    set_loading(true);
    set_error("");

    try {
      const response = await fetch(
        `${API_URL}/api/game/current?gameId=${encodeURIComponent(gameId)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load the game.");
      }

      set_game(data.game);
    } catch (err) {
      set_error(err.message || "Could not load the game.");
    } finally {
      set_loading(false);
    }
  }

  // Start the next hand using the same server-side game and balance.
  async function handle_next_hand() {
    if (!game?.gameId || loading || is_spectator) return;

    set_loading(true);
    set_error("");

    try {
      const response = await fetch(`${API_URL}/api/game/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.gameId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not start the next hand.");
      }

      set_game(data.game);
      set_seconds_left(turn_seconds);
    } catch (err) {
      set_error(err.message || "Could not start the next hand.");
    } finally {
      set_loading(false);
    }
  }

  // Reset the local timer for each new decision.
  useEffect(() => {
    if (game?.phase !== "decision" || is_spectator) return;

    set_seconds_left(turn_seconds);

    const timer_id = setInterval(() => {
      set_seconds_left((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer_id);
  }, [game?.gameId, game?.phase, is_spectator]);

  // Auto-fold when the timer expires.
  // The ref prevents duplicate fold requests from repeated renders.
  const fold_requested = React.useRef(false);

  useEffect(() => {
    if (game?.phase !== "decision" || seconds_left !== 0) {
      fold_requested.current = false;
      return;
    }

    if (!fold_requested.current && !loading && !is_spectator) {
      fold_requested.current = true;
      send_action("fold");
    }
  }, [seconds_left, game?.phase, loading, is_spectator]);

  // Connect to this table's chat room (F5)
  useEffect(() => {
    const socket = io(API_URL);
    socket_ref.current = socket;

    // Join on every connect, so a dropped connection rejoins the room
    socket.on("connect", () => {
      socket.emit("chat:join", { lobbyId: lobby_id, username: player.username });
    });

    socket.on("chat:message", (message) => {
      set_chat_log((previous) => [...previous, { user: message.user, text: message.text }]);
    });

    socket.on("chat:error", (message) => {
      set_chat_log((previous) => [...previous, { user: "System", text: message }]);
    });

    return () => socket.disconnect();
  }, [lobby_id, player.username]);

  function handle_send_chat(event) {
    event.preventDefault();

    if (!chat_input.trim()) return;

    socket_ref.current?.emit("chat:send", { text: chat_input });
    set_chat_input("");
  }

  const phase = game?.phase ?? "waiting";
  const is_finished = phase === "done";

  return (
    <div className="table_page">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={() => navigate("/lobbies")}>
          Exit Table
        </button>

        {is_spectator && <span className="tag cyan">Spectating</span>}
      </div>

      {error && (
        <div className="panel" role="alert" style={{ marginBottom: 10 }}>
          {error}
          <button
            className="btn small"
            onClick={() => set_error("")}
            style={{ marginLeft: 8 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table and seats */}
      <div className="table_wrap">
        <div className="felt" />

        <div className="dealer_seat">
          <div
            className="seat"
            style={{
              position: "static",
              transform: "none",
              margin: "0 auto",
            }}
          >
            <div className="circle">DEALER</div>
          </div>
        </div>

        <div className="dealer_cards">
          {game?.dealerHand
            ? game.dealerHand.map((card, index) => (
                <PlayingCard key={index} card={card} />
              ))
            : game?.dealerUpCard
              ? (
                  <>
                    {[0, 1, 2, 3].map((index) => (
                      <PlayingCard key={index} face_down />
                    ))}
                    <PlayingCard card={game.dealerUpCard} />
                  </>
                )
              : null}
        </div>

        {seat_positions.map((position, index) => {
          const seat = mock_seats[index];
          const is_you = seat.name === "YOU";

          return (
            <div
              key={seat.name}
              className={"seat" + (is_you ? " you" : "")}
              style={position}
            >
              <div className="circle">{seat.name.slice(0, 6)}</div>
              <div className="status">{seat.status}</div>

              {is_you && game?.antePlaced && (
                <span className="ante_chip">ANTE ${game.ante}</span>
              )}
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
              <div key={index}>
                <b>{entry.user}:</b> {entry.text}
              </div>
            ))}
          </div>

          <form className="row" onSubmit={handle_send_chat}>
            <input
              className="input"
              placeholder="Say something..."
              value={chat_input}
              onChange={(event) => set_chat_input(event.target.value)}
            />
            <button className="btn small" type="submit">
              Send
            </button>
          </form>
        </div>

        <div>
          <div className="panel status_box">
            <div className="big">
              {loading
                ? "Processing..."
                : game?.message || "Start a game to begin."}
            </div>

            {!game && (
              <button
                className="btn small primary"
                onClick={start_game}
                disabled={loading || is_spectator}
              >
                Start Game
              </button>
            )}

            {is_finished && !is_spectator && (
              <div>
                <button
                  className="btn small primary"
                  onClick={handle_next_hand}
                  disabled={loading || game.balance < game.ante}
                >
                  Next Hand
                </button>
              </div>
            )}
          </div>

          <div
            className="panel"
            style={{ marginTop: 10, textAlign: "center" }}
          >
            Balance: ${game ? game.balance.toLocaleString() : "—"}
            {game && (
              <div className="muted">
                Ante: ${game.ante} · Raise: ${game.raiseAmount}
              </div>
            )}
          </div>

          <div className="hand_row">
            {game?.playerHand?.map((card, index) => (
              <div
                key={index}
                role={swap_mode ? "button" : undefined}
                tabIndex={swap_mode ? 0 : undefined}
                aria-label={swap_mode ? `Swap ${card.rank}${card.suit}` : undefined}
                style={
                  swap_mode
                    ? { cursor: "pointer", outline: "2px dashed gold", borderRadius: 8 }
                    : undefined
                }
                onClick={
                  swap_mode ? () => send_action("swap", { cardIndex: index }) : undefined
                }
                onKeyDown={
                  swap_mode
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          send_action("swap", { cardIndex: index });
                        }
                      }
                    : undefined
                }
              >
                <PlayingCard card={card} big />
              </div>
            ))}
          </div>

          {game && (
            <div className="panel" style={{ textAlign: "center" }}>
              {game.playerHandRank && (
                <p>Your hand: {game.playerHandRank}</p>
              )}

              {game.dealerHandRank && (
                <p>Dealer hand: {game.dealerHandRank}</p>
              )}

              {game.result && <p>Result: {game.result}</p>}
            </div>
          )}

          {!is_spectator && game && (
            <div className="action_row">
              <button
                className="action_btn"
                disabled={phase !== "decision" || loading}
                onClick={() => send_action("fold")}
              >
                Fold
              </button>

              <button
                className="action_btn"
                disabled={phase !== "decision" || loading || !game.canSwap}
                onClick={() => set_swap_mode((on) => !on)}
                title={
                  game.swapUsed
                    ? "You already swapped this hand"
                    : `Replace one card for $${game.swapCost}`
                }
              >
                {swap_mode ? "Cancel swap" : "Swap Card"}
                <br />
                {game.swapUsed ? "used" : `$${game.swapCost}`}
              </button>

              <button
                className="action_btn main"
                disabled={
                  phase !== "decision" ||
                  loading ||
                  game.balance < game.raiseAmount
                }
                onClick={() => send_action("raise")}
              >
                Raise
                <br />${game.raiseAmount}
              </button>
            </div>
          )}
        </div>

        <div>
          <div
            className={
              "round_badge" + (seconds_left <= 5 ? " low" : "")
            }
          >
            <div>
              <div className="num">
                {phase === "decision" ? seconds_left : "—"}
              </div>
              <div className="muted">Play Timer</div>
            </div>
          </div>

          <div className="round_badge">
            <div>
              <div className="muted">Hand Rank</div>
              <b>{game?.playerHandRank || "Not revealed"}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}