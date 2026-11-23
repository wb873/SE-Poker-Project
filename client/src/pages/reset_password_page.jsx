import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../api_config.js";

const MIN_PASSWORD_LENGTH = 8; // matches util/PasswordUtil.js

// Opened from the link in the password reset email (P4). The token in the link
// proves the player owns the email, so no login is needed here.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [message, set_message] = useState("");
  const [done, set_done] = useState("");
  const [busy, set_busy] = useState(false);

  async function handle_submit(event) {
    event.preventDefault();
    set_message("");
    if (password.length < MIN_PASSWORD_LENGTH) return set_message(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm_password) return set_message("Passwords do not match.");

    set_busy(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not reset the password.");
      set_done(data.message);
    } catch (error) {
      set_message(error.message || "Could not reach the server. Please try again.");
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="login_wrap">
      <div className="login_title">
        <h1>Welcome To Caribbean Stud Poker!</h1>
      </div>

      <form className="login_form" onSubmit={handle_submit}>
        <h2 style={{ textAlign: "center" }}>Reset Password</h2>
        {!token && <div className="error_text">This reset link is missing its code. Open the link from your email again, or ask for a new one.</div>}
        {done && <div className="panel" role="status">{done}</div>}

        {token && !done && (
          <>
            <input
              className="input"
              type="password"
              aria-label="New password"
              placeholder="New Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => set_password(e.target.value)}
            />
            <input
              className="input"
              type="password"
              aria-label="Confirm password"
              placeholder="Confirm Password"
              autoComplete="new-password"
              value={confirm_password}
              onChange={(e) => set_confirm_password(e.target.value)}
            />
            <div className="muted">Password must be at least {MIN_PASSWORD_LENGTH} characters.</div>
            {confirm_password && password !== confirm_password && <div className="error_text">Passwords do not match.</div>}
            {message && <div className="error_text">{message}</div>}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Please wait..." : "Save Password"}</button>
          </>
        )}

        <button type="button" className={"btn" + (done ? " primary" : "")} onClick={() => navigate("/", { replace: true })}>Back to Log In</button>
      </form>
    </div>
  );
}
