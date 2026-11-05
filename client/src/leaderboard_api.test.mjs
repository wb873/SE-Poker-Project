import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(result, { ...rankings, sessionExpired: true });
  assert.deepEqual(calls.map((call) => call.headers), [{ Authorization: 'Bearer expired-token' }, {}]);
  assert.ok(calls.every((call) => call.signal === signal));
});

test('valid sessions retain personal ranking without a second request', async () => {
  let calls = 0;
  const personal = { rank: 12, userId: 'player' };
  const result = await fetchLeaderboard('/server', 'valid', undefined, async () => {
    calls++;
    return response(200, { ...rankings, currentPlayer: personal });
  });
  assert.equal(calls, 1);
  assert.equal(result.sessionExpired, false);
  assert.deepEqual(result.currentPlayer, personal);
});

test('guest requests omit authentication and do not show an expired-session warning', async () => {
  const result = await fetchLeaderboard('/server', null, undefined, async (url, options) => {
    assert.deepEqual(options.headers, {});
    return response(200, rankings);
  });
  assert.equal(result.sessionExpired, false);
});

test('database errors remain visible and do not trigger an anonymous retry', async () => {
  let calls = 0;
  await assert.rejects(fetchLeaderboard('/server', 'valid', undefined, async () => {
    calls++;
    return response(500, { error: 'Could not load the leaderboard.' });
  }), /Could not load the leaderboard/);
  assert.equal(calls, 1);
});

test('a failed public retry reports its error', async () => {
  let calls = 0;
  await assert.rejects(fetchLeaderboard('/server', 'expired', undefined, async () => {
    return ++calls === 1 ? response(401, {}) : response(500, { error: 'Public rankings unavailable.' });
  }), /Public rankings unavailable/);
});
