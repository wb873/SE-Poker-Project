import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";

// Demo data until authenticated contact and user routes are available.
const demo_contacts = [
  { id: "c1", name: "Alex", email: "alex@example.com", subject: "Lost connection", message: "My game disconnected during a hand. Can you help?", status: "New", reply: "" },
  { id: "c2", name: "Sam", email: "sam@example.com", subject: "Account help", message: "How can I change the email on my account?", status: "New", reply: "" },
];
const demo_users = [
  { id: "u1", username: "Alex", email: "alex@example.com", banned: false },
  { id: "u2", username: "Sam", email: "sam@example.com", banned: false },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { player, logout } = use_session();
  const [contacts, set_contacts] = useState(demo_contacts);
  const [users, set_users] = useState(demo_users);
  const [selected_id, set_selected_id] = useState(demo_contacts[0].id);
  const [drafts, set_drafts] = useState({});
  const [search, set_search] = useState("");
  const [notice, set_notice] = useState("");
  const selected = contacts.find((contact) => contact.id === selected_id);
  const visible_users = users.filter((user) =>
    `${user.username} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  function respond(event) {
    event.preventDefault();
    const reply = (drafts[selected_id] || "").trim();
    if (!reply) return;
    // TODO: save the response through an authenticated contact API.
    set_contacts((previous) => previous.map((contact) =>
      contact.id === selected_id ? { ...contact, reply, status: "Responded" } : contact
    ));
    set_drafts((previous) => ({ ...previous, [selected_id]: "" }));
    set_notice("Demo reply saved for this visit. No message was sent to the user.");
  }

  function reset_password(user) {
    // TODO: request a password-reset link through the admin user API.
    set_notice(`Demo: password reset requested for ${user.username}. No password was changed and no email was sent.`);
  }

  function toggle_ban(user) {
    // TODO: persist the ban through the admin user API.
    set_users((previous) => previous.map((item) =>
      item.id === user.id ? { ...item, banned: !item.banned } : item
    ));
    set_notice(`Demo: ${user.username} is now ${user.banned ? "active" : "banned"} in this preview only.`);
  }

  return (
    <div className="page">
      <div className="page_header">
        <h1>Admin Dashboard</h1>
        <span className="tag cyan">{player.username}</span>
        <button className="btn" onClick={() => { logout(); navigate("/"); }}>Log Out</button>
      </div>
      <p className="panel muted">Demo admin tools. Messages and users below are samples. Changes last only for this visit; real accounts and messages are not affected.</p>
      {notice && <div className="panel" role="status">{notice}</div>}

      <section className="panel admin_section" aria-labelledby="contact_title">
        <h2 id="contact_title">Contact Messages</h2>
        <div className="admin_columns">
          <div className="list" aria-label="Contact messages">
            {contacts.map((contact) => (
              <button key={contact.id} className={"btn admin_message" + (contact.id === selected_id ? " primary" : "")}
                aria-pressed={contact.id === selected_id}
                onClick={() => { set_selected_id(contact.id); set_notice(""); }}>
                <b>{contact.subject}</b><br />{contact.name} · {contact.status}
              </button>
            ))}
          </div>
          {selected && <div>
            <h3>{selected.subject}</h3>
            <p className="muted">From {selected.name} ({selected.email})</p>
            <p className="admin_text">{selected.message}</p>
            {selected.reply && <div className="panel"><b>Saved demo response</b><p className="admin_text">{selected.reply}</p></div>}
            <form className="form_grid" onSubmit={respond}>
              <label htmlFor="admin_reply">Response</label>
              <textarea id="admin_reply" className="input" rows={5} required maxLength={2000}
                placeholder="Write a response to this user..." value={drafts[selected_id] || ""}
                onChange={(event) => set_drafts((previous) => ({ ...previous, [selected_id]: event.target.value }))} />
              <button className="btn primary" type="submit" disabled={!(drafts[selected_id] || "").trim()}>Save Demo Response</button>
            </form>
          </div>}
        </div>
      </section>

      <section className="panel admin_section" aria-labelledby="users_title">
        <h2 id="users_title">User Management</h2>
        <label htmlFor="admin_search">Find a user</label>
        <input id="admin_search" className="input" placeholder="Search sample users by username or email..."
          value={search} onChange={(event) => set_search(event.target.value)} />
        <div className="list admin_section">
          {visible_users.map((user) => (
            <div key={user.id} className="list_item admin_user">
              <div><b>{user.username}</b><div className="muted">{user.email}</div></div>
              <span className="tag">{user.banned ? "Banned" : "Active"}</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => reset_password(user)}>Reset Password (Demo)</button>
              <button className="btn small danger" onClick={() => toggle_ban(user)}>{user.banned ? "Unban" : "Ban"} User (Demo)</button>
            </div>
          ))}
          {visible_users.length === 0 && <p className="muted">No sample users match your search.</p>}
        </div>
      </section>
    </div>
  );
}
