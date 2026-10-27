import React, { createContext, useContext, useState } from "react";
import { API_URL } from "./api_config.js";

// Session context: holds the current player, balance and authenticated API token.
const session_context = createContext(null);

export function SessionProvider({ children }) {
  const [player, set_player] = useState(null); // null = not signed in
  const [balance, set_balance] = useState(0);
  const [token, set_token] = useState(null);

  // Map the API's account fields to the existing UI's session fields.
  function accept_session(data) {
    set_player({ ...data.user, is_guest: false, is_admin: Boolean(data.user.isAdmin) });
    set_balance(data.user.balance);
    set_token(data.token);
    return data.user;
  }

  async function login(identifier, password) {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Could not log in.'), { code: data.code });
    return accept_session(data);
  }

  // Changing the password ends every session, so the server sends back a new token
  async function change_password(current_password, new_password) {
    const response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: current_password, newPassword: new_password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not change the password.');
    return accept_session(data);
  }

  // Guest play gets a starting balance (story P5/P6)
  function play_as_guest() {
    if (token) fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    set_token(null);
    set_player({ username: "Guest", is_guest: true, is_admin: false });
    set_balance(1000);
  }

  async function admin_login(identifier, password) {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not log in.');
    if (!data.user.isAdmin) {
      const logout_response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST', headers: { Authorization: `Bearer ${data.token}` },
      });
      const logout_data = await logout_response.json();
      if (!logout_response.ok) throw new Error(logout_data.error || 'Could not log out.');
      throw new Error('This account does not have administrator access.');
    }
    return accept_session(data);
  }

  function logout() {
    if (token) fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    set_token(null);
    set_player(null);
    set_balance(0);
  }

  const value = { player, balance, token, set_balance, login, change_password, play_as_guest, admin_login, logout };
  return <session_context.Provider value={value}>{children}</session_context.Provider>;
}

export function use_session() {
  return useContext(session_context);
}
