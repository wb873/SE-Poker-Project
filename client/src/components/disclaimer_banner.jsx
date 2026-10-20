import React from "react";

// Story D1: gambling disclaimer shown at the bottom of every screen
export default function DisclaimerBanner() {
  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="disclaimer_banner">
        This game uses virtual credits only and has no real-money value. Gambling can be addictive.
        If you or someone you know has a gambling problem, call 1-800-GAMBLER.
      </div>
    </div>
  );
}
