import React from "react";
import PlayingCard from "./playing_card.jsx";

const seat_positions = [
  { left: "10%", top: "28%" },
  { left: "17%", top: "58%" },
  { left: "32%", top: "82%" },
  { left: "50%", top: "90%" },
  { left: "68%", top: "82%" },
  { left: "83%", top: "58%" },
  { left: "90%", top: "28%" },
];
const MY_POSITION = 3; // bottom centre

const status_labels = { waiting: "Waiting", deciding: "Deciding...", raised: "Raised", folded: "Folded" };
const result_labels = {
  win: "Won",
  loss: "Lost",
  push: "Push (tie)",
  fold: "Folded",
  dealer_not_qualified: "Dealer didn't qualify",
};

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

  // You sit at the bottom; everyone else fills the remaining seats
  const all_positions = seat_positions.map((_, index) => index);
  const other_positions = me ? all_positions.filter((index) => index !== MY_POSITION) : all_positions;
  const placed = [
    ...(me ? [{ seat: me, index: MY_POSITION }] : []),
    ...others.map((seat, i) => ({ seat, index: other_positions[i] })),
  ].filter((entry) => entry.index !== undefined);

  const player_names = table ? table.seats.map((seat) => seat.username) : (lobby?.players ?? []);

  return (
    <div className="table_page">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={on_exit}>{exit_label}</button>
        {is_spectator && <span className="tag cyan">Spectating</span>}
      </div>

      {error && (
        <div className="panel" role="alert" style={{ marginBottom: 10 }}>
          {error}
          <button className="btn small" onClick={on_dismiss_error} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      {lobby && (
        <div className={"panel" + hl("lobby")} style={{ marginBottom: 10 }}>
          <b>{lobby.name}</b> <span className="muted">(Host: {lobby.host})</span>
          <div className="muted" style={{ fontSize: 13 }}>Lobby code: {lobby.id}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Players: {player_names.join(", ")} · Ante ${lobby.ante} · {lobby.turnTimer}s timer ·
            Side bets: {lobby.sideBets ? "Yes" : "No"} ·
            Bots: {lobby.bots?.enabled ? `${lobby.bots.amount} (${lobby.bots.difficulty})` : "No"}
          </div>
        </div>
      )}

      {/* Table and seats */}
      <div className={"table_wrap" + hl("seats")}>
        <div className="felt" />

        <div className="dealer_seat">
          <div className="seat" style={{ position: "static", transform: "none", margin: "0 auto" }}>
            <div className="circle">DEALER</div>
          </div>
        </div>

        <div className={"dealer_cards" + hl("dealer")}>
          {table?.dealerHand
            ? table.dealerHand.map((card, index) => <PlayingCard key={index} card={card} />)
            : table?.dealerUpCard && (
                <>
                  {[0, 1, 2, 3].map((index) => <PlayingCard key={index} face_down />)}
                  <PlayingCard card={table.dealerUpCard} />
                </>
              )}
        </div>

        {placed.map(({ seat, index }) => (
          <div key={seat.username} className={"seat" + (seat.isYou ? " you" : "")} style={seat_positions[index]}>
            <div className="circle">{(seat.isYou ? "YOU" : seat.username).slice(0, 6)}</div>
            <div className="status">
              {phase === "done" && seat.result ? result_labels[seat.result] : status_labels[seat.status]}
            </div>
            <div className="muted">${seat.balance.toLocaleString()}</div>
            {seat.inHand && <span className="ante_chip">ANTE ${table.ante}</span>}
            {seat.handRank && <div className="muted">{seat.handRank}</div>}
          </div>
        ))}
      </div>

      {/* Controls area */}
      <div className="table_controls">
        <div className={"panel chat_box" + hl("chat")}>
          <h3>Chat</h3>
          <div className="chat_log">
            {chat_log.map((entry, index) => (
              <div key={index}><b>{entry.user}:</b> {entry.text}</div>
            ))}
          </div>
          <form className="row" onSubmit={on_send_chat}>
            <input className="input" placeholder="Say something..." value={chat_input} onChange={(event) => on_chat_input_change(event.target.value)} />
            <button className="btn small" type="submit">Send</button>
          </form>
        </div>

        <div>
          <div className={"panel status_box" + hl("status")}>
            <div className="big">{status_text}</div>
            {can_deal && (
              <div>
                <button className="btn small primary" onClick={on_deal}>
                  {phase === "waiting" ? "Deal" : "Next Hand"}
                </button>
              </div>
            )}
          </div>

          <div className={"panel" + hl("balance")} style={{ marginTop: 10, textAlign: "center" }}>
            Balance: ${me ? me.balance.toLocaleString() : "—"}
            {table && (
              <div className="muted">
                Ante: ${table.ante} · Raise: ${table.raiseAmount}
                <br />
                Phase: {phase} · Swap: {me?.swapUsed ? "used" : `available ($${table.swapCost})`}
              </div>
            )}
          </div>

          <div className={"hand_row" + hl("hand")}>
            {me?.hand?.map((card, index) => (
              <div
                key={index}
                role={swap_active ? "button" : undefined}
                tabIndex={swap_active ? 0 : undefined}
                aria-label={swap_active ? `Swap ${card.rank}${card.suit}` : undefined}
                style={swap_active ? { cursor: "pointer", outline: "2px dashed gold", borderRadius: 8 } : undefined}
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

          {me && (me.handRank || table.dealerHandRank) && (
            <div className={"panel" + hl("result")} style={{ textAlign: "center" }}>
              {me.handRank && <p>Your hand: {me.handRank}</p>}
              {table.dealerHandRank && <p>Dealer hand: {table.dealerHandRank}</p>}
              {phase === "done" && me.result && <p>Result: {result_labels[me.result]}</p>}
            </div>
          )}

          {!is_spectator && me && (
            <div className={"action_row" + hl("actions")}>
              <button className="action_btn" disabled={!can_act} onClick={on_fold}>
                Fold
              </button>
              <button
                className="action_btn"
                disabled={!can_act || !table.canSwap}
                onClick={on_toggle_swap}
                title={me.swapUsed ? "You already swapped this hand" : `Replace one card for $${table.swapCost}`}
              >
                {swap_active ? "Cancel swap" : "Swap Card"}
                <br />
                {me.swapUsed ? "used" : `$${table.swapCost}`}
              </button>
              <button
                className="action_btn main"
                disabled={!can_act || me.balance < table.raiseAmount}
                onClick={on_raise}
              >
                Raise
                <br />${table.raiseAmount}
              </button>
            </div>
          )}
        </div>

        <div>
          <div className={"round_badge" + (seconds_left <= 5 && phase === "decision" ? " low" : "") + hl("timer")}>
            <div>
              <div className="num">{phase === "decision" ? seconds_left : "—"}</div>
              <div className="muted">{timer_label}</div>
            </div>
          </div>
          <div className={"round_badge" + hl("rank")}>
            <div>
              <div className="muted">Hand Rank</div>
              <b>{me?.handRank || "Not revealed"}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
