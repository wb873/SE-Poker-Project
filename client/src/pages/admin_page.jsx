import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { use_session } from '../session.jsx';
import { API_URL } from '../api_config.js';

export default function AdminPage() {
  const navigate = useNavigate();
  const { player, token, logout } = use_session();
  const [contacts, set_contacts] = useState([]);
  const [users, set_users] = useState([]);
  const [selected_id, set_selected_id] = useState(null);
  const [drafts, set_drafts] = useState({});
  const [passwords, set_passwords] = useState({});
  const [search, set_search] = useState('');
  const [notice, set_notice] = useState('');
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  const [loading, set_loading] = useState(true);
  const [refresh, set_refresh] = useState(0);
  const selected = contacts.find((contact) => contact._id === selected_id);
  const visible_users = users.filter((user) => `${user.username} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    let active = true;
    async function load_dashboard() {
      try {
        const [messages_response, users_response] = await Promise.all([
          fetch(`${API_URL}/api/admin/contacts`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [messages, accounts] = await Promise.all([messages_response.json(), users_response.json()]);
        if (!messages_response.ok) throw new Error(messages.error || 'Could not load messages.');
        if (!users_response.ok) throw new Error(accounts.error || 'Could not load users.');
        if (!active) return;
        set_contacts(messages); set_users(accounts);
        set_selected_id((id) => messages.some((item) => item._id === id) ? id : messages[0]?._id || null);
      } catch (err) { if (active) set_error(err.message); }
      finally { if (active) set_loading(false); }
    }
    load_dashboard();
    return () => { active = false; };
  }, [token, refresh]);

  async function respond(event) {
    event.preventDefault();
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/contacts/${selected_id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reply: drafts[selected_id] }),
      });
      const contact = await response.json();
      if (!response.ok) throw new Error(contact.error || 'Could not save response.');
      set_contacts((previous) => previous.map((item) => item._id === contact._id ? contact : item));
      set_drafts((previous) => ({ ...previous, [selected_id]: '' }));
      set_notice('Response saved. The user can read it on their Contact Admin page.');
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  async function reset_password(event, user) {
    event.preventDefault();
    if (!window.confirm(`Set a temporary password for ${user.username}? Existing sessions will stop working.`)) return;
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user._id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: passwords[user._id] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not reset password.');
      set_passwords((previous) => ({ ...previous, [user._id]: '' }));
      set_users((previous) => previous.map((item) => item._id === user._id ? { ...item, mustChangePassword: true } : item));
      set_notice(`Temporary password set for ${user.username}. Email it to them at ${user.email}; no email was sent from here. They will be offered a password change when they log in.`);
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  async function toggle_admin(user) {
    const question = user.isAdmin
      ? `Remove admin rights from ${user.username}? They will lose access to this dashboard.`
      : `Make ${user.username} an admin? They will have full access to this dashboard.`;
    if (!window.confirm(question)) return;
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user._id}/admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAdmin: !user.isAdmin }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error || 'Could not change admin rights.');
      set_users((previous) => previous.map((item) => item._id === updated._id ? updated : item));
      set_notice(updated.isAdmin ? `${user.username} is now an admin.` : `${user.username} is no longer an admin.`);
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  async function toggle_ban(user) {
    if (!window.confirm(`${user.isBanned ? 'Unban' : 'Ban'} ${user.username}?`)) return;
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${user._id}/ban`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isBanned: !user.isBanned }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error || 'Could not change ban status.');
      set_users((previous) => previous.map((item) => item._id === updated._id ? updated : item));
      set_notice(`${user.username} is now ${updated.isBanned ? 'banned' : 'active'}.`);
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  return <div className="page">
    <div className="page_header">
      <h1>Admin Dashboard</h1><span className="tag cyan">{player.username}</span>
      <button className="btn" disabled={loading || busy} onClick={() => { set_loading(true); set_error(''); set_refresh((value) => value + 1); }}>Refresh</button>
      <button className="btn" onClick={() => { logout(); navigate('/'); }}>Log Out</button>
    </div>
    {loading && <p role="status">Loading messages and users...</p>}
    {error && <p className="error_text" role="alert">{error}</p>}
    {notice && <p className="panel" role="status">{notice}</p>}
    <section className="panel admin_section" aria-labelledby="contact_title">
      <h2 id="contact_title">Contact Messages</h2>
      {!loading && contacts.length === 0 && <p className="muted">No contact messages.</p>}
      <div className="admin_columns">
        <div className="list">
          {contacts.map((contact) => <button key={contact._id} disabled={busy} className={'btn admin_message' + (contact._id === selected_id ? ' primary' : '')}
            aria-pressed={contact._id === selected_id} onClick={() => set_selected_id(contact._id)}>
            <b>{contact.subject || 'No subject'}</b><br />{contact.name || contact.email} · {contact.status === 1 ? 'Responded' : 'New'}
          </button>)}
        </div>
        {selected && <div>
          <h3>{selected.subject || 'No subject'}</h3><p className="muted">From {selected.name} ({selected.email})</p>
          {selected.subject === 'Password reset request' && <button className="btn" onClick={() => {
            set_search(selected.name);
            document.getElementById('users_title')?.scrollIntoView({ behavior: 'smooth' });
          }}>Find {selected.name} in User Management</button>}
          <p className="admin_text">{selected.message}</p>
          {selected.reply && <div className="panel"><b>Saved response</b><p className="admin_text">{selected.reply}</p></div>}
          <form className="form_grid" onSubmit={respond}>
            <label htmlFor="admin_reply">Response</label>
            <textarea id="admin_reply" className="input" rows={5} required maxLength={5000} value={drafts[selected_id] || ''}
              onChange={(event) => set_drafts((previous) => ({ ...previous, [selected_id]: event.target.value }))} />
            <button className="btn primary" disabled={busy || !(drafts[selected_id] || '').trim()}>Save Response</button>
          </form>
        </div>}
      </div>
    </section>
    <section className="panel admin_section" aria-labelledby="users_title">
      <h2 id="users_title">User Management</h2>
      <label htmlFor="admin_search">Find a user</label>
      <input id="admin_search" className="input" value={search} placeholder="Username or email" onChange={(event) => set_search(event.target.value)} />
      <div className="list admin_section">
        {visible_users.map((user) => <div className="panel" key={user._id}>
          <div className="row wrap"><b>{user.username}</b><span className="muted">{user.email}</span><span className="tag">{user.isAdmin ? 'Admin' : user.isBanned ? 'Banned' : 'Active'}</span>{user.mustChangePassword && <span className="tag">Temporary password</span>}{user._id === player.id && <span className="tag cyan">You</span>}</div>
          {!user.isAdmin && <form className="row wrap admin_section" onSubmit={(event) => reset_password(event, user)}>
            <label htmlFor={`password_${user._id}`}>Temporary password</label>
            <input id={`password_${user._id}`} className="input" type="password" required minLength={8} maxLength={128} autoComplete="new-password"
              value={passwords[user._id] || ''} onChange={(event) => set_passwords((previous) => ({ ...previous, [user._id]: event.target.value }))} />
            <button className="btn small" disabled={busy}>Set Temporary Password</button>
          </form>}
          {/* Admins cannot change their own rights, which keeps at least one admin */}
          {user._id !== player.id && <div className="row wrap admin_section">
            <label className="row">
              <input type="checkbox" role="switch" checked={user.isAdmin} disabled={busy || (!user.isAdmin && user.isBanned)}
                onChange={() => toggle_admin(user)} />
              Admin rights{!user.isAdmin && user.isBanned && <span className="muted"> (unban first)</span>}
            </label>
            {!user.isAdmin && <button className="btn small danger" disabled={busy} onClick={() => toggle_ban(user)}>{user.isBanned ? 'Unban' : 'Ban'} User</button>}
          </div>}
        </div>)}
        {!loading && visible_users.length === 0 && <p className="muted">No users match your search.</p>}
      </div>
    </section>
  </div>;
}
