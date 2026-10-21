import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/page_header.jsx";

import { use_session } from "../session.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Create lobby form (stories L1, L4, L5, L6)
export default function CreateLobbyPage() {
  const navigate = useNavigate();

  const { player } = use_session();
  const [error, set_error] = useState("");
  const [saving, set_saving] = useState(false);

  const [form, set_form] = useState({
    name: "",
    visibility: "public",
    password: "",
    max_players: 7,
    ante: 10,
    bots_enabled: false,
    bot_amount: 1,
    bot_difficulty: "medium",
    turn_timer: 30,
    side_bets: true,
  });

  // Update a single form field
  function update_field(field_name, value) {
    set_form((previous) => ({ ...previous, [field_name]: value }));
  }

  async function handle_create(event) {
  event.preventDefault();
  set_error("");
  set_saving(true);
  try {
    const response = await fetch(`${API_URL}/api/lobbies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        host: player.username,
        visibility: form.visibility,
        password: form.password,
        maxPlayers: form.max_players,
        ante: form.ante,
        turnTimer: form.turn_timer,
        sideBets: form.side_bets,
        botsEnabled: form.bots_enabled,
        botAmount: form.bot_amount,
        botDifficulty: form.bot_difficulty,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create lobby.");
    navigate(`/table/${data.lobby.id}`);
  } catch (err) {
    set_error(err.message);
  } finally {
    set_saving(false);
  }
}

  return (
    <div className="page">
      <PageHeader title="Create Lobby" />

      <form className="form_grid" onSubmit={handle_create}>
        <label>Lobby Name
          <input className="input" required value={form.name} onChange={(e) => update_field("name", e.target.value)} />
        </label>

        <label>Visibility
          <select className="input" value={form.visibility} onChange={(e) => update_field("visibility", e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        {form.visibility === "private" && (
          <label>Password
            <input className="input" type="password" value={form.password} onChange={(e) => update_field("password", e.target.value)} />
          </label>
        )}

        <label>Max Players
          <select className="input" value={form.max_players} onChange={(e) => update_field("max_players", Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>

        <label>Ante Amount
          <input className="input" type="number" min="1" value={form.ante} onChange={(e) => update_field("ante", Number(e.target.value))} />
        </label>

        <div className="panel">
          <label className="toggle_row">
            <input type="checkbox" checked={form.bots_enabled} onChange={(e) => update_field("bots_enabled", e.target.checked)} /> Bots
          </label>
          {form.bots_enabled && (
            <div className="row" style={{ marginTop: 10 }}>
              <select className="input" value={form.bot_amount} onChange={(e) => update_field("bot_amount", Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} bot{n > 1 ? "s" : ""}</option>)}
              </select>
              <select className="input" value={form.bot_difficulty} onChange={(e) => update_field("bot_difficulty", e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          )}
        </div>

        <label>Turn Timer (seconds)
          <select className="input" value={form.turn_timer} onChange={(e) => update_field("turn_timer", Number(e.target.value))}>
            {[15, 30, 45, 60].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>

        <label className="toggle_row">
          <input type="checkbox" checked={form.side_bets} onChange={(e) => update_field("side_bets", e.target.checked)} /> Allow Side Bets
        </label>
        {error && <div className="error_text">{error}</div>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={saving} style={{ padding: "14px 28px" }}>{saving ? "Creating..." : "Create Lobby"}</button>          
          <button type="button" className="btn" onClick={() => alert("Invite friends (coming soon)")}>Invite Friends</button>
          <span className="spacer" />
          <button type="button" className="btn danger" onClick={() => navigate("/menu")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
