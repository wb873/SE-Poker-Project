import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";

// Login screen: login, create account, forgot password, guest play (P1, P2, P4, P5)
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, play_as_guest, admin_login } = use_session();
  const [mode, set_mode] = useState("login"); // login | register | reset | admin
  const [identifier, set_identifier] = useState("");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [message, set_message] = useState("");

  function handle_submit(event) {
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
    if (mode === "admin") {
      if (!admin_login(identifier.trim(), password)) {
        set_message("Incorrect demo admin username or password.");
        return;
      }
      navigate("/admin");
      return;
    }
    // TODO: replace with POST /api/auth/login or /api/auth/register
    login(identifier.trim());
    navigate("/menu");
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
        {mode === "admin" && <p className="muted">Demo access: username <b>admin</b>, password <b>admin123</b>. Account authentication is not connected yet.</p>}
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
          <button className="btn primary" type="submit">{mode === "reset" ? "Send Reset Link" : title}</button>
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
