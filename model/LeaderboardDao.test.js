const users = require('./UserDao');
const dao = require('./LeaderboardDao');
const settings = require('./LeaderboardSettingsDao');
beforeEach(() => jest.spyOn(settings, 'read').mockResolvedValue({ mode: 'monthly' }));
const id = '507f1f77bcf86cd799439011';
afterEach(() => jest.restoreAllMocks());

test.each([35, -30, 0])('records net result %s in the settlement month without changing the account balance', async (netChips) => {
    jest.spyOn(users, 'findById').mockResolvedValue({ _id: id, balance: 10000 });
    const update = jest.spyOn(dao.model, 'findOneAndUpdate').mockResolvedValue({ netChips });
    const accountUpdate = jest.spyOn(users.model, 'findByIdAndUpdate');
    await dao.recordResult(id, netChips, new Date('2026-12-01T04:59:59Z'));
    expect(update).toHaveBeenCalledWith(
        { userId: id, month: '2026-11' },
        { $inc: { netChips, handsPlayed: 1 } },
        expect.objectContaining({ upsert: true, returnDocument: 'after' })
    );
    expect(accountUpdate).not.toHaveBeenCalled();
});

test('tracks monthly and seasonal results even when monthly is displayed', async () => {
    jest.spyOn(users, 'findById').mockResolvedValue({ _id: id });
    settings.read.mockResolvedValue({ mode: 'monthly', season: { bucket: 'season:winter', startedAt: new Date('2026-11-01T04:00:00Z') } });
    const update = jest.spyOn(dao.model, 'findOneAndUpdate').mockResolvedValue({});
    await dao.recordResult(id, -20, new Date('2026-11-04T12:00:00Z'));
    expect(update.mock.calls.map(([filter]) => filter.month)).toEqual(['2026-11', 'season:winter']);
});

test('monthly reset uses a fresh bucket and excludes delayed pre-reset results', async () => {
    jest.spyOn(users, 'findById').mockResolvedValue({ _id: id });
    settings.read.mockResolvedValue({ monthlyReset: { month: '2026-11', bucket: 'monthly:reset', startedAt: new Date('2026-11-04T12:00:00Z') } });
    const update = jest.spyOn(dao.model, 'findOneAndUpdate').mockResolvedValue({});
    await dao.recordResult(id, 10, new Date('2026-11-04T11:59:59Z'));
    expect(update).not.toHaveBeenCalled();
    await dao.recordResult(id, 10, new Date('2026-11-04T12:00:00Z'));
    expect(update.mock.calls[0][0].month).toBe('monthly:reset');
    await dao.recordResult(id, 10, new Date('2026-12-01T05:00:00Z'));
    expect(update.mock.calls[1][0].month).toBe('2026-12');
});

test('a newly started season never includes earlier settlements', async () => {
    jest.spyOn(users, 'findById').mockResolvedValue({ _id: id });
    settings.read.mockResolvedValue({ season: { bucket: 'season:new', startedAt: new Date('2026-11-05T12:00:00Z') } });
    const update = jest.spyOn(dao.model, 'findOneAndUpdate').mockResolvedValue({});
    await dao.recordResult(id, 10, new Date('2026-11-04T12:00:00Z'));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].month).toBe('2026-11');
});

test.each([null, { _id: id, isBanned: true }])('does not record results for missing or banned accounts', async (user) => {
    jest.spyOn(users, 'findById').mockResolvedValue(user);
    const update = jest.spyOn(dao.model, 'findOneAndUpdate');
    await expect(dao.recordResult(id, 10)).rejects.toThrow('active registered user');
    expect(update).not.toHaveBeenCalled();
});

test('rejects guest IDs, fractional scores and invalid dates before querying accounts', async () => {
    const find = jest.spyOn(users, 'findById');
    await expect(dao.recordResult('Guest', 10)).rejects.toThrow('registered user ID');
    await expect(dao.recordResult(id, 1.5)).rejects.toThrow('whole number');
    await expect(dao.recordResult(id, Infinity)).rejects.toThrow('whole number');
    await expect(dao.recordResult(id, 10, new Date('invalid'))).rejects.toThrow('settlement date');
    expect(find).not.toHaveBeenCalled();
});
