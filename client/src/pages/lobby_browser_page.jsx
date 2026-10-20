import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/page_header.jsx";
import { mock_lobbies } from "../mock_data.js";

// Lobby browser with filters (story L3, L2)
export default function LobbyBrowserPage() {
  const navigate = useNavigate();
  const [search, set_search] = useState("");
  const [region, set_region] = useState("all");
  const [max_ante, set_max_ante] = useState("any");
  const [hide_full, set_hide_full] = useState(false);
  const [friends_playing, set_friends_playing] = useState(false);
  const [lobbies, set_lobbies] = useState(mock_lobbies);

  // Apply all filters to the lobby list
  const visible_lobbies = lobbies.filter((lobby) => {
    if (search && !lobby.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (region !== "all" && lobby.region !== region) return false;
    if (max_ante !== "any" && lobby.ante > Number(max_ante)) return false;
    if (hide_full && lobby.players >= lobby.max_players) return false;
    if (friends_playing && !["l1", "l2"].includes(lobby.id)) return false; // mock friend check
    return true;
  });

  return (
    <div className="page">
      <PageHeader title="Lobby Browser" />

      <div className="filters">
        <select className="input" value={region} onChange={(e) => set_region(e.target.value)}>
          <option value="all">Region: All</option>
          <option>US East</option>
          <option>US West</option>
          <option>Europe</option>
        </select>
        <select className="input" value={max_ante} onChange={(e) => set_max_ante(e.target.value)}>
          <option value="any">Ante: Any</option>
          <option value="10">Up to $10</option>
          <option value="100">Up to $100</option>
          <option value="1000">Up to $1,000</option>
        </select>
        <label className="toggle_row">
          <input type="checkbox" checked={hide_full} onChange={(e) => set_hide_full(e.target.checked)} /> Hide Full
        </label>
        <label className="toggle_row">
          <input type="checkbox" checked={friends_playing} onChange={(e) => set_friends_playing(e.target.checked)} /> Friends Playing
        </label>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => navigate("/lobbies/new")}>Create Lobby</button>
        <button className="btn" onClick={() => set_lobbies([...mock_lobbies])}>Refresh</button>
        <input className="input" placeholder="Search lobbies..." value={search} onChange={(e) => set_search(e.target.value)} />
      </div>

      <div className="list">
        {visible_lobbies.length === 0 && <p className="muted">No lobbies match your filters.</p>}
        {visible_lobbies.map((lobby) => {
          const is_full = lobby.players >= lobby.max_players;
          return (
            <div key={lobby.id} className="list_item">
              <div>
                <b>{lobby.name}</b> <span className="muted">(Host: {lobby.host})</span>
                <div className="muted" style={{ fontSize: 13 }}>
                  {lobby.players}/{lobby.max_players} players · Ante ${lobby.ante.toLocaleString()} · Bots: {lobby.bots ? "Yes" : "No"} · {lobby.region}
                </div>
              </div>
              <span className="spacer" />
              {lobby.is_private && <span className="tag">Private</span>}
              {is_full ? (
                <button className="btn small" onClick={() => navigate(`/table/${lobby.id}?spectate=1`)}>Spectate</button>
              ) : (
                <button className="btn small primary" onClick={() => navigate(`/table/${lobby.id}`)}>Join</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
