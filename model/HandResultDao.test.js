// Run with: npx jest model/HandResultDao.test.js
// Needs TESTDB_URI in .env (a TEST database: deleteAll() wipes the handresults collection).
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./DbConnection");
const HandResultDao = require("./HandResultDao");

const hasTestDb = Boolean(process.env.TESTDB_URI || process.env.CI);
const dbTest = hasTestDb ? test : test.skip;

const LONG_AGO = new Date(2000, 0, 1);

// Jest needs at least one non-skipped test per file
test("test database configuration", () => {
  if (!hasTestDb) console.warn("TESTDB_URI is not set: HandResultDao tests were skipped.");
  expect(true).toBe(true);
});

// Inserts a hand with a chosen date (create() always stamps the current time)
function insertOldHand(username, net, createdAt) {
  return mongoose.models.HandResult.collection.insertOne({ username, net, result: "win", createdAt, updatedAt: createdAt });
}

beforeAll(async () => {
  if (!hasTestDb) return;
  db.connect("test");
  await mongoose.connection.asPromise();
}, 30000);

beforeEach(async () => {
  if (hasTestDb) await HandResultDao.deleteAll();
});

afterAll(async () => {
  if (!hasTestDb) return;
  await HandResultDao.deleteAll();
  await db.disconnect();
});

dbTest("record stores the hand with a timestamp", async () => {
  const created = await HandResultDao.record("alice", 30, "win");

  expect(created._id).toBeDefined();
  expect(created.username).toBe("alice");
  expect(created.net).toBe(30);
  expect(created.result).toBe("win");
  expect(created.createdAt).toBeInstanceOf(Date);
});

dbTest("record requires a username, net and result", async () => {
  await expect(HandResultDao.record(undefined, 30, "win")).rejects.toThrow();
  await expect(HandResultDao.record("alice", undefined, "win")).rejects.toThrow();
  await expect(HandResultDao.record("alice", 30, undefined)).rejects.toThrow();
});

dbTest("leaderboard adds up each player's net and hands", async () => {
  await HandResultDao.record("alice", 30, "win");
  await HandResultDao.record("alice", -10, "fold");
  await HandResultDao.record("bob", 5, "win");

  const board = await HandResultDao.leaderboard(LONG_AGO);
  expect(board).toEqual([
    { username: "alice", net: 20, hands: 2 },
    { username: "bob", net: 5, hands: 1 },
  ]);
});

dbTest("leaderboard ranks by net, best first, losses last", async () => {
  await HandResultDao.record("loser", -50, "loss");
  await HandResultDao.record("winner", 100, "win");
  await HandResultDao.record("even", 0, "push");

  const board = await HandResultDao.leaderboard(LONG_AGO);
  expect(board.map((p) => p.username)).toEqual(["winner", "even", "loser"]);
});

dbTest("leaderboard breaks ties alphabetically", async () => {
  await HandResultDao.record("carol", 10, "win");
  await HandResultDao.record("alice", 10, "win");
  await HandResultDao.record("bob", 10, "win");

  const board = await HandResultDao.leaderboard(LONG_AGO);
  expect(board.map((p) => p.username)).toEqual(["alice", "bob", "carol"]);
});

dbTest("leaderboard ignores hands from before the start date", async () => {
  const monthStart = new Date(2026, 9, 1);
  await insertOldHand("alice", 500, new Date(2026, 8, 30)); // last month
  await insertOldHand("alice", 10, new Date(2026, 9, 2)); // this month
  await insertOldHand("bob", 999, new Date(2026, 8, 15)); // only played last month

  const board = await HandResultDao.leaderboard(monthStart);
  expect(board).toEqual([{ username: "alice", net: 10, hands: 1 }]);
});

dbTest("leaderboard returns only the top players", async () => {
  for (const [name, net] of [["a", 1], ["b", 2], ["c", 3], ["d", 4]]) {
    await HandResultDao.record(name, net, "win");
  }

  const board = await HandResultDao.leaderboard(LONG_AGO, 2);
  expect(board.map((p) => p.username)).toEqual(["d", "c"]);
});

dbTest("leaderboard is empty when nobody has played", async () => {
  expect(await HandResultDao.leaderboard(LONG_AGO)).toEqual([]);
});
