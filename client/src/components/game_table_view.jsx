import React from "react";
import PlayingCard from "./playing_card.jsx";

// Seats around the stadium-shaped table, as % of the table area.
// Index 0 is the bottom centre, where you always sit; the rest go clockwise.
const seat_positions = [
  { left: "50%", top: "94%" },
  { left: "20%", top: "86%" },
  { left: "4%", top: "50%" },
  { left: "20%", top: "10%" },
  { left: "80%", top: "10%" },
  { left: "96%", top: "50%" },
  { left: "80%", top: "86%" },
];
const MY_POSITION = 0;
// Other players fill the seats nearest the bottom first so a small table looks balanced
const other_seat_order = [1, 6, 2, 5, 3, 4];

const status_labels = { waiting: "Waiting", deciding: "Deciding...", raised: "Raised", folded: "Folded" };
const result_labels = {
  win: "Won",
  loss: "Lost",
  push: "Push (tie)",
  fold: "Folded",
  dealer_not_qualified: "Dealer didn't qualify",
};
const HAND_SIZE = 5;

function Avatar() {
  return (
    <svg className="seat_avatar_icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="4.5" />
      <path d="M3.5 22c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z" />
    </svg>
  );
}

// Draws the poker table from a table state (the server's table:state shape).
// The live table and the tutorial both render this, so they always look the same.
// locked disables Deal and the actions; highlight outlines one area for the tutorial.
export default function GameTableView({
  table,
  lobby,
  is_spectator = false,
  error = "",
  on_dismiss_error,
  status_text,
  seconds_left,
  timer_label = "Play Timer",
  chat_log,
  chat_input,
  on_chat_input_change,
  on_send_chat,
  swap_mode,
  on_toggle_swap,
  on_swap_card,
  on_fold,
  on_raise,
  on_deal,
  on_exit,
  exit_label = "Exit Table",
  locked = false,
  highlight = null,
}) {
  const hl = (area) => (highlight === area ? " tutorial_highlight" : "");

  const phase = table?.phase ?? "waiting";
  const me = table?.seats.find((seat) => seat.isYou) ?? null;
  const others = (table?.seats ?? []).filter((seat) => !seat.isYou);
  const can_act = !locked && !is_spectator && phase === "decision" && me?.status === "deciding";
  const can_deal = !locked && !is_spectator && Boolean(me) && phase !== "decision";
  const swap_active = swap_mode && can_act && Boolean(table?.canSwap);
  const timer_low = seconds_left <= 5 && phase === "decision";

  // You sit at the bottom; everyone else fills the remaining seats
  const other_positions = me ? other_seat_order : [MY_POSITION, ...other_seat_order];
  const placed = [
    ...(me ? [{ seat: me, index: MY_POSITION }] : []),
    ...others.map((seat, i) => ({ seat, index: other_positions[i] })),
  ].filter((entry) => entry.index !== undefined);

  const player_names = table ? table.seats.map((seat) => seat.username) : (lobby?.players ?? []);
  const antes_in = (table?.seats ?? []).filter((seat) => seat.inHand).length * (table?.ante ?? 0);

  const seat_label = (seat) =>
    phase === "done" && seat.result ? result_labels[seat.result] : status_labels[seat.status];

  return (
    <div className="table_page">
      <div className="table_topbar">
        <button className="btn small" onClick={on_exit}>{exit_label}</button>
        <div className="table_title">
          <span className="muted">Caribbean Stud</span>
          {lobby && <b>{lobby.name}</b>}
        </div>
        <div className="table_topbar_right">
          {is_spectator && <span className="tag cyan">Spectating</span>}
          <div className={"table_timer" + (timer_low ? " low" : "") + hl("timer")}>
            <span className="num">{phase === "decision" ? seconds_left : "—"}</span>
            <span className="muted">{timer_label}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="panel" role="alert" style={{ marginBottom: 10 }}>
          {error}
          <button className="btn small" onClick={on_dismiss_error} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      {lobby && (
        <div className={"table_lobby_info muted" + hl("lobby")}>
          Code <b>{lobby.id}</b> · Host {lobby.host} · Players: {player_names.join(", ")} · Ante ${lobby.ante} ·{" "}
          {lobby.turnTimer}s timer · Side bets: {lobby.sideBets ? "Yes" : "No"} · Bots:{" "}
          {lobby.bots?.enabled ? `${lobby.bots.amount} (${lobby.bots.difficulty})` : "No"}
        </div>
      )}

      {/* Table and seats */}
      <div className={"table_wrap" + hl("seats")}>
        <div className="table_rail">
          <div className="felt">
            <div className="felt_line" />
            <div className="felt_watermark">
              CARIBBEAN <span>Stud</span>
            </div>
          </div>
        </div>

        <div className="dealer_seat">
          <div className="seat_avatar dealer"><Avatar /></div>
          <div className="nameplate"><b>Dealer</b></div>
        </div>

        <div className={"table_center" + hl("dealer")}>
          {table && phase !== "waiting" && <div className="pot_label">Antes in: ${antes_in.toLocaleString()}</div>}
          <div className="dealer_cards">
            {table?.dealerHand
              ? table.dealerHand.map((card, index) => <PlayingCard key={index} card={card} />)
              : table?.dealerUpCard
                ? (
                    <>
                      {[0, 1, 2, 3].map((index) => <PlayingCard key={index} face_down />)}
                      <PlayingCard card={table.dealerUpCard} />
                    </>
                  )
                : [0, 1, 2, 3, 4].map((index) => <div key={index} className="card_slot" />)}
          </div>
          {table?.dealerHandRank && <div className="pot_label">Dealer: {table.dealerHandRank}</div>}
        </div>

        {/* Your hand sits on the felt in front of your seat */}
        {me?.hand && (
          <div className={"my_hand" + hl("hand")}>
            {me.hand.map((card, index) => (
              <div
                key={index}
                className={swap_active ? "swappable" : undefined}
                role={swap_active ? "button" : undefined}
                tabIndex={swap_active ? 0 : undefined}
                aria-label={swap_active ? `Swap ${card.rank}${card.suit}` : undefined}
                onClick={swap_active ? () => on_swap_card(index) : undefined}
                onKeyDown={
                  swap_active
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          on_swap_card(index);
                        }
                      }
                    : undefined
                }
              >
                <PlayingCard card={card} big />
              </div>
            ))}
          </div>
        )}

        {placed.map(({ seat, index }) => {
          const show_cards = !seat.isYou && seat.inHand && seat.status !== "folded";
          return (
            <div
              key={seat.username}
              className={
                "seat" +
                (seat.isYou ? " you" : "") +
                (seat.status === "deciding" && phase === "decision" ? " active" : "") +
                (seat.status === "folded" ? " folded" : "")
              }
              style={seat_positions[index]}
            >
              {show_cards && (
                <div className="seat_cards">
                  {seat.hand
                    ? seat.hand.map((card, i) => <PlayingCard key={i} card={card} small />)
                    : Array.from({ length: HAND_SIZE }, (_, i) => <PlayingCard key={i} face_down small />)}
                </div>
              )}
              <div className="seat_avatar"><Avatar /></div>
              <div className="nameplate">
                <b>{seat.isYou ? `${seat.username} (You)` : seat.username}</b>
                <span className="chips">${seat.balance.toLocaleString()}</span>
                <span className="seat_status">{seat_label(seat)}</span>
              </div>
              {seat.inHand && <span className="ante_chip">${table.ante}</span>}
              {!seat.isYou && seat.handRank && <div className="seat_rank">{seat.handRank}</div>}
            </div>
          );
        })}
      </div>

      {/* Bottom bar: actions, info, chat */}
      <div className="table_controls">
        <div className="controls_left">
          <div className={"status_box" + hl("status")}>
            <div className="big">{status_text}</div>
            {can_deal && (
              <button className="btn primary" onClick={on_deal}>
                {phase === "waiting" ? "Deal" : "Next Hand"}
              </button>
            )}
          </div>

          {!is_spectator && me && (
            <div className={"action_row" + hl("actions")}>
              <button className="action_btn fold" disabled={!can_act} onClick={on_fold}>
                Fold
              </button>
              <button
                className="action_btn swap"
                disabled={!can_act || !table.canSwap}
                onClick={on_toggle_swap}
                title={me.swapUsed ? "You already swapped this hand" : `Replace one card for $${table.swapCost}`}
              >
                {swap_active ? "Cancel swap" : "Swap Card"}
                <small>{me.swapUsed ? "used" : `$${table.swapCost}`}</small>
              </button>
              <button
                className="action_btn raise"
                disabled={!can_act || me.balance < table.raiseAmount}
                onClick={on_raise}
              >
                Raise
                <small>${table.raiseAmount}</small>
              </button>
            </div>
          )}
        </div>

        <div className="controls_mid">
          <div className={"info_box" + hl("balance")}>
            <div className="info_balance">Balance: <b>${me ? me.balance.toLocaleString() : "—"}</b></div>
            {table && (
              <div className="muted">
                Ante ${table.ante} · Raise ${table.raiseAmount} · Swap{" "}
                {me?.swapUsed ? "used" : `$${table.swapCost}`}
              </div>
            )}
          </div>
          <div className={"info_box" + hl("rank")}>
            <span className="muted">Hand rank </span>
            <b>{me?.handRank || "Not revealed"}</b>
          </div>
          {me && (me.handRank || table.dealerHandRank) && (
            <div className={"info_box" + hl("result")}>
              {me.handRank && <div>Your hand: {me.handRank}</div>}
              {table.dealerHandRank && <div>Dealer hand: {table.dealerHandRank}</div>}
              {phase === "done" && me.result && <div><b>Result: {result_labels[me.result]}</b></div>}
            </div>
          )}
        </div>

        <div className={"chat_box" + hl("chat")}>
          <div className="chat_title">Chat</div>
          <div className="chat_log">
            {chat_log.map((entry, index) => (
              <div key={index}><b>{entry.user}:</b> {entry.text}</div>
            ))}
          </div>
          <form className="chat_form" onSubmit={on_send_chat}>
            <input className="input" placeholder="Say something..." value={chat_input} onChange={(event) => on_chat_input_change(event.target.value)} />
            <button className="btn small" type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
