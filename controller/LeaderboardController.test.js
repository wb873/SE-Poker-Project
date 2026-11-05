jest.mock('../model/LeaderboardDao', () => ({ readMonthly: jest.fn() }));
jest.mock('../model/UserDao', () => ({ findById: jest.fn() }));
const express = require('express');
const dao = require('../model/LeaderboardDao');
const users = require('../model/UserDao');
const sessions = require('../util/AuthSession');
const periods = require('../util/LeaderboardPeriod');
let server, base;
const player = { _id: '507f1f77bcf86cd799439011', passwordHash: 'test-hash' };
beforeAll(async () => {
    const app = express();
    app.use('/api/leaderboard', require('../routes/leaderboard_routes'));
    server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}/api/leaderboard`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    jest.resetAllMocks();
    users.findById.mockResolvedValue(player);
    dao.readMonthly.mockResolvedValue({ topPlayers: [], currentPlayer: null });
});
test('guests can read rankings but cannot request another account personal rank', async () => {
    const response = await fetch(`${base}?userId=${player._id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...periods.current(), topPlayers: [], currentPlayer: null });
    expect(dao.readMonthly).toHaveBeenCalledWith(periods.current().month, undefined);
    expect(users.findById).not.toHaveBeenCalled();
});
test.each([3, 14])('returns authenticated personal rank %s alongside the top ten', async (rank) => {
    const topPlayers = Array.from({ length: 10 }, (_, i) => ({ userId: `${i}`, rank: i + 1, username: `Player${i}`, netChips: 100 - i }));
    const currentPlayer = { userId: player._id, rank, username: 'You', netChips: 12 };
    dao.readMonthly.mockResolvedValue({ topPlayers, currentPlayer });
    const response = await fetch(base, { headers: { Authorization: `Bearer ${sessions.create(player)}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ topPlayers, currentPlayer }));
    expect(dao.readMonthly).toHaveBeenCalledWith(periods.current().month, player._id);
});
test('rejects a forged token without reading rankings', async () => {
    const response = await fetch(base, { headers: { Authorization: 'Bearer forged' } });
    expect(response.status).toBe(401);
    expect(dao.readMonthly).not.toHaveBeenCalled();
});
test('database failure returns an actionable error', async () => {
    dao.readMonthly.mockRejectedValue(new Error('offline'));
    const response = await fetch(base);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not load the leaderboard.' });
});
