import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import GameTableView from "../components/game_table_view.jsx";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";

export default function GameTablePage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const is_spectator = search_params.get("spectate") === "1";
  const { lobby_id } = useParams();
  const { player, token, set_balance } = use_session();
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
      // Keep the session balance (main menu, out of chips panel) in step with the seat
      const mine = state.seats.find((seat) => seat.isYou);
      if (mine && !player.is_guest) set_balance(mine.balance);
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
  }, [lobby_id, player.username, player.is_guest, is_spectator, token, navigate]);

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
  const status_text = !table
    ? "Connecting to the table..."
    : is_spectator
      ? "You are spectating."
      : me?.message || (phase === "decision" ? "Waiting for the next hand." : "Press Deal to start a hand.");

  return (
    <GameTableView
      table={table}
      lobby={lobby}
      is_spectator={is_spectator}
      error={error}
      on_dismiss_error={() => set_error("")}
      status_text={status_text}
      seconds_left={seconds_left}
      chat_log={chat_log}
      chat_input={chat_input}
      on_chat_input_change={set_chat_input}
      on_send_chat={handle_send_chat}
      swap_mode={swap_mode}
      on_toggle_swap={() => set_swap_mode((on) => !on)}
      on_swap_card={swap_card}
      on_fold={() => send("table:action", { action: "fold" })}
      on_raise={() => send("table:action", { action: "raise" })}
      on_deal={() => send("table:deal")}
      on_exit={exit_table}
    />
  );
}
