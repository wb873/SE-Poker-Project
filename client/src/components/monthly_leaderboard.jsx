import React, { useEffect, useState } from 'react';
import { API_URL } from '../api_config.js';
import { use_session } from '../session.jsx';

export default function MonthlyLeaderboard() {
  const { player, token } = use_session();
  const [data, set_data] = useState(null);
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);
  const [refresh, set_refresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`${API_URL}/api/leaderboard`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load the leaderboard.');
        set_data(result);
        set_error('');
      } catch (err) {
        if (!controller.signal.aborted) { set_error(err.message); set_data(null); }
      } finally {
        pending = false;
        if (!controller.signal.aborted) set_loading(false);
      }
    }
    load();
    // Refresh while open, including when the Eastern calendar month changes.
    const interval = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', load);
    };
  }, [token, refresh]);

  function row(entry) {
    const is_you = !player.is_guest && entry.userId === player.id;
    return <tr key={entry.userId} className={is_you ? 'leaderboard_you' : ''}>
      <td>{entry.rank}</td>
      <th scope="row"><span className="leaderboard_name">{entry.username}</span>{is_you && <span className="tag cyan">You</span>}</th>
      <td>{entry.netChips > 0 ? '+' : ''}{entry.netChips.toLocaleString()}</td>
    </tr>;
  }

  return <section id="monthly-leaderboard" className="panel monthly_leaderboard" aria-labelledby="leaderboard_title" tabIndex={-1}>
    <h2 id="leaderboard_title">Leaderboard</h2>
    <p className="muted"><small>Monthly leaderboard · Eastern time <br />
      Ranked by net chips won.</small></p>
    {loading && <p role="status">Loading rankings...</p>}
    {error && <p className="error_text" role="alert">{error}</p>}
    {data && <>
      {data.topPlayers.length > 0 ? <table className="leaderboard_table">
        <caption className="muted">Monthly net chips</caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Chips</th></tr></thead>
        <tbody>{data.topPlayers.map(row)}</tbody>
        {data.currentPlayer?.rank > 10 && <tbody className="leaderboard_personal">{row(data.currentPlayer)}</tbody>}
      </table> : <p className="muted">No ranked players yet this month.</p>}
      {!player.is_guest && !data.currentPlayer && <p className="muted">You are unranked this month. Complete a tracked hand to enter the rankings.</p>}
      {player.is_guest && <p className="muted">Registered players only. Sign in to earn a ranking.</p>}
    </>}
    <button className="btn small" disabled={loading} onClick={() => { set_loading(true); set_refresh((value) => value + 1); }}>Refresh rankings</button>
  </section>;
}
