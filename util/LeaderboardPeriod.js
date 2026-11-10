const TIME_ZONE = 'America/New_York';

// Calendar months follow Eastern time, including daylight saving time.
exports.current = function(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, year: 'numeric', month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year').value;
    const month = parts.find((part) => part.type === 'month').value;
    return {
        month: `${year}-${month}`,
        label: new Intl.DateTimeFormat('en-US', {
            timeZone: TIME_ZONE, year: 'numeric', month: 'long',
        }).format(date),
        timeZone: TIME_ZONE,
    };
};
