import { test, expect } from '@jest/globals';
import { fetchLeaderboard } from './leaderboard_api.mjs';

const rankings = { mode: 'seasonal', label: 'Turkey Champs', topPlayers: [], currentPlayer: null };
const response = (status, body) => ({ status, ok: status === 200, json: async () => body });

test('expired login refresh keeps the named public leaderboard visible without personal rank', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, ...options });
    return calls.length === 1 ? response(401, { error: 'Please log in again.' }) : response(200, rankings);
  };
  const signal = new AbortController().signal;
  const result = await fetchLeaderboard('/server', 'expired-token', signal, request);
  expect(result).toEqual({ ...rankings, sessionExpired: true });
  expect(calls.map((call) => call.headers)).toEqual([{ Authorization: 'Bearer expired-token' }, {}]);
  expect(calls.every((call) => call.signal === signal)).toBe(true);
});

test('valid sessions retain personal ranking without a second request', async () => {
  let calls = 0;
  const personal = { rank: 12, userId: 'player' };
  const result = await fetchLeaderboard('/server', 'valid', undefined, async () => {
    calls++;
    return response(200, { ...rankings, currentPlayer: personal });
  });
  expect(calls).toBe(1);
  expect(result.sessionExpired).toBe(false);
  expect(result.currentPlayer).toEqual(personal);
});

test('guest requests omit authentication and do not show an expired-session warning', async () => {
  const result = await fetchLeaderboard('/server', null, undefined, async (url, options) => {
    expect(options.headers).toEqual({});
    return response(200, rankings);
  });
  expect(result.sessionExpired).toBe(false);
});

test('database errors remain visible and do not trigger an anonymous retry', async () => {
  let calls = 0;
  await expect(fetchLeaderboard('/server', 'valid', undefined, async () => {
    calls++;
    return response(500, { error: 'Could not load the leaderboard.' });
  })).rejects.toThrow('Could not load the leaderboard');
  expect(calls).toBe(1);
});

test('a failed public retry reports its error', async () => {
  let calls = 0;
  await expect(fetchLeaderboard('/server', 'expired', undefined, async () => {
    return ++calls === 1 ? response(401, {}) : response(500, { error: 'Public rankings unavailable.' });
  })).rejects.toThrow('Public rankings unavailable');
});
