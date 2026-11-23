import React, { useEffect, useState } from "react";
import PageHeader from "../components/page_header.jsx";
import { use_session } from "../session.jsx";
import { avatar_options } from "../mock_data.js";
import { API_URL } from '../api_config.js';

// Profile and statistics (stories P9, avatar selection)
export default function ProfilePage() {
  const { player, token } = use_session();
  const [avatar, set_avatar] = useState(avatar_options[0]);
  const [editing, set_editing] = useState(false);
  const [stats, set_stats] = useState(null);
  const [created_at, set_created_at] = useState(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState('');
  const [refresh, set_refresh] = useState(0);
  const [avatar_error, set_avatar_error] = useState('');
  const [saving_avatar, set_saving_avatar] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load_stats() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`${API_URL}/api/auth/stats`, {
          signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load your statistics.');
        if (!controller.signal.aborted) { set_stats(data.stats); set_created_at(data.createdAt); set_error(''); }
      } catch (err) {
        if (!controller.signal.aborted) { set_stats(null); set_created_at(null); set_error(err.message); }
      } finally {
        pending = false;
        if (!controller.signal.aborted) set_loading(false);
      }
    }
    load_stats();
    const interval = setInterval(load_stats, 60000);
    window.addEventListener('focus', load_stats);
    return () => {
      controller.abort(); clearInterval(interval);
      window.removeEventListener('focus', load_stats);
    };
  }, [token, refresh]);

  const money = (value) => (value < 0 ? "-$" : "$") + Math.abs(value).toLocaleString();
  const joined = created_at && Number.isFinite(Date.parse(created_at))
    ? new Date(created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
    }) : null;

  const stat_cards = stats ? [
    { label: "Hands Played", value: stats.handsPlayed.toLocaleString() },
    { label: "Hands Won", value: stats.handsWon.toLocaleString() },
    { label: "Win Rate", value: `${stats.winRate.toLocaleString()}%` },
    { label: "Total Winnings", value: money(stats.totalWinnings) },
    { label: "Biggest Win", value: money(stats.biggestWin) },
    { label: "Best Hand", value: stats.bestHand || 'No showdown yet' },
    { label: "Times Folded", value: stats.timesFolded.toLocaleString() },
    { label: "Side Bet Winnings", value: 'Not available' },
  ] : [];

  // Load the saved avatar
useEffect(() => {
  let active = true;
  fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((response) => response.json())
    .then((data) => { if (active && avatar_options.includes(data.user?.avatar)) set_avatar(data.user.avatar); })
    .catch(() => {});
  return () => { active = false; };
}, [token]);

// Show the choice right away, save it, and go back to the old one if saving fails
async function choose_avatar(option) {
  if (option === avatar || saving_avatar) return;
  const previous = avatar;
  set_avatar(option); set_avatar_error(''); set_saving_avatar(true);
  try {
    const response = await fetch(`${API_URL}/api/auth/avatar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatar: option }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save your avatar.');
  } catch (err) {
    set_avatar(previous); set_avatar_error(err.message);
  } finally {
    set_saving_avatar(false);
  }
}
  return (
    <div className="page">
      <PageHeader title={`${player.username}'s Stats`} />

      <div className="profile_avatar">{avatar}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <div className="panel">User Since: {joined ? <time dateTime={created_at}>{joined}</time> : loading ? 'Loading...' : 'Not available'}</div>
        <button className="btn" onClick={() => set_editing(!editing)}>{editing ? "Done" : "Edit"}</button>
      </div>

      {editing && (
      <div className="avatar_picker">
        {avatar_options.map((option) => (
          <button key={option} disabled={saving_avatar} className={option === avatar ? "selected" : ""} onClick={() => choose_avatar(option)}>{option}</button>
        ))}
      </div>
    )}
    {avatar_error && <p role="alert" className="error_text">{avatar_error}</p>}

      <div className="row wrap" style={{ marginTop: 20 }}>
        <h2>Lifetime Statistics</h2>
        <button className="btn small" disabled={loading} onClick={() => { set_loading(true); set_refresh((value) => value + 1); }}>Refresh stats</button>
      </div>
      <p className="muted">Includes recorded hands across all months and seasons. Older results may be incomplete. Winnings use net chips after bets and swap fees; best hand includes showdowns only.</p>
      {loading && <p role="status">Loading statistics...</p>}
      {error && <p role="alert" className="error_text">{error}</p>}
      {stats && <div className="stat_grid">
        {stat_cards.map((card) => (
          <div key={card.label} className="stat_card">
            <div className="value">{card.value}</div>
            <div className="label">{card.label}</div>
          </div>
        ))}
      </div>}
    </div>
  );
}
