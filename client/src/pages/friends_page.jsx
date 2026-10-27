import React, { useEffect, useState } from "react";
import PageHeader from "../components/page_header.jsx";
import { use_session } from "../session.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Friends list: add, accept/decline requests, remove (stories F1, F2, F3)
export default function FriendsPage() {
  const { token } = use_session();
  const [friends, set_friends] = useState([]);
  const [incoming, set_incoming] = useState([]);
  const [outgoing, set_outgoing] = useState([]);
  const [search, set_search] = useState("");
  const [show_requests, set_show_requests] = useState(false);
  const [message, set_message] = useState("");
  const [error, set_error] = useState("");
  const [chat_with, set_chat_with] = useState(null); // friend whose chat is open
  const [chat_messages, set_chat_messages] = useState([]);
  const [chat_text, set_chat_text] = useState("");

   // Calls the friends API as the logged-in player; throws the server's error message
  async function friends_api(path, options = {}) {
    const response = await fetch(`${API_URL}/api/friends${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function load_friends() {
    try {
      const data = await friends_api("");
      set_friends(data.friends);
      set_incoming(data.incoming);
      set_outgoing(data.outgoing);
    } catch (err) {
      set_error(err.message);
    }
  }

    // Runs one action (send/accept/decline/remove), shows the result, then reloads the lists
  async function run_action(path, method, body) {
    set_message("");
    set_error("");
      try {
        const data = await friends_api(path, { method, body: body && JSON.stringify(body) });
        set_message(data.message);
        await load_friends();
      } catch (err) {
        set_error(err.message);
      }
  }

  useEffect(() => {
    load_friends();
  }, [token]);

  function add_friend(event) {
    event.preventDefault();
    if (!search.trim()) return;
    run_action("/requests", "POST", { username: search.trim() });
    set_search("");
  }

   // Calls the messages API for one friend (F4); throws the server's error message
  async function messages_api(name, options = {}) {
    const response = await fetch(`${API_URL}/api/messages/${encodeURIComponent(name)}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function load_messages(name) {
    try {
      const data = await messages_api(name);
      set_chat_messages(data.messages);
    } catch (err) {
      set_error(err.message);
      set_chat_with(null); // e.g. no longer friends
    }
  }

  async function send_message(event) {
    event.preventDefault();
    if (!chat_text.trim()) return;
    try {
      await messages_api(chat_with, { method: "POST", body: JSON.stringify({ text: chat_text }) });
      set_chat_text("");
      load_messages(chat_with);
    } catch (err) {
      set_error(err.message);
    }
  }

  // While a chat is open, check for new messages every 3 seconds
  useEffect(() => {
    if (!chat_with) return;
    set_chat_messages([]);
    load_messages(chat_with);
    const timer = setInterval(() => load_messages(chat_with), 3000);
    return () => clearInterval(timer);
  }, [chat_with, token]);
  return ( 
    <div className="page">
      <PageHeader title="Friends List" />

      <form className="row" style={{ marginBottom: 16 }} onSubmit={add_friend}>
        <input className="input" placeholder="Add a friend by username..." value={search} onChange={(e) => set_search(e.target.value)} />
        <button className="btn primary" type="submit">Add</button>
        <button type="button" className="btn" onClick={() => set_show_requests(!show_requests)}>
          Requests ({incoming.length})
        </button>
      </form>

      {message && <p className="muted">{message}</p>}
      {error && <p role="alert" className="error_text">{error}</p>}

      {show_requests && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>Requests</h3>
          {incoming.map((name) => (
            <div key={name} className="list_item">
              <b>{name}</b> <span className="muted">wants to be friends</span>
              <span className="spacer" />
              <button className="btn small primary" onClick={() => run_action(`/requests/${encodeURIComponent(name)}/accept`,
"POST")}>Accept</button>
              <button className="btn small" onClick={() => run_action(`/requests/${encodeURIComponent(name)}`, "DELETE")}>Decline</button>
            </div>
          ))}
          {outgoing.map((name) => (
            <div key={name} className="list_item">
              <b>{name}</b> <span className="muted">request sent</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => run_action(`/requests/${encodeURIComponent(name)}`, "DELETE")}>Cancel</button>
            </div>
          ))}
          {incoming.length === 0 && outgoing.length === 0 && <p className="muted">No pending requests.</p>}
        </div>
      )}

      <div className="list">
        {friends.map((name) => (
          <div key={name} className="list_item">
            <div className="avatar_circle">{name[0].toUpperCase()}</div>
            <b>{name}</b>
            <span className="spacer" />
            <button className="btn small" onClick={() => set_chat_with(name)}>Msg</button>
            <button className="btn small danger" onClick={() => run_action(`/${encodeURIComponent(name)}`, "DELETE")}>X</button>
          </div>
        ))}
        {friends.length === 0 && <p className="muted">No friends yet. Add someone by username above.</p>}
      </div>
       {chat_with && (
        <div className="panel chat_box" style={{ marginTop: 16 }}>
          <div className="row">
            <h3>Chat with {chat_with}</h3>
            <span className="spacer" />
            <button className="btn small" onClick={() => set_chat_with(null)}>Close</button>
          </div>
          <div className="chat_log">
            {chat_messages.map((m, index) => (
              <div key={index}><b>{m.from}:</b> {m.text}</div>
            ))}
            {chat_messages.length === 0 && <p className="muted">No messages yet. Say hi!</p>}
          </div>
          <form className="row" onSubmit={send_message}>
            <input className="input" maxLength={500} placeholder={`Message ${chat_with}...`} value={chat_text} onChange={(e) => set_chat_text(e.target.value)} />
            <button className="btn primary" type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
