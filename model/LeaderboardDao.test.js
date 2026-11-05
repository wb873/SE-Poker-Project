const users = require('./UserDao');
const dao = require('./LeaderboardDao');
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
