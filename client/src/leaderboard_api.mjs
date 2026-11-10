// Rankings are public. An expired login should only remove personal ranking,
// not prevent the player from viewing the selected leaderboard.
export async function fetchLeaderboard(apiUrl, token, signal, request = fetch) {
  const url = `${apiUrl}/api/leaderboard`;
  let response = await request(url, {
    signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const sessionExpired = Boolean(token && response.status === 401);
  if (sessionExpired) response = await request(url, { signal, headers: {} });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load the leaderboard.');
  return { ...result, sessionExpired };
}
