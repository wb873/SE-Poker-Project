const users = require('./UserDao');
const dao = require('./PlayerStatsDao');
const { toPublicStats } = require('../util/PlayerStats');
const id = '507f1f77bcf86cd799439011';
let account;

beforeEach(() => {
    account = { stats: { handsPlayed: 4, handsWon: 1, biggestPot: 500 }, recordedStatsResults: [] };
    jest.spyOn(users.model, 'updateOne').mockImplementation(async (filter, update) => {
        if (account.isBanned || account.recordedStatsResults.includes(filter.recordedStatsResults.$ne)) return { modifiedCount: 0 };
        for (const [path, amount] of Object.entries(update.$inc)) {
            const field = path.split('.')[1];
            account.stats[field] = (account.stats[field] || 0) + amount;
        }
        for (const [path, value] of Object.entries(update.$max)) {
            const field = path.split('.')[1];
            account.stats[field] = Math.max(account.stats[field] ?? -Infinity, value);
        }
        account.recordedStatsResults.push(update.$addToSet.recordedStatsResults);
        return { modifiedCount: 1 };
    });
});
afterEach(() => jest.restoreAllMocks());

test('counts wins, non-qualification, pushes, losses and folds with net winnings', async () => {
    await dao.recordHand(id, 'one', 30, 'win', 'One Pair');
    await dao.recordHand(id, 'two', 10, 'dealer_not_qualified', 'High Card');
    await dao.recordHand(id, 'three', 0, 'push', 'Straight');
    await dao.recordHand(id, 'four', -30, 'loss', 'Two Pair');
    await dao.recordHand(id, 'five', -30, 'fold', 'Royal Flush');
    expect(toPublicStats(account.stats)).toEqual({
        handsPlayed: 9, handsWon: 3, winRate: 33.33,
        totalWinnings: -20, biggestWin: 30, timesFolded: 1,
        bestHand: 'Straight', sideBetWinnings: null,
    });
    expect(account.stats.biggestPot).toBe(500);
});

test('folded strong hands do not replace the strongest showdown, including losing showdowns', async () => {
    await dao.recordHand(id, 'one', -30, 'loss', 'Flush');
    await dao.recordHand(id, 'two', -10, 'fold', 'Royal Flush');
    await dao.recordHand(id, 'three', 10, 'dealer_not_qualified', 'High Card');
    expect(toPublicStats(account.stats).bestHand).toBe('Flush');
});

test('duplicate and simultaneous replays count once while distinct hands still count', async () => {
    await Promise.all([dao.recordHand(id, 'one', 30, 'win', 'One Pair'), dao.recordHand(id, 'one', 30, 'win', 'One Pair')]);
    await dao.recordHand(id, 'two', -10, 'fold');
    expect(account.stats.handsPlayed).toBe(6);
    expect(account.stats.totalWinnings).toBe(20);
});

test('preserves existing saved totals and maximum win', async () => {
    account.stats = { handsPlayed: 100, handsWon: 50, totalWinnings: 1234, biggestWin: 500, timesFolded: 20, bestHandRank: 8 };
    await dao.recordHand(id, 'one', 30, 'win', 'Two Pair');
    expect(toPublicStats(account.stats)).toMatchObject({ handsPlayed: 101, handsWon: 51, totalWinnings: 1264, biggestWin: 500, timesFolded: 20, bestHand: 'Straight Flush' });
});

test('banned accounts do not accumulate statistics', async () => {
    account.isBanned = true;
    await dao.recordHand(id, 'one', 30, 'win', 'One Pair');
    expect(account.stats.handsPlayed).toBe(4);
});

test('rejects guest IDs, missing deduplication IDs, invalid results and invalid showdown ranks', () => {
    expect(() => dao.recordHand('Guest', 'hand', 10, 'win', 'One Pair')).toThrow('account ID');
    expect(() => dao.recordHand(id, '', 10, 'win', 'One Pair')).toThrow('hand ID');
    expect(() => dao.recordHand(id, 'hand', 1.5, 'win', 'One Pair')).toThrow('whole number');
    expect(() => dao.recordHand(id, 'hand', 10, 'unknown', 'One Pair')).toThrow('completed hand');
    expect(() => dao.recordHand(id, 'hand', 10, 'win', null)).toThrow('showdown');
    expect(users.model.updateOne).not.toHaveBeenCalled();
});

test('new accounts show zero wins and no fabricated best hand', () => {
    expect(toPublicStats()).toEqual({ handsPlayed: 0, handsWon: 0, winRate: 0, totalWinnings: 0, biggestWin: 0, timesFolded: 0, bestHand: null, sideBetWinnings: null });
});
