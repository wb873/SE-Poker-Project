// Run with: npx jest model/FriendDao.test.js
// Needs TESTDB_URI in .env (a TEST database: deleteAll() wipes the friendships collection).
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./DbConnection");
const FriendDao = require("./FriendDao");

const hasTestDb = Boolean(process.env.TESTDB_URI || process.env.CI);
const dbTest = hasTestDb ? test : test.skip;

// Jest needs at least one non-skipped test per file
test("test database configuration", () => {
  if (!hasTestDb) console.warn("TESTDB_URI is not set: FriendDao tests were skipped.");
  expect(true).toBe(true);
});

beforeAll(async () => {
  if (!hasTestDb) return;
  db.connect("test");
  await mongoose.connection.asPromise();
}, 30000);

beforeEach(async () => {
  if (hasTestDb) await FriendDao.deleteAll();
});

afterAll(async () => {
  if (!hasTestDb) return;
  await FriendDao.deleteAll();
  await db.disconnect();
});

dbTest("create stores a pending request", async () => {
  const created = await FriendDao.create("alice", "bob");

  expect(created._id).toBeDefined();
  expect(created.requester).toBe("alice");
  expect(created.recipient).toBe("bob");
  expect(created.status).toBe("pending");
  expect(created.createdAt).toBeInstanceOf(Date);
});

dbTest("create trims usernames", async () => {
  const created = await FriendDao.create("  alice ", " bob  ");

  expect(created.requester).toBe("alice");
  expect(created.recipient).toBe("bob");
});

dbTest("findBetween finds the pair in either order", async () => {
  await FriendDao.create("alice", "bob");

  const forward = await FriendDao.findBetween("alice", "bob");
  const backward = await FriendDao.findBetween("bob", "alice");

  expect(forward).not.toBeNull();
  expect(String(backward._id)).toBe(String(forward._id));
});

dbTest("findBetween returns null for strangers", async () => {
  await FriendDao.create("alice", "bob");
  expect(await FriendDao.findBetween("alice", "carol")).toBeNull();
});

dbTest("accept marks the request as accepted", async () => {
  const created = await FriendDao.create("alice", "bob");
  await FriendDao.accept(created._id);

  const found = await FriendDao.findBetween("alice", "bob");
  expect(found.status).toBe("accepted");
});

dbTest("remove deletes only that friendship", async () => {
  const removed = await FriendDao.create("alice", "bob");
  await FriendDao.create("alice", "carol");
  await FriendDao.remove(removed._id);

  expect(await FriendDao.findBetween("alice", "bob")).toBeNull();
  expect(await FriendDao.findBetween("alice", "carol")).not.toBeNull();
});

dbTest("listFor returns every friendship the player is in, newest first", async () => {
  await FriendDao.create("alice", "bob");
  await FriendDao.create("carol", "alice");
  await FriendDao.create("bob", "carol"); // alice isn't part of this one

  const list = await FriendDao.listFor("alice");
  const others = list.map((f) => (f.requester === "alice" ? f.recipient : f.requester));

  expect(others).toEqual(["carol", "bob"]);
});

dbTest("listFor returns an empty list for a player with no friends", async () => {
  expect(await FriendDao.listFor("nobody")).toEqual([]);
});

dbTest("rejects a status that isn't pending or accepted", async () => {
  const Friendship = mongoose.models.Friendship;
  await expect(Friendship.create({ requester: "a", recipient: "b", status: "blocked" })).rejects.toThrow();
});
