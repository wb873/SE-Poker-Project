const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const periods = require('../util/LeaderboardPeriod');

const schema = new mongoose.Schema({
    _id: { type: String, default: 'leaderboard' },
    mode: { type: String, enum: ['monthly', 'seasonal'], default: 'monthly' },
    revision: { type: Number, default: 0 },
    monthlyReset: { month: String, bucket: String, startedAt: Date },
    // Read legacy saves, then migrate them on the next admin edit.
    season: { name: String, bucket: String, startedAt: Date },
    seasons: [{ _id: false, id: String, name: String, bucket: String, startedAt: Date }],
    selectedSeasonId: { type: String, default: null },
}, { timestamps: true });
const Settings = mongoose.models.LeaderboardSettings || mongoose.model('LeaderboardSettings', schema);

function normalize(settings = {}) {
    const seasons = settings.seasons || (settings.season?.bucket
        ? [{ ...settings.season, id: settings.season.bucket }] : []);
    const selectedSeasonId = settings.selectedSeasonId ?? (settings.seasons ? null : seasons[0]?.id) ?? null;
    return { ...settings, revision: settings.revision || 0,
        mode: settings.mode || 'monthly', monthlyReset: settings.monthlyReset || null,
        seasons, selectedSeasonId, season: seasons.find((season) => season.id === selectedSeasonId) || null };
}

exports.read = async () => normalize(await Settings.findById('leaderboard').lean() || {});
exports.monthlyBucket = (settings, month) => settings.monthlyReset?.month === month ? settings.monthlyReset.bucket : month;

// A revision check keeps simultaneous admin edits from overwriting each other.
async function edit(change) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const settings = await exports.read();
        change(settings);
        const revision = settings.revision === 0
            ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
            : { revision: settings.revision };
        try {
            const updated = await Settings.findOneAndUpdate({ _id: 'leaderboard', ...revision }, {
                $set: { mode: settings.mode, monthlyReset: settings.monthlyReset,
                    seasons: settings.seasons, selectedSeasonId: settings.selectedSeasonId },
                $inc: { revision: 1 }, $unset: { season: '' },
            }, { upsert: settings.revision === 0, returnDocument: 'after', runValidators: true }).lean();
            if (updated) return normalize(updated);
        } catch (error) { if (error.code !== 11000) throw error; }
    }
    throw Object.assign(new Error('Leaderboard settings changed. Refresh and try again.'), { status: 409 });
}

function findSeason(settings, id) {
    const season = settings.seasons.find((saved) => saved.id === id);
    if (!season) throw Object.assign(new Error('Saved season not found.'), { status: 404 });
    return season;
}

exports.startSeason = (name) => edit((settings) => {
    const id = randomUUID();
    settings.seasons.push({ id, name, bucket: `season:${randomUUID()}`, startedAt: new Date() });
    settings.selectedSeasonId = id;
    settings.mode = 'seasonal';
});

exports.selectSeason = (id) => edit((settings) => {
    findSeason(settings, id);
    settings.selectedSeasonId = id;
    settings.mode = 'seasonal';
});

exports.deleteSeason = (id) => edit((settings) => {
    findSeason(settings, id);
    settings.seasons = settings.seasons.filter((season) => season.id !== id);
    if (settings.selectedSeasonId === id) {
        settings.selectedSeasonId = null;
        settings.mode = 'monthly';
    }
});

exports.setMode = (mode) => edit((settings) => {
    if (mode === 'seasonal' && !settings.season)
        throw Object.assign(new Error('Select a saved season first.'), { status: 409 });
    settings.mode = mode;
});

exports.reset = (target, seasonId) => edit((settings) => {
    const now = new Date();
    if (target === 'seasonal') {
        const season = findSeason(settings, seasonId);
        season.bucket = `season:${randomUUID()}`;
        season.startedAt = now;
    } else {
        settings.monthlyReset = { month: periods.current(now).month, bucket: `monthly:${randomUUID()}`, startedAt: now };
    }
});
