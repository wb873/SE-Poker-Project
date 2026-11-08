import React, { useEffect, useState } from "react";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";

const BROKE_BELOW = 10; // matches REFILL_BELOW in MoneyController.js
const AD_LENGTH_SECONDS = 15;

// Shown to a logged-in player who can't afford the ante (stories M1, M2)
export default function OutOfChips() {
  const { player, balance, token, set_balance } = use_session();
  const [ad_seconds, set_ad_seconds] = useState(0); // above 0 while the ad is playing
  const [error, set_error] = useState("");
  const [busy, set_busy] = useState(false);

  async function claim(path) {
    set_busy(true); set_error("");
    try {
      const response = await fetch(`${API_URL}/api/money/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add chips.");
      set_balance(data.balance);
    } catch (err) { set_error(err.message); }
    finally { set_busy(false); }
  }

  // Counts the ad down one second at a time, and claims the reward when it ends
  useEffect(() => {
    if (ad_seconds === 0) return;
    const timer = setTimeout(() => {
      if (ad_seconds === 1) claim("ad-reward");
      set_ad_seconds(ad_seconds - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [ad_seconds]);

  if (player.is_guest || balance >= BROKE_BELOW) return null;

  if (ad_seconds > 0) {
    return (
      <div className="panel">
        <h3>Advertisement</h3>
        <p className="muted">Your chips arrive in {ad_seconds} seconds. Leaving this page cancels the reward.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Out of chips?</h3>
      {error && <p className="muted">{error}</p>}
      <div className="row wrap">
        <button className="btn" disabled={busy} onClick={() => claim("refill")}>Get 500 chips</button>
        <button className="btn primary" disabled={busy} onClick={() => set_ad_seconds(AD_LENGTH_SECONDS)}>Watch an ad for 1,000</button>
      </div>
    </div>
  );
}