// Run with: npx jest model/UserDao.test.js
// Needs TESTDB_URI in .env (a TEST database: deleteAll() wipes the users collection).
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./DbConnection");
const UserDao = require("./UserDao");

const hasTestDb = Boolean(process.env.TESTDB_URI || process.env.CI);
const dbTest = hasTestDb ? test : test.skip;

// Jest needs at least one non-skipped test per file
test("test database configuration", () => {
  if (!hasTestDb) console.warn("TESTDB_URI is not set: UserDao tests were skipped.");
  expect(true).toBe(true);
});

function userData(overrides = {}) {
  return {
    username: "willb",
    email: "will@example.com",
    passwordHash: "salt:hash",
    ...overrides,
  };
}

beforeAll(async () => {
  if (!hasTestDb) return;
  db.connect("test");
  await mongoose.connection.asPromise();
  await UserDao.model.syncIndexes(); // unique indexes must exist for the duplicate tests
}, 30000);

beforeEach(async () => {
  if (hasTestDb) await UserDao.deleteAll();
});

afterAll(async () => {
  if (!hasTestDb) return;
  await UserDao.deleteAll();
  await db.disconnect();
});

dbTest("create persists a user and applies defaults", async () => {
  const created = await UserDao.create(userData());

  expect(created._id).toBeDefined();
  expect(created.username).toBe("willb");
  expect(created.email).toBe("will@example.com");
  expect(created.avatar).toBe("default");
  expect(created.balance).toBe(10000);
  expect(created.isAdmin).toBe(false);
  expect(created.stats.handsPlayed).toBe(0);
  expect(created.createdAt).toBeInstanceOf(Date);
});

dbTest("create lowercases and trims the email", async () => {
  const created = await UserDao.create(userData({ email: "  Will@Example.COM  " }));
  expect(created.email).toBe("will@example.com");
});

dbTest("create rejects a user without an email", async () => {
  await expect(UserDao.create({ username: "willb", passwordHash: "salt:hash" })).rejects.toMatchObject({
    name: "ValidationError",
  });
});

dbTest("create rejects a user without a password hash", async () => {
  await expect(UserDao.create({ username: "willb", email: "will@example.com" })).rejects.toMatchObject({
    name: "ValidationError",
  });
});

dbTest("create rejects a username shorter than three characters", async () => {
  await expect(UserDao.create(userData({ username: "ab" }))).rejects.toMatchObject({
    name: "ValidationError",
  });
});

dbTest("create rejects a duplicate email", async () => {
  await UserDao.create(userData());
  await expect(UserDao.create(userData({ username: "someoneelse" }))).rejects.toMatchObject({ code: 11000 });
});

dbTest("create rejects a duplicate username", async () => {
  await UserDao.create(userData());
  await expect(UserDao.create(userData({ email: "other@example.com" }))).rejects.toMatchObject({ code: 11000 });
});

dbTest("findByIdentifier finds a user by username", async () => {
  await UserDao.create(userData());
  const found = await UserDao.findByIdentifier("willb");
  expect(found.email).toBe("will@example.com");
});

dbTest("findByIdentifier finds a user by email, ignoring case", async () => {
  await UserDao.create(userData());
  const found = await UserDao.findByIdentifier("WILL@EXAMPLE.COM");
  expect(found.username).toBe("willb");
});

dbTest("findByIdentifier finds a username ignoring case and keeps its original capitals", async () => {
  await UserDao.create(userData({ username: "WillB" }));
  const found = await UserDao.findByIdentifier("willb");
  expect(found.username).toBe("WillB");
});

dbTest("findByUsername ignores case", async () => {
  await UserDao.create(userData());
  expect((await UserDao.findByUsername("WILLB")).email).toBe("will@example.com");
  expect(await UserDao.findByUsername("nobody")).toBeNull();
});

dbTest("findByUsernameAndEmail ignores case and needs both to match", async () => {
  await UserDao.create(userData());
  expect((await UserDao.findByUsernameAndEmail("WillB", "WILL@example.com")).username).toBe("willb");
  expect(await UserDao.findByUsernameAndEmail("willb", "other@example.com")).toBeNull();
});

dbTest("updatePassword can mark a password temporary and clears the mark otherwise", async () => {
  const created = await UserDao.create(userData());
  expect((await UserDao.updatePassword(created._id, "a:b", true)).mustChangePassword).toBe(true);
  expect((await UserDao.updatePassword(created._id, "c:d")).mustChangePassword).toBe(false);
});

dbTest("findByIdentifier returns null for an unknown identifier", async () => {
  expect(await UserDao.findByIdentifier("nobody")).toBeNull();
});

dbTest("findByIdentifier returns null for empty or non-string input", async () => {
  expect(await UserDao.findByIdentifier("")).toBeNull();
  expect(await UserDao.findByIdentifier("   ")).toBeNull();
  expect(await UserDao.findByIdentifier(undefined)).toBeNull();
});

dbTest("findByEmail finds a user and returns null when absent", async () => {
  await UserDao.create(userData());
  expect((await UserDao.findByEmail("will@example.com")).username).toBe("willb");
  expect(await UserDao.findByEmail("nobody@example.com")).toBeNull();
});

dbTest("findById returns the user, and null for a malformed id", async () => {
  const created = await UserDao.create(userData());
  expect((await UserDao.findById(created._id)).username).toBe("willb");
  expect(await UserDao.findById("not-an-object-id")).toBeNull();
});

dbTest("updatePassword replaces the stored hash", async () => {
  const created = await UserDao.create(userData());

  const updated = await UserDao.updatePassword(created._id, "newsalt:newhash");

  expect(updated.passwordHash).toBe("newsalt:newhash");
  expect((await UserDao.findById(created._id)).passwordHash).toBe("newsalt:newhash");
});

dbTest("updatePassword returns null for a malformed id", async () => {
  expect(await UserDao.updatePassword("not-an-object-id", "a:b")).toBeNull();
});

dbTest("deleteAll removes every user", async () => {
  await UserDao.create(userData());
  await UserDao.deleteAll();
  expect(await UserDao.findByIdentifier("willb")).toBeNull();
});
