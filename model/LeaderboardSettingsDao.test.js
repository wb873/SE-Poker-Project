const mongoose = require('mongoose');
const dao = require('./LeaderboardSettingsDao');
const periods = require('../util/LeaderboardPeriod');
const Model = mongoose.model('LeaderboardSettings');
let stored;

beforeEach(() => {
    stored = null;
    jest.spyOn(Model, 'findById').mockImplementation(() => ({ lean: async () => structuredClone(stored) }));
    jest.spyOn(Model, 'findOneAndUpdate').mockImplementation((filter, update, options) => ({ lean: async () => {
        if (filter.revision != null && stored?.revision !== filter.revision) return null;
        if (!stored && !options.upsert) return null;
        stored = { ...(stored || {}), ...structuredClone(update.$set), revision: (stored?.revision || 0) + 1 };
        if (update.$unset?.season != null) delete stored.season;
        return structuredClone(stored);
    } }));
});
afterEach(() => jest.restoreAllMocks());

test('a fresh installation defaults to monthly with no saved seasons', async () => {
    expect(await dao.read()).toMatchObject({ mode: 'monthly', season: null, seasons: [], selectedSeasonId: null });
});

test('creating seasons preserves every saved leaderboard and selects the newest', async () => {
    const first = await dao.startSeason('Fall Cup');
    const next = await dao.startSeason('Winter Cup');
    expect(next.seasons).toHaveLength(2);
    expect(next.seasons[0]).toEqual(first.season);
    expect(next.season.name).toBe('Winter Cup');
    expect(next.selectedSeasonId).toBe(next.seasons[1].id);
});

test('selecting older seasons preserves standings and monthly mode keeps tracking selection', async () => {
    const first = await dao.startSeason('Fall Cup');
    await dao.startSeason('Winter Cup');
    const selected = await dao.selectSeason(first.season.id);
    expect(selected.mode).toBe('seasonal');
    expect(selected.season).toEqual(first.season);
    expect((await dao.setMode('monthly')).season).toEqual(first.season);
});

test('reset any season while retaining its ID/name and all other standings', async () => {
    const first = await dao.startSeason('Fall Cup');
    const second = await dao.startSeason('Winter Cup');
    await dao.reset('monthly');
    const before = await dao.setMode('monthly');
    const after = await dao.reset('seasonal', first.season.id);
    expect(after.mode).toBe('monthly');
    expect(after.selectedSeasonId).toBe(second.season.id);
    expect(after.season).toEqual(second.season);
    expect(after.seasons[0]).toMatchObject({ id: first.season.id, name: 'Fall Cup' });
    expect(after.seasons[0].bucket).not.toBe(first.season.bucket);
    expect(after.monthlyReset).toEqual(before.monthlyReset);
});

test('deleting an inactive season keeps the selected season displayed', async () => {
    const first = await dao.startSeason('Fall Cup');
    const second = await dao.startSeason('Winter Cup');
    const after = await dao.deleteSeason(first.season.id);
    expect(after.seasons).toEqual([second.season]);
    expect(after.mode).toBe('seasonal');
    expect(after.season).toEqual(second.season);
});

test('deleting the selected season returns to monthly and stops seasonal tracking', async () => {
    await dao.startSeason('Fall Cup');
    const selected = await dao.startSeason('Winter Cup');
    const after = await dao.deleteSeason(selected.season.id);
    expect(after.mode).toBe('monthly');
    expect(after.season).toBeNull();
    expect(after.selectedSeasonId).toBeNull();
    expect(after.seasons.map((season) => season.name)).toEqual(['Fall Cup']);
});

test('legacy season preserves its bucket, name and start time through migration', async () => {
    const legacy = { name: 'Turkey Champs', bucket: 'season:legacy', startedAt: new Date('2026-11-01') };
    stored = { mode: 'seasonal', season: legacy };
    const before = await dao.read();
    expect(before.season).toMatchObject(legacy);
    const after = await dao.startSeason('Winter Cup');
    expect(after.seasons[0]).toMatchObject(legacy);
    expect(stored.season).toBeUndefined();
    expect((await dao.selectSeason(before.season.id)).season).toEqual(before.season);
});

test('monthly resets preserve seasons and expire next month', async () => {
    const first = await dao.startSeason('Fall Cup');
    const after = await dao.reset('monthly');
    expect(after.season).toEqual(first.season);
    expect(dao.monthlyBucket(after, periods.current().month)).toBe(after.monthlyReset.bucket);
    expect(dao.monthlyBucket(after, '2099-01')).toBe('2099-01');
});

test('unknown IDs cannot select, delete or reset other standings', async () => {
    await dao.startSeason('Fall Cup');
    const before = structuredClone(stored);
    await expect(dao.selectSeason('missing')).rejects.toMatchObject({ status: 404 });
    await expect(dao.deleteSeason('missing')).rejects.toMatchObject({ status: 404 });
    await expect(dao.reset('seasonal', 'missing')).rejects.toMatchObject({ status: 404 });
    expect(stored).toEqual(before);
});

test('a stale admin edit retries against the latest saved seasons', async () => {
    await dao.startSeason('Fall Cup');
    Model.findOneAndUpdate.mockImplementationOnce(() => ({ lean: async () => {
        stored.seasons.push({ id: 'concurrent', name: 'Summer Cup', bucket: 'season:summer', startedAt: new Date() });
        stored.revision++;
        return null;
    } }));
    const after = await dao.startSeason('Winter Cup');
    expect(after.seasons.map((season) => season.name)).toEqual(['Fall Cup', 'Summer Cup', 'Winter Cup']);
});
