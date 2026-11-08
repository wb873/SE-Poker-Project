jest.mock('../model/LeaderboardDao', () => ({ readMonthly: jest.fn(), recordResult: jest.fn() }));
jest.mock('../model/PlayerStatsDao', () => ({ recordHand: jest.fn() }));
jest.mock('../model/UserDao', () => ({ findById: jest.fn() }));
jest.mock('../model/LeaderboardSettingsDao', () => ({
    read: jest.fn(), monthlyBucket: jest.fn(), startSeason: jest.fn(), setMode: jest.fn(), reset: jest.fn(),
    selectSeason: jest.fn(), deleteSeason: jest.fn(),
}));
const express = require('express');
const dao = require('../model/LeaderboardDao');
const users = require('../model/UserDao');
const sessions = require('../util/AuthSession');
const periods = require('../util/LeaderboardPeriod');
const settings = require('../model/LeaderboardSettingsDao');
const controller = require('./LeaderboardController');
const statsDao = require('../model/PlayerStatsDao');
let server, base;
const player = { _id: '507f1f77bcf86cd799439011', passwordHash: 'test-hash' };
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/leaderboard', require('../routes/leaderboard_routes'));
    app.use('/api/admin', require('../routes/admin_routes'));
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
    settings.read.mockResolvedValue({ mode: 'monthly' });
    settings.monthlyBucket.mockImplementation((config, month) => month);
    dao.recordResult.mockResolvedValue([]);
    statsDao.recordHand.mockResolvedValue({ modifiedCount: 1 });
});
test('guests can read rankings but cannot request another account personal rank', async () => {
    const response = await fetch(`${base}?userId=${player._id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...periods.current(), mode: 'monthly', topPlayers: [], currentPlayer: null });
    expect(dao.readMonthly).toHaveBeenCalledWith(periods.current().month, undefined);
    expect(users.findById).not.toHaveBeenCalled();
});

test('public leaderboard follows the selected season and custom label', async () => {
    settings.read.mockResolvedValue({ mode: 'seasonal', season: { name: 'Winter Cup', bucket: 'season:winter' } });
    const response = await fetch(base);
    expect(await response.json()).toEqual(expect.objectContaining({ mode: 'seasonal', label: 'Winter Cup' }));
    expect(dao.readMonthly).toHaveBeenCalledWith('season:winter', undefined);
});

async function adminRequest(body, role = 'admin') {
    const user = { ...player, isAdmin: role === 'admin' };
    users.findById.mockResolvedValue(user);
    return fetch(base.replace('/leaderboard', '/admin/leaderboard'), {
        method: body ? 'PATCH' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(role === 'anonymous' ? {} : { Authorization: `Bearer ${sessions.create(user)}` }) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

test.each(['anonymous', 'player'])('rejects %s reading settings or resetting standings', async (role) => {
    const expected = role === 'anonymous' ? 401 : 403;
    expect((await adminRequest(null, role)).status).toBe(expected);
    expect((await adminRequest({ action: 'reset', target: 'monthly' }, role)).status).toBe(expected);
    expect(settings.reset).not.toHaveBeenCalled();
});

test('admins can inspect settings and start a trimmed custom season', async () => {
    expect((await adminRequest()).status).toBe(200);
    settings.startSeason.mockResolvedValue({ mode: 'seasonal', season: { name: 'Winter Cup' } });
    const response = await adminRequest({ action: 'start-season', name: ' Winter Cup ' });
    expect(response.status).toBe(200);
    expect(settings.startSeason).toHaveBeenCalledWith('Winter Cup');
});

test.each(['monthly', 'seasonal'])('admin can switch to %s or independently reset it', async (mode) => {
    settings.setMode.mockResolvedValue({ mode });
    settings.reset.mockResolvedValue({ mode: 'monthly' });
    expect((await adminRequest({ action: 'set-mode', mode })).status).toBe(200);
    expect(settings.setMode).toHaveBeenCalledWith(mode);
    const seasonId = mode === 'seasonal' ? 'saved-season' : undefined;
    expect((await adminRequest({ action: 'reset', target: mode, seasonId })).status).toBe(200);
    expect(settings.reset).toHaveBeenCalledWith(mode, seasonId);
});

test.each([
    { action: 'start-season', name: ' ' }, { action: 'start-season', name: 'x'.repeat(61) },
    { action: 'set-mode', mode: 'invalid' }, { action: 'reset', target: 'all' }, { action: 'invalid' },
    { action: 'select-season' }, { action: 'delete-season', seasonId: 123 }, { action: 'reset', target: 'seasonal' },
])('rejects invalid admin input %j', async (body) => {
    expect((await adminRequest(body)).status).toBe(400);
    expect(settings.startSeason).not.toHaveBeenCalled();
    expect(settings.setMode).not.toHaveBeenCalled();
    expect(settings.reset).not.toHaveBeenCalled();
});

test.each(['select-season', 'delete-season'])('admins can %s by ID; ordinary users cannot', async (action) => {
    const method = action === 'select-season' ? settings.selectSeason : settings.deleteSeason;
    method.mockResolvedValue({ mode: 'monthly', seasons: [] });
    expect((await adminRequest({ action, seasonId: 'saved-id' }, 'player')).status).toBe(403);
    expect(method).not.toHaveBeenCalled();
    expect((await adminRequest({ action, seasonId: 'saved-id' })).status).toBe(200);
    expect(method).toHaveBeenCalledWith('saved-id');
    method.mockRejectedValue(Object.assign(new Error('Saved season not found.'), { status: 404 }));
    expect((await adminRequest({ action, seasonId: 'deleted-id' })).status).toBe(404);
});

test('returns a conflict when no season exists and handles database errors', async () => {
    settings.setMode.mockRejectedValue(Object.assign(new Error('Start a season first.'), { status: 409 }));
    expect((await adminRequest({ action: 'set-mode', mode: 'seasonal' })).status).toBe(409);
    settings.reset.mockRejectedValue(new Error('offline'));
    expect((await adminRequest({ action: 'reset', target: 'monthly' })).status).toBe(500);
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

describe('recordHand integration', () => {
    const finished = (changes = {}) => ({ phase: 'done', ownerId: player._id,
        handId: 'unique-hand', handStartBalance: 1000, balance: 1030,
        settledAt: new Date('2026-11-08T12:00:00Z'), result: 'win', playerHandRank: 'One Pair', ...changes });
    test.each([1030, 970, 1000])('records a finished hand with ending balance %s', async (balance) => {
        const game = finished({ balance });
        await controller.recordHand(game);
        expect(dao.recordResult).toHaveBeenCalledWith(player._id, balance - 1000, game.settledAt, game.handId);
        expect(statsDao.recordHand).toHaveBeenCalledWith(player._id, game.handId, balance - 1000, 'win', 'One Pair');
    });
    test.each([{ phase: 'decision' }, { ownerId: null }, { handId: null }])('skips unfinished or unowned hands %j', async (changes) => {
        await controller.recordHand(finished(changes));
        expect(dao.recordResult).not.toHaveBeenCalled();
        expect(statsDao.recordHand).not.toHaveBeenCalled();
    });
    test('real game folding records the ante loss using its authenticated owner ID', async () => {
        const engine = require('../game');
        const game = engine.getGame(engine.createGame(10).gameId);
        game.ownerId = player._id;
        engine.applyAction(game, 'fold');
        await controller.recordHand(game);
        expect(dao.recordResult).toHaveBeenCalledWith(player._id, -10, expect.any(Date), game.handId);
    });
    test('saving failures are logged without breaking gameplay', async () => {
        dao.recordResult.mockRejectedValue(new Error('db down'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(controller.recordHand(finished())).resolves.toBeUndefined();
        expect(log).toHaveBeenCalled();
        expect(statsDao.recordHand).toHaveBeenCalled();
        log.mockRestore();
    });
    test('a lifetime stats failure does not prevent leaderboard recording', async () => {
        statsDao.recordHand.mockRejectedValue(new Error('stats unavailable'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        await controller.recordHand(finished());
        expect(dao.recordResult).toHaveBeenCalled();
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
});
