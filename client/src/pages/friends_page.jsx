import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/page_header.jsx";
import { mock_friends } from "../mock_data.js";

// Friends list: view, add, remove, join a friend's game (stories F1, F2, F3)
export default function FriendsPage() {
  const navigate = useNavigate();
  const [friends, set_friends] = useState(mock_friends);
  const [search, set_search] = useState("");
  const [request_count] = useState(2); // mock pending requests

  function remove_friend(friend_id) {
    set_friends(friends.filter((f) => f.id !== friend_id));
  }

  function add_friend(event) {
    event.preventDefault();
    if (!search.trim()) return;
    // TODO: POST /api/friends/request
    alert(`Friend request sent to ${search.trim()} (mock)`);
    set_search("");
  }

  const online_group = friends.filter((f) => f.status !== "offline");
  const offline_group = friends.filter((f) => f.status === "offline");

  function render_friend(friend) {
    const label = friend.status === "offline" ? "OFFLINE" : friend.status === "in_game" ? `In Game (${friend.detail})` : `Online (${friend.detail})`;
    return (
      <div key={friend.id} className="list_item">
        <div className={"avatar_circle " + friend.status}>{friend.username[0].toUpperCase()}</div>
        <div><b>{friend.username}</b> <span className="muted">– {label}</span></div>
        <span className="spacer" />
        {friend.status === "in_game" && <button className="btn small primary" onClick={() => navigate("/table/l1")}>Join</button>}
        <button className="btn small" onClick={() => alert("Messaging coming soon")}>Msg</button>
        <button className="btn small danger" onClick={() => remove_friend(friend.id)}>X</button>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Friends List" />

      <form className="row" style={{ marginBottom: 16 }} onSubmit={add_friend}>
        <input className="input" placeholder="Search by username to add..." value={search} onChange={(e) => set_search(e.target.value)} />
        <button className="btn primary" type="submit">Add</button>
        <button type="button" className="btn">Requests ({request_count})</button>
      </form>

      <div className="list">
        {online_group.map(render_friend)}
        <div className="muted" style={{ textAlign: "center", margin: "10px 0" }}>— OFFLINE —</div>
        {offline_group.map(render_friend)}
        {friends.length === 0 && <p className="muted">No friends yet. Search above to add some.</p>}
      </div>
    </div>
  );
}
