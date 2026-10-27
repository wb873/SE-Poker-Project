
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { use_session } from "./session.jsx";
import LoginPage from "./pages/login_page.jsx";
import MainMenuPage from "./pages/main_menu_page.jsx";
import LobbyBrowserPage from "./pages/lobby_browser_page.jsx";
import CreateLobbyPage from "./pages/create_lobby_page.jsx";
import GameTablePage from "./pages/game_table_page.jsx";
import ProfilePage from "./pages/profile_page.jsx";
import FriendsPage from "./pages/friends_page.jsx";
import LeaderboardPage from "./pages/leaderboard_page.jsx";
import DisclaimerBanner from "./components/disclaimer_banner.jsx";
import AdminPage from "./pages/admin_page.jsx";
import ContactPage from './pages/contact_page.jsx';

// API routes independently verify the session and admin role.
function RequireAdmin({ children }) {
  const { player } = use_session();
  if (!player) return <Navigate to="/" replace />;
  return player.is_admin ? children : <Navigate to="/menu" replace />;
}

// Redirects to the login screen when nobody is signed in (guests count as signed in)
function RequireSession({ children }) {
  const { player } = use_session();
  return player ? children : <Navigate to="/" replace />;
}

// Redirects guests away from registered-only screens (friends, saved stats)
function RequireRegistered({ children }) {
  const { player } = use_session();
  if (!player) return <Navigate to="/" replace />;
  if (player.is_guest) return <Navigate to="/menu" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="/contact" element={<RequireRegistered><ContactPage /></RequireRegistered>} />
        <Route path="/menu" element={<RequireSession><MainMenuPage /></RequireSession>} />
        <Route path="/lobbies" element={<RequireSession><LobbyBrowserPage /></RequireSession>} />
        <Route path="/lobbies/new" element={<RequireSession><CreateLobbyPage /></RequireSession>} />
        <Route path="/table/:lobby_id" element={<RequireSession><GameTablePage /></RequireSession>} />
        <Route path="/profile" element={<RequireRegistered><ProfilePage /></RequireRegistered>} />
        <Route path="/friends" element={<RequireRegistered><FriendsPage /></RequireRegistered>} />
        <Route path="/leaderboard" element={<RequireSession><LeaderboardPage /></RequireSession>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DisclaimerBanner />
    </>
  );
}
