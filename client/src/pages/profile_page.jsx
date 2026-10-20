import React, { useState } from "react";
import PageHeader from "../components/page_header.jsx";
import { use_session } from "../session.jsx";
import { mock_stats, avatar_options } from "../mock_data.js";

// Profile and statistics (stories P9, avatar selection)
export default function ProfilePage() {
  const { player } = use_session();
  const [avatar, set_avatar] = useState(avatar_options[0]);
  const [editing, set_editing] = useState(false);

  const money = (value) => (value < 0 ? "-$" : "$") + Math.abs(value).toLocaleString();

  const stat_cards = [
    { label: "Hands Played", value: mock_stats.hands_played.toLocaleString() },
    { label: "Hands Won", value: mock_stats.hands_won.toLocaleString() },
    { label: "Win Rate", value: mock_stats.win_rate },
    { label: "Total Winnings", value: money(mock_stats.total_winnings) },
    { label: "Biggest Win", value: money(mock_stats.biggest_win) },
    { label: "Best Hand", value: mock_stats.best_hand },
    { label: "Times Folded", value: mock_stats.times_folded.toLocaleString() },
    { label: "Side Bet Winnings", value: money(mock_stats.side_bet_winnings) },
  ];

  return (
    <div className="page">
      <PageHeader title={`${player.username}'s Stats`} />

      <div className="profile_avatar">{avatar}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <div className="panel">User Since: {mock_stats.user_since}</div>
        <button className="btn" onClick={() => set_editing(!editing)}>{editing ? "Done" : "Edit"}</button>
      </div>

      {editing && (
        <div className="avatar_picker">
          {avatar_options.map((option) => (
            <button key={option} className={option === avatar ? "selected" : ""} onClick={() => set_avatar(option)}>{option}</button>
          ))}
        </div>
      )}

      <div className="stat_grid">
        {stat_cards.map((card) => (
          <div key={card.label} className="stat_card">
            <div className="value">{card.value}</div>
            <div className="label">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
