import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";
import { API_URL } from "../api_config.js";

// Login screen: login, create account, forgot password, guest play (P1, P2, P4, P5)
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, play_as_guest, admin_login } = use_session();
  const [mode, set_mode] = useState("login"); // login | register | reset | admin
  const [identifier, set_identifier] = useState("");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [message, set_message] = useState("");
  const [username, set_username] = useState('');
  const [busy, set_busy] = useState(false);

  async function handle_submit(event) {
    event.preventDefault();
    set_message("");

    if (!identifier.trim()) {
      set_message("Please enter your username or email.");
      return;
    }
    if (mode === "reset") {
      set_message("If an account exists, a reset link has been sent (mock).");
      return;
    }
    if (!password) {
      set_message("Please enter your password.");
      return;
    }
    if (mode === "register" && password !== confirm_password) {
      set_message("Passwords do not match.");
      return;
    }
    set_busy(true);
    try {
      if (mode === 'register') {
        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), email: identifier.trim(), password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not create the account.');
      }
      const user = await (mode === 'admin' ? admin_login : login)(identifier.trim(), password);
      navigate(user.isAdmin ? '/admin' : '/menu');
    } catch (error) {
      set_message(error.message);
    } finally {
      set_busy(false);
    }
  }

  function handle_guest() {
    play_as_guest();
    navigate("/menu");
  }

  function handle_admin() {
    set_mode("admin");
    set_identifier("");
    set_password("");
    set_message("");
  }

  const title = { login: "Log In", register: "Create Account", reset: "Reset Password", admin: "Admin Log In" }[mode];

  return (
    <div className="login_wrap">
      <div className="login_title">
        <h1>Welcome To Caribbean Stud Poker!</h1>
      </div>

      <form className="login_form" onSubmit={handle_submit}>
        <h2 style={{ textAlign: "center" }}>{title}</h2>
        {mode === "admin" && <p className="muted">Sign in using your administrator account.</p>}
        {mode === 'register' && <input className="input" aria-label="Username" placeholder="Username" required value={username} onChange={(event) => set_username(event.target.value)} />}
        <input
          className="input"
          aria-label={mode === "admin" ? "Admin username" : "Username or email"}
          placeholder={mode === "register" || mode === "reset" ? "Email" : "Username / E-Mail"}
          value={identifier}
          onChange={(e) => set_identifier(e.target.value)}
        />
        {mode !== "reset" && (
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => set_password(e.target.value)} />
        )}
        {mode === "register" && (
          <input className="input" type="password" placeholder="Confirm Password" value={confirm_password} onChange={(e) => set_confirm_password(e.target.value)} />
        )}
        {message && <div className="error_text">{message}</div>}

        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : mode === "reset" ? "Send Reset Link" : title}</button>
          <span className="spacer" />
          {mode === "login" && <button type="button" className="btn" onClick={() => set_mode("reset")}>Forgot Password</button>}
        </div>

        {mode === "login" && (
          <button type="button" className="btn" onClick={() => set_mode("register")}>Don't Have an Account? Create Here</button>
        )}
        {mode !== "login" && (
          <button type="button" className="btn" onClick={() => { set_mode("login"); set_message(""); }}>Back to Log In</button>
        )}
      </form>

      <hr className="divider" />
      <button className="btn" style={{ width: "100%", padding: 20, fontSize: 18 }} onClick={handle_guest}>Play as Guest</button>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button className="btn small" onClick={handle_admin}>Admin Sign In</button>
      </div>
    </div>
  );
}
