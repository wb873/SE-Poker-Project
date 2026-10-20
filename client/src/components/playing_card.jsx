import React from "react";

// A single playing card; pass face_down for hidden cards
export default function PlayingCard({ card, face_down = false, big = false }) {
  const size_class = big ? " big" : "";
  if (face_down || !card) return <div className={"card back" + size_class} />;

  const is_red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={"card" + (is_red ? " red" : "") + size_class}>
      <span>{card.rank}</span>
      <span>{card.suit}</span>
    </div>
  );
}
