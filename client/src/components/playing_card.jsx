import React from "react";

// A single playing card; pass face_down for hidden cards, big or small to resize,
// and highlight to outline a card that's part of a winning hand
export default function PlayingCard({ card, face_down = false, big = false, small = false, highlight = false }) {
  const size_class = big ? " big" : small ? " small" : "";
  if (face_down || !card) return <div className={"card back" + size_class} />;

  const is_red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={"card" + (is_red ? " red" : "") + size_class + (highlight ? " highlight" : "")}>
      <span>{card.rank}</span>
      <span>{card.suit}</span>
    </div>
  );
}
