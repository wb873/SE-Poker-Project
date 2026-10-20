import React from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";

// Shared header: back button, title, and balance chip (story P7)
export default function PageHeader({ title, back_to = "/menu", show_balance = true }) {
  const navigate = useNavigate();
  const { balance } = use_session();

  return (
    <div className="page_header">
      <button className="btn" onClick={() => navigate(back_to)}>← Back</button>
      <h1>{title}</h1>
      {show_balance ? <div className="balance_chip">Balance: ${balance.toLocaleString()}</div> : <div style={{ width: 80 }} />}
    </div>
  );
}
