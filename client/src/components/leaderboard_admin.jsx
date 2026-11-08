import React, { useEffect, useState } from 'react';
import { API_URL } from '../api_config.js';

export default function LeaderboardAdmin({ token, refresh }) {
  const [settings, set_settings] = useState(null);
  const [name, set_name] = useState('');
  const [target, set_target] = useState('monthly');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const [notice, set_notice] = useState('');
  const seasons = settings?.seasons || [];
  const reset_season = seasons.find((season) => season.id === target);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${API_URL}/api/admin/leaderboard`, {
          signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load leaderboard settings.');
        if (!controller.signal.aborted) { set_settings(data); set_error(''); }
      } catch (err) { if (!controller.signal.aborted) set_error(err.message); }
    }
    load();
    return () => controller.abort();
  }, [token, refresh]);

  async function update(body, message, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/leaderboard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the leaderboard.');
      set_settings(data); set_notice(message);
      if (body.action === 'delete-season' && body.seasonId === target) set_target('monthly');
      if (body.action === 'start-season') set_name('');
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  return <section className="panel admin_section" aria-labelledby="leaderboard_admin_title">
    <h2 id="leaderboard_admin_title">Leaderboard Management</h2>
    {error && <p role="alert" className="error_text">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!settings ? <p role="status">Leaderboard settings are unavailable. Use Refresh to try again.</p> : <>
      <p>Displayed to players: <b>{settings.mode === 'seasonal' ? settings.season?.name : 'Monthly leaderboard'}</b></p>
      <p className="muted">Monthly results always accumulate. Only the selected season receives new results, including while monthly rankings are displayed. Other saved seasons keep their standings.</p>
      <p>Tracking season: <b>{settings.season?.name || 'None selected'}</b></p>
      <div className="row wrap">
        <button className="btn" disabled={busy || settings.mode === 'monthly'}
          onClick={() => update({ action: 'set-mode', mode: 'monthly' }, 'Players now see monthly rankings. The season is preserved.')}>Show Monthly</button>
        {settings.mode === 'monthly' && <span className="tag cyan">Tracking</span>}
      </div>
      <h3 className="admin_section">Saved Seasons</h3>
      {seasons.length === 0 && <p className="muted">No saved seasons yet.</p>}
      <div className="list">
        {seasons.map((season) => <div key={season.id} className="row wrap">
          <button className={'btn' + (settings.mode === 'seasonal' && settings.selectedSeasonId === season.id ? ' primary' : '')}
            aria-pressed={settings.mode === 'seasonal' && settings.selectedSeasonId === season.id} disabled={busy}
            onClick={() => update({ action: 'select-season', seasonId: season.id }, `${season.name} is now displayed and receiving new results.`)}>{season.name}</button>
          {settings.mode === 'seasonal' && settings.selectedSeasonId === season.id && <span className="tag cyan">Tracking</span>}
          <button className="btn small danger" disabled={busy} aria-label={`Delete ${season.name}`}
            onClick={() => update({ action: 'delete-season', seasonId: season.id }, `${season.name} deleted.`,
              `Delete ${season.name} from saved seasons? Its button will be removed. If selected, users will return to monthly rankings and seasonal tracking will stop.`)}>Delete</button>
        </div>)}
      </div>
      <form className="form_grid admin_section" onSubmit={(event) => {
        event.preventDefault();
        update({ action: 'start-season', name: name.trim() }, 'New season saved, displayed, and selected for tracking. Other seasons have been preserved.');
      }}>
        <label>New season name<input className="input" required maxLength={60} value={name} onChange={(event) => set_name(event.target.value)} placeholder="Winter Championship" /></label>
        <button className="btn primary" disabled={busy || !name.trim()}>Start and Show New Season</button>
      </form>
      <div className="form_grid admin_section">
        <label>Leaderboard to reset<select className="input" value={target} onChange={(event) => set_target(event.target.value)}>
          <option value="monthly">Current month</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select></label>
        <button className="btn danger" disabled={busy || (target !== 'monthly' && !reset_season)}
          onClick={() => update({ action: 'reset', target: target === 'monthly' ? 'monthly' : 'seasonal',
            ...(target !== 'monthly' ? { seasonId: target } : {}) }, 'Selected standings reset. Its name and button have been kept.',
            `Reset ${target === 'monthly' ? 'the current month' : reset_season?.name} to zero for everyone? This cannot be undone here. Its name, button, and the displayed leaderboard will not change.`)}>Reset Selected Leaderboard</button>
      </div>
    </>}
  </section>;
}
