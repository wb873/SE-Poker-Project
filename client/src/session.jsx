import React, { createContext, useContext, useState } from "react";

// Session context: holds the current player and balance (mock data until the API exists)
const session_context = createContext(null);

export function SessionProvider({ children }) {
  const [player, set_player] = useState(null); // null = not signed in
  const [balance, set_balance] = useState(0);

  // Registered login (placeholder: no server call yet)
  function login(username) {
    set_player({ username, is_guest: false, is_admin: false });
    set_balance(25000);
  }

  // Guest play gets a starting balance (story P5/P6)
  function play_as_guest() {
    set_player({ username: "Guest", is_guest: true, is_admin: false });
    set_balance(1000);
  }

  // Demo only. Replace with server authentication once the user API is ready.
  function admin_login(username, password) {
    if (username !== "admin" || password !== "admin123") return false;
    set_player({ username: "Admin", is_guest: false, is_admin: true });
    set_balance(0);
    return true;
  }

  function logout() {
    set_player(null);
    set_balance(0);
  }

  const value = { player, balance, set_balance, login, play_as_guest, admin_login, logout };
  return <session_context.Provider value={value}>{children}</session_context.Provider>;
}

export function use_session() {
  return useContext(session_context);
}
