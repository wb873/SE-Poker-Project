import React, { useEffect, useState } from 'react';
import PageHeader from '../components/page_header.jsx';
import { use_session } from '../session.jsx';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ContactPage() {
  const { token } = use_session();
  const [messages, set_messages] = useState([]);
  const [subject, set_subject] = useState('');
  const [message, set_message] = useState('');
  const [notice, set_notice] = useState('');
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  const [refresh, set_refresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load_messages() {
      try {
        const response = await fetch(`${API_URL}/api/contacts/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load messages.');
        if (active) set_messages(data);
      } catch (err) { if (active) set_error(err.message); }
    }
    load_messages();
    return () => { active = false; };
  }, [token, refresh]);

  async function send(event) {
    event.preventDefault();
    set_busy(true); set_error(''); set_notice('');
    try {
      const response = await fetch(`${API_URL}/api/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ txt_subject: subject.trim(), txt_message: message.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send message.');
      set_subject(''); set_message('');
      set_notice('Message sent. Responses will appear below.');
      set_refresh((value) => value + 1);
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }
  return <div className="page">
    <PageHeader title="Contact Admin" />
    <p className="muted">Send a message about your account or the game. Check this page for the administrator’s response.</p>
    {error && <p role="alert" className="error_text">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form className="form_grid panel" onSubmit={send}>
      <label>Subject<input className="input" maxLength={150} value={subject} onChange={(event) => set_subject(event.target.value)} /></label>
      <label>Message<textarea className="input" rows={6} required maxLength={5000} value={message} onChange={(event) => set_message(event.target.value)} /></label>
      <button className="btn primary" disabled={busy || !message.trim()}>{busy ? 'Sending...' : 'Send Message'}</button>
    </form>
    <div className="row admin_section"><h2>Your Messages</h2><button className="btn small" onClick={() => { set_error(''); set_refresh((value) => value + 1); }}>Refresh</button></div>
    <div className="list">
      {messages.length === 0 && <p className="muted">No messages yet.</p>}
      {messages.map((item) => <article className="panel" key={item._id}>
        <h3>{item.subject || 'No subject'}</h3>
        <p className="muted">{new Date(item.creation).toLocaleString()} · {item.status === 1 ? 'Responded' : 'Awaiting response'}</p>
        <p className="admin_text">{item.message}</p>
        {item.reply && <div className="panel"><b>Admin response</b><p className="admin_text">{item.reply}</p></div>}
      </article>)}
    </div>
  </div>;
}
