import React, { useEffect, useState } from "react";
import { API_URL } from "../api_config.js";

const fallback_ad = { title: "Your Ad Here", body: "Placeholder for a future advertisement." };

// R1: placeholder ad slot. It gives no credits; real ads come later.
export default function AdBanner() {
  const [ad, set_ad] = useState(fallback_ad);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/ads`)
      .then((response) => response.json())
      .then((data) => { if (active && data.ad) set_ad(data.ad); })
      .catch(() => {}); // keep the static placeholder
    return () => { active = false; };
  }, []);

  return (
    <aside className="panel ad_banner" aria-label="Advertisement">
      <span className="ad_label">Advertisement</span>
      <div><b>{ad.title}</b></div>
      <div className="muted">{ad.body}</div>
    </aside>
  );
}