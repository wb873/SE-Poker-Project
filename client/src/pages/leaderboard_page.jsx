import React, { useEffect, useState } from "react";
import PageHeader from "../components/page_header.jsx";
import { use_session } from "../session.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Monthly leaderboard: players ranked by net chips won this month (story LB1)
export default function LeaderboardPage() {
  const { player } = use_session();
  const [players, set_players] = useState([]);
  const [since, set_since] = useState(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState("");

  const money = (value) => (value < 0 ? "-$" : "+$") + Math.abs(value).toLocaleString();

  useEffect(() => {
    async function load_leaderboard() {
      try {
        const response = await fetch(`${API_URL}/api/leaderboard`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the leaderboard.");
        set_players(data.players);
        set_since(new Date(data.since));
      } catch (err) {
        set_error(err.message);
      } finally {
        set_loading(false);
      }
    }
    load_leaderboard();
  }, []);

  return (
    <div className="page">
      <PageHeader title="Monthly Leaderboard" />

      {since && (
        <p className="muted">
          Net chips won since {since.toLocaleDateString(undefined, { month: "long", day: "numeric" })}. Only logged-in players' hands count.
        </p>
      )}
      {error && <p role="alert" className="error_text">{error}</p>}
      {loading && <p className="muted">Loading...</p>}

      <div className="list">
        {players.map((p, index) => (
          <div key={p.username} className="list_item">
            <b>#{index + 1}</b>
            <div className="avatar_circle">{p.username[0].toUpperCase()}</div>
            <b>{p.username}</b>
            {p.username === player.username && <span className="tag">You</span>}
            <span className="spacer" />
            <span className="muted">{p.hands} hands</span>
            <b>{money(p.net)}</b>
          </div>
        ))}
        {!loading && !error && players.length === 0 && <p className="muted">No hands played this month yet.</p>}
      </div>
    </div>
  );
}