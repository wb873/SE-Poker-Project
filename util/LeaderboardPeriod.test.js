const periods = require('./LeaderboardPeriod');

test.each([
    ['2026-11-01T03:59:59.999Z', '2026-10'],
    ['2026-11-01T04:00:00.000Z', '2026-11'],
    ['2026-12-01T04:59:59.999Z', '2026-11'],
    ['2026-12-01T05:00:00.000Z', '2026-12'],
    ['2027-01-01T04:59:59.999Z', '2026-12'],
    ['2027-01-01T05:00:00.000Z', '2027-01'],
])('assigns settlement %s to Eastern month %s', (instant, month) => {
    expect(periods.current(new Date(instant)).month).toBe(month);
});

test('returns a display label and the reset timezone', () => {
    expect(periods.current(new Date('2026-11-04T12:00:00Z'))).toEqual({
        month: '2026-11', label: 'November 2026', timeZone: 'America/New_York',
    });
});
