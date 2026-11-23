import React, { useEffect, useState } from "react";

export default function HandOdds({ hand, dealer_up_card }) {
  // Key only the six visible cards so chat, timers and other seats don't restart
  // the calculation. No full table state is passed to the worker.
  const visible = JSON.stringify({
    playerHand: hand.map(({ rank, suit }) => ({ rank, suit })),
    dealerUpCard: { rank: dealer_up_card.rank, suit: dealer_up_card.suit },
  });
  const [result, set_result] = useState(null);
  useEffect(() => {
    const worker = new Worker(new URL("../hand_odds.worker.mjs", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => set_result({ visible, odds: data });
    worker.onerror = () => set_result({ visible, odds: null });
    worker.postMessage(JSON.parse(visible));
    return () => worker.terminate();
  }, [visible]);

  const ready = result?.visible === visible;
  return (
    <div className="info_box" role="status" aria-live="polite">
      <div>Chance of beating dealer: <b>{!ready ? "Calculating..." : result.odds
        ? `${(result.odds.probability * 100).toFixed(1)}%` : "Unavailable"}</b></div>
      <div className="muted">Based on your hand and the dealer's face-up card. Ties excluded.</div>
    </div>
  );
}
