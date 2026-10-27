import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { use_session } from "../session.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const MIN_PASSWORD_LENGTH = 8; // matches util/PasswordUtil.js

async function post_json(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { field: data.field });
  return data;
}

// Login screen: login, create account, forgot password, guest play (P1, P2, P4, P5)
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, change_password, play_as_guest, admin_login } = use_session();
  const [mode, set_mode] = useState("login"); // login | register | forgot | change_password | admin
  const [identifier, set_identifier] = useState("");
  const [username, set_username] = useState("");
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [temporary_password, set_temporary_password] = useState(""); // kept to confirm the change
  const [message, set_message] = useState("");
  const [info, set_info] = useState("");
  const [taken, set_taken] = useState({ username: "", email: "" });
  const [busy, set_busy] = useState(false);

  function switch_mode(next, notice = "") {
    set_mode(next);
    set_password("");
    set_confirm_password("");
    set_message("");
    set_info(notice);
    set_taken({ username: "", email: "" });
  }

  // Warns as soon as a username or email field loses focus if it is already in use
  async function check_available(field, value) {
    if (mode !== "register" || !value.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/auth/availability?${field}=${encodeURIComponent(value.trim())}`);
      const data = await response.json();
      const available = field === "username" ? data.usernameAvailable : data.emailAvailable;
      set_taken((previous) => ({ ...previous, [field]: available === false ? `That ${field} is already in use.` : "" }));
    } catch {
      // The server checks again on submit
    }
  }

  // Returns an error message, or "" when the two password fields are acceptable
  function password_error() {
    if (!password) return "Please enter a password.";
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirm_password) return "Passwords do not match.";
    return "";
  }

  async function submit_login() {
    if (!identifier.trim()) return set_message("Please enter your username or email.");
    if (!password) return set_message("Please enter your password.");
    try {
      const user = await login(identifier.trim(), password);
      if (user.mustChangePassword) {
        set_temporary_password(password);
        return switch_mode("change_password", "You logged in with a temporary password from an admin. You can choose your own password now.");
      }
      navigate("/menu");
    } catch (error) {
      if (error.code !== "ACCOUNT_NOT_FOUND") throw error;
      const value = identifier.trim();
      if (value.includes("@")) set_email(value);
      else set_username(value);
      switch_mode("register", error.message);
    }
  }

  async function submit_register() {
    if (!username.trim()) return set_message("Please enter a username.");
    if (!email.trim()) return set_message("Please enter your email.");
    if (taken.username || taken.email) return set_message(taken.username || taken.email);
    const error = password_error();
    if (error) return set_message(error);

    try {
      await post_json("/api/auth/register", { username: username.trim(), email: email.trim(), password });
    } catch (err) {
      if (err.field) set_taken((previous) => ({ ...previous, [err.field]: err.message }));
      throw err;
    }
    await login(username.trim(), password);
    navigate("/menu");
  }

  async function submit_forgot() {
    if (!username.trim()) return set_message("Please enter your username.");
    if (!email.trim()) return set_message("Please enter your email.");

    const data = await post_json("/api/auth/forgot-password", { username: username.trim(), email: email.trim() });
    set_identifier(username.trim());
    switch_mode("login", `${data.message} Log in with it, then you can choose a new password.`);
  }

  async function submit_change_password() {
    const error = password_error();
    if (error) return set_message(error);
    await change_password(temporary_password, password);
    set_temporary_password("");
    navigate("/menu");
  }

  async function submit_admin() {
    const user = await admin_login(identifier.trim(), password);
    navigate(user.isAdmin ? "/admin" : "/menu");
  }

  async function handle_submit(event) {
    event.preventDefault();
    set_message("");
    set_busy(true);
    try {
      const handlers = { login: submit_login, register: submit_register, forgot: submit_forgot, change_password: submit_change_password, admin: submit_admin };
      await handlers[mode]();
    } catch (error) {
      set_message(error.message || "Could not reach the server. Please try again.");
    } finally {
      set_busy(false);
    }
  }

  function handle_guest() {
    play_as_guest();
    navigate("/menu");
  }

  function handle_admin() {
    set_identifier("");
    switch_mode("admin");
  }

  const title = { login: "Log In", register: "Create Account", forgot: "Forgot Password", change_password: "Choose a New Password", admin: "Admin Log In" }[mode];
  const submit_label = busy ? "Please wait..." : { forgot: "Send", change_password: "Save Password" }[mode] || title;
  const uses_identifier = mode === "login" || mode === "admin";
  const asks_username_email = mode === "register" || mode === "forgot";
  const asks_new_password = mode === "register" || mode === "change_password";

  return (
    <div className="login_wrap">
      <div className="login_title">
        <h1>Welcome To Caribbean Stud Poker!</h1>
      </div>

      <form className="login_form" onSubmit={handle_submit}>
        <h2 style={{ textAlign: "center" }}>{title}</h2>
        {mode === "admin" && <p className="muted">Sign in using your administrator account.</p>}
        {mode === "forgot" && <p className="muted">Enter your username and email. An admin will set a temporary password and email it to you.</p>}
        {info && <div className="panel" role="status">{info}</div>}

        {uses_identifier && (
          <input
            className="input"
            aria-label={mode === "admin" ? "Admin username" : "Username or email"}
            placeholder="Username / E-Mail"
            value={identifier}
            onChange={(e) => set_identifier(e.target.value)}
          />
        )}
        {asks_username_email && (
          <>
            <input
              className="input"
              aria-label="Username"
              placeholder="Username"
              value={username}
              onChange={(e) => { set_username(e.target.value); set_taken((p) => ({ ...p, username: "" })); }}
              onBlur={(e) => check_available("username", e.target.value)}
            />
            {taken.username && <div className="error_text">{taken.username}</div>}
            <input
              className="input"
              type="email"
              aria-label="Email"
              placeholder="Email"
              value={email}
              onChange={(e) => { set_email(e.target.value); set_taken((p) => ({ ...p, email: "" })); }}
              onBlur={(e) => check_available("email", e.target.value)}
            />
            {taken.email && <div className="error_text">{taken.email}</div>}
          </>
        )}
        {mode !== "forgot" && (
          <input
            className="input"
            type="password"
            aria-label={mode === "change_password" ? "New password" : "Password"}
            placeholder={mode === "change_password" ? "New Password" : "Password"}
            autoComplete={asks_new_password ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => set_password(e.target.value)}
          />
        )}
        {asks_new_password && (
          <>
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
          </>
        )}
        {message && <div className="error_text">{message}</div>}

        <div className="row">
          <button className="btn primary" type="submit" disabled={busy}>{submit_label}</button>
          <span className="spacer" />
          {mode === "login" && <button type="button" className="btn" onClick={() => switch_mode("forgot")}>Forgot Password</button>}
          {mode === "change_password" && <button type="button" className="btn" onClick={() => navigate("/menu")}>Skip for Now</button>}
        </div>

        {mode === "login" && (
          <button type="button" className="btn" onClick={() => switch_mode("register")}>Don't Have an Account? Create Here</button>
        )}
        {mode !== "login" && mode !== "change_password" && (
          <button type="button" className="btn" onClick={() => switch_mode("login")}>Back to Log In</button>
        )}
      </form>

      {mode !== "change_password" && (
        <>
          <hr className="divider" />
          <button className="btn" style={{ width: "100%", padding: 20, fontSize: 18 }} onClick={handle_guest}>Play as Guest</button>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="btn small" onClick={handle_admin}>Admin Sign In</button>
          </div>
        </>
      )}
    </div>
  );
}
