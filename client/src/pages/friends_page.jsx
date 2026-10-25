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
            <button className="btn small" onClick={() => alert("Messaging coming soon")}>Msg</button>
            <button className="btn small danger" onClick={() => run_action(`/${encodeURIComponent(name)}`, "DELETE")}>X</button>
          </div>
        ))}
        {friends.length === 0 && <p className="muted">No friends yet. Add someone by username above.</p>}
      </div>
    </div>
  );
}
