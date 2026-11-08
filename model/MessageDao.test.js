// Run with: npx jest model/MessageDao.test.js
// Needs TESTDB_URI in .env (a TEST database: deleteAll() wipes the messages collection).
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./DbConnection");
const MessageDao = require("./MessageDao");

const hasTestDb = Boolean(process.env.TESTDB_URI || process.env.CI);
const dbTest = hasTestDb ? test : test.skip;

// Jest needs at least one non-skipped test per file
test("test database configuration", () => {
  if (!hasTestDb) console.warn("TESTDB_URI is not set: MessageDao tests were skipped.");
  expect(true).toBe(true);
});

beforeAll(async () => {
  if (!hasTestDb) return;
  db.connect("test");
  await mongoose.connection.asPromise();
}, 30000);

beforeEach(async () => {
  if (hasTestDb) await MessageDao.deleteAll();
});

afterAll(async () => {
  if (!hasTestDb) return;
  await MessageDao.deleteAll();
  await db.disconnect();
});

dbTest("create stores the message with a timestamp", async () => {
  const created = await MessageDao.create("alice", "bob", "hi");

  expect(created._id).toBeDefined();
  expect(created.from).toBe("alice");
  expect(created.to).toBe("bob");
  expect(created.text).toBe("hi");
  expect(created.createdAt).toBeInstanceOf(Date);
});

dbTest("create trims the text", async () => {
  const created = await MessageDao.create("alice", "bob", "  hi  ");
  expect(created.text).toBe("hi");
});

dbTest("create rejects empty or over-500-character text", async () => {
  await expect(MessageDao.create("alice", "bob", "   ")).rejects.toThrow();
  await expect(MessageDao.create("alice", "bob", "x".repeat(501))).rejects.toThrow();
});

dbTest("conversation includes both directions, oldest first", async () => {
  await MessageDao.create("alice", "bob", "one");
  await MessageDao.create("bob", "alice", "two");
  await MessageDao.create("alice", "bob", "three");

  const messages = await MessageDao.conversation("alice", "bob");
  expect(messages.map((m) => m.text)).toEqual(["one", "two", "three"]);
});

dbTest("conversation is the same from either player's side", async () => {
  await MessageDao.create("alice", "bob", "one");
  await MessageDao.create("bob", "alice", "two");

  const fromAlice = await MessageDao.conversation("alice", "bob");
  const fromBob = await MessageDao.conversation("bob", "alice");
  expect(fromBob.map((m) => m.text)).toEqual(fromAlice.map((m) => m.text));
});

dbTest("conversation leaves out other players' messages", async () => {
  await MessageDao.create("alice", "bob", "for bob");
  await MessageDao.create("alice", "carol", "for carol");
  await MessageDao.create("carol", "bob", "carol to bob");

  const messages = await MessageDao.conversation("alice", "bob");
  expect(messages.map((m) => m.text)).toEqual(["for bob"]);
});

dbTest("conversation returns only the latest messages, still oldest first", async () => {
  for (let i = 1; i <= 5; i++) {
    await MessageDao.create("alice", "bob", `msg ${i}`);
  }

  const messages = await MessageDao.conversation("alice", "bob", 3);
  expect(messages.map((m) => m.text)).toEqual(["msg 3", "msg 4", "msg 5"]);
});

dbTest("conversation returns an empty list when nobody has written", async () => {
  expect(await MessageDao.conversation("alice", "bob")).toEqual([]);
});
