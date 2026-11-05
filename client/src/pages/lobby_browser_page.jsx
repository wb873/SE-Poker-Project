import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/page_header.jsx";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";
import { join_lobby } from "../lobby_api.js";

// Lobby browser with filters and join (stories L3, L2)
export default function LobbyBrowserPage() {
  const navigate = useNavigate();
  const { player } = use_session();
  const [search, set_search] = useState("");
  const [max_ante, set_max_ante] = useState("any");
  const [hide_full, set_hide_full] = useState(false);
  const [lobbies, set_lobbies] = useState([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState("");
  const [joining_id, set_joining_id] = useState(null);
  const [refresh, set_refresh] = useState(0);
  const [code, set_code] = useState("");
  const [code_password, set_code_password] = useState("");

  // Load public lobbies from the server
  useEffect(() => {
    let active = true;
    async function load_lobbies() {
      set_loading(true);
      try {
        const response = await fetch(`${API_URL}/api/lobbies`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load lobbies.");
        if (active) set_lobbies(data.lobbies);
      } catch (err) {
        if (active) set_error(err.message || "Could not reach the server.");
      } finally {
        if (active) set_loading(false);
      }
    }
    load_lobbies();
    return () => { active = false; };
  }, [refresh]);

  // Join a lobby, then go to its table
  async function handle_join(lobby_id, password) {
    set_joining_id(lobby_id);
    set_error("");
    try {
      const lobby = await join_lobby(lobby_id, player.username, password);
      navigate(`/table/${lobby.id}`);
    } catch (err) {
      set_error(err.message);
    } finally {
      set_joining_id(null);
    }
  }

  const bot_seats = (lobby) => (lobby.bots?.enabled ? lobby.bots.amount : 0);
  const seats_taken = (lobby) => lobby.playerCount + bot_seats(lobby);
  const is_full = (lobby) => lobby.openSeats <= 0;

  const visible_lobbies = lobbies.filter((lobby) => {
    if (search && !lobby.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (max_ante !== "any" && lobby.ante > Number(max_ante)) return false;
    if (hide_full && is_full(lobby)) return false;
    return true;
  });

  return (
    <div className="page">
      <PageHeader title="Lobby Browser" />

      <div className="filters">
        <select className="input" value={max_ante} onChange={(e) => set_max_ante(e.target.value)}>
          <option value="any">Ante: Any</option>
          <option value="10">Up to $10</option>
          <option value="100">Up to $100</option>
          <option value="1000">Up to $1,000</option>
        </select>
        <label className="toggle_row">
          <input type="checkbox" checked={hide_full} onChange={(e) => set_hide_full(e.target.checked)} /> Hide Full
        </label>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => navigate("/lobbies/new")}>Create Lobby</button>
        <button className="btn" disabled={loading} onClick={() => { set_error(""); set_refresh((v) => v + 1); }}>Refresh</button>
        <input className="input" placeholder="Search lobbies..." value={search} onChange={(e) => set_search(e.target.value)} />
      </div>

      {/* Private lobbies are not listed, so players join them by lobby code + password */}
      <form
        className="row panel"
        style={{ marginBottom: 14 }}
        onSubmit={(event) => { event.preventDefault(); handle_join(code.trim(), code_password); }}
      >
        <input className="input" placeholder="Lobby code" value={code} onChange={(e) => set_code(e.target.value)} />
        <input className="input" type="password" placeholder="Password (private lobbies)" value={code_password} onChange={(e) => set_code_password(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!code.trim() || joining_id !== null}>Join with Code</button>
      </form>

      {error && <p className="error_text" role="alert">{error}</p>}
      {loading && <p role="status">Loading lobbies...</p>}

      <div className="list">
        {!loading && visible_lobbies.length === 0 && <p className="muted">No lobbies match your filters.</p>}
        {visible_lobbies.map((lobby) => (
          <div key={lobby.id} className="list_item">
            <div>
              <b>{lobby.name}</b> <span className="muted">(Host: {lobby.host})</span>
              <div className="muted" style={{ fontSize: 13 }}>
                {seats_taken(lobby)}/{lobby.maxPlayers} seats · Ante ${lobby.ante.toLocaleString()} · {lobby.turnTimer}s timer
                · Side bets: {lobby.sideBets ? "Yes" : "No"}
                · Bots: {lobby.bots?.enabled ? `${lobby.bots.amount} (${lobby.bots.difficulty})` : "No"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>Players: {lobby.players.join(", ")}</div>
            </div>
            <span className="spacer" />
            {is_full(lobby) ? (
              <button className="btn small" onClick={() => navigate(`/table/${lobby.id}?spectate=1`)}>Spectate</button>
            ) : (
              <button className="btn small primary" disabled={joining_id !== null} onClick={() => handle_join(lobby.id)}>
                {joining_id === lobby.id ? "Joining..." : "Join"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}