import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";
import MonthlyLeaderboard from '../components/monthly_leaderboard.jsx';
import OutOfChips from "../components/out_of_chips.jsx";
import { mock_friends } from "../mock_data.js";
import { API_URL } from "../api_config.js";
import { join_lobby } from "../lobby_api.js";

// Main menu: navigation, welcome/balance, quick-join lobbies, friends online
export default function MainMenuPage() {
  const navigate = useNavigate();
  const { player, balance, logout } = use_session();
  const is_guest = player.is_guest;

  const online_friends = mock_friends.filter((f) => f.status !== "offline");
  const [quick_lobbies, set_quick_lobbies] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/lobbies`)
      .then((response) => response.json())
      .then((data) => set_quick_lobbies((data.lobbies || []).filter((l) => l.openSeats > 0).slice(0, 4)))
      .catch(() => {});
  }, []);

  async function quick_join(lobby) {
    try {
      await join_lobby(lobby.id, player.username);
      navigate(`/table/${lobby.id}`);
    } catch (err) {
      alert(err.message);
    }
  }
  function handle_logout() {
    logout();
    navigate("/");
  }

  return (
    <div className="page">
      <div className="top_bar">
        {is_guest ? (
          <button className="btn" onClick={handle_logout}>Create Account / Login</button>
        ) : (
          <button className="btn" onClick={handle_logout}>Log Out</button>
        )}
        <div className="title">Caribbean Stud Poker Game</div>
        <div className="logo_box">♠</div>
      </div>

      <div className="menu_layout">
        <div className="menu_nav">
          <button className="btn primary find_game" onClick={() => navigate("/lobbies")}>Find Game</button>
          <button className="btn" onClick={() => navigate("/lobbies/new")}>Create Lobby</button>
          <button className="btn" onClick={() => navigate("/lobbies")}>Join with Code</button>
          <button className="btn" disabled={is_guest} onClick={() => navigate("/profile")}>Profile</button>
          <button className="btn" disabled={is_guest} onClick={() => navigate("/friends")}>Friends</button>
          <button className="btn" disabled={is_guest} onClick={() => navigate('/contact')}>Contact Admin</button>
          {player.is_admin && <button className="btn" onClick={() => navigate('/admin')}>Admin Dashboard</button>}
          <button className="btn" onClick={() => navigate("/tutorial")}>Tutorial</button>
        </div>

        <div className="menu_center">
          <div className="panel">
            <h2>Welcome Back, {player.username}!</h2>
            <div className="balance_chip" style={{ display: "inline-block" }}>Balance: ${balance.toLocaleString()}</div>
            {is_guest && <p className="muted">Guest balances are not saved. Create an account to keep your progress.</p>}
          </div>
          <OutOfChips />

          <div className="panel">
            <h3>Available Lobbies (Quick Join)</h3>
            <div className="list">
              {quick_lobbies.map((lobby) => (
                <div key={lobby.id} className="list_item">
                  <div>
                    <b>{lobby.name}</b>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {lobby.playerCount}/{lobby.maxPlayers} players · Ante ${lobby.ante.toLocaleString()}
                    </div>
                  </div>
                  <span className="spacer" />
                  <button className="btn small primary" onClick={() => quick_join(lobby)}>Join</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="menu_sidebar">
          <div className="panel">
          <h3>Friends Online</h3>
          {is_guest ? (
            <p className="muted">Log in to see your friends.</p>
          ) : (
            <div className="list">
              {online_friends.map((f) => (
                <div key={f.id} className="muted" style={{ fontSize: 14 }}>
                  <b style={{ color: "var(--text)" }}>{f.username}</b> – {f.detail}
                </div>
              ))}
            </div>
          )}
          {player.is_admin && <p className="tag cyan" style={{ marginTop: 20 }}>Admin controls coming soon</p>}
          </div>
          <MonthlyLeaderboard key={player.id || 'guest'} />
        </aside>
      </div>
    </div>
  );
}
