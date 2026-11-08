import { API_URL } from "./api_config.js";

// Resolves with the updated lobby, or throws an Error with the server's message.
// Pass a password only for private lobbies.
export async function join_lobby(lobby_id, username, password) {
  const response = await fetch(`${API_URL}/api/lobbies/${lobby_id}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not join lobby.");
  return data.lobby;
}