jest.mock('../model/UserDao', () => ({ findById: jest.fn() }));
const express = require('express');
const users = require('../model/UserDao');
const sessions = require('../util/AuthSession');
let server, base, user;
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/user_routes'));
    server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}/api/auth/stats`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    jest.resetAllMocks();
    user = { _id: '507f1f77bcf86cd799439011', passwordHash: 'secret-hash', email: 'private@example.com',
        stats: { handsPlayed: 10, handsWon: 3, totalWinnings: -40, biggestWin: 60, timesFolded: 2, bestHandRank: 5 } };
    users.findById.mockResolvedValue(user);
});
test('returns current authenticated lifetime stats without secrets or another requested account', async () => {
    const response = await fetch(`${base}?userId=someone-else`, { headers: { Authorization: `Bearer ${sessions.create(user)}` } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ scope: 'lifetime', stats: { handsPlayed: 10, handsWon: 3, winRate: 30, totalWinnings: -40, biggestWin: 60, timesFolded: 2, bestHand: 'Flush', sideBetWinnings: null } });
    expect(JSON.stringify(body)).not.toContain('secret-hash');
    expect(JSON.stringify(body)).not.toContain('private@example.com');
    expect(users.findById).toHaveBeenCalledWith(user._id);
});
test.each([null, 'forged'])('requires a valid account session (%s)', async (token) => {
    const response = await fetch(base, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    expect(response.status).toBe(401);
});
test('refresh reads newly saved totals rather than login-time data', async () => {
    const headers = { Authorization: `Bearer ${sessions.create(user)}` };
    expect((await (await fetch(base, { headers })).json()).stats.handsPlayed).toBe(10);
    user.stats.handsPlayed = 11;
    expect((await (await fetch(base, { headers })).json()).stats.handsPlayed).toBe(11);
});
test('banned users cannot retrieve stats and database errors do not return fabricated zeros', async () => {
    const headers = { Authorization: `Bearer ${sessions.create(user)}` };
    users.findById.mockRejectedValueOnce(new Error('database offline'));
    expect((await fetch(base, { headers })).status).toBe(500);
    user.isBanned = true;
    expect((await fetch(base, { headers })).status).toBe(401);
});
