// Run with: npx jest model/LobbyDao.test.js
// Needs TESTDB_URI in .env (a TEST database: deleteAll() wipes the lobbies collection).
require("dotenv").config();
const mongoose = require("mongoose");
const db = require("./DbConnection");
const LobbyDao = require("./LobbyDao");

const hasTestDb = Boolean(process.env.TESTDB_URI || process.env.CI);
const dbTest = hasTestDb ? test : test.skip;

// Jest needs at least one non-skipped test per file
test("test database configuration", () => {
  if (!hasTestDb) console.warn("TESTDB_URI is not set: LobbyDao tests were skipped.");
  expect(true).toBe(true);
});

function lobbyData(overrides = {}) {
  return {
    name: "Test Lobby",
    host: "host1",
    isPrivate: false,
    passwordHash: null,
    maxPlayers: 4,
    ante: 10,
    turnTimer: 30,
    sideBets: true,
    bots: { enabled: false, amount: 0, difficulty: "medium" },
    players: ["host1"],
    ...overrides,
  };
}

beforeAll(async () => {
  if (!hasTestDb) return;
  db.connect("test");
  await mongoose.connection.asPromise();
}, 30000);

beforeEach(async () => {
  if (hasTestDb) await LobbyDao.deleteAll();
});

afterAll(async () => {
  if (!hasTestDb) return;
  await LobbyDao.deleteAll();
  await db.disconnect();
});

describe("create", () => {
  dbTest("saves a lobby and applies defaults", async () => {
    const lobby = await LobbyDao.create({ name: "Defaults", host: "h" });
    expect(lobby._id).toBeDefined();
    expect(lobby.isPrivate).toBe(false);
    expect(lobby.passwordHash).toBeNull();
    expect(lobby.maxPlayers).toBe(7);
    expect(lobby.ante).toBe(10);
    expect(lobby.turnTimer).toBe(30);
    expect(lobby.sideBets).toBe(true);
    expect(lobby.players).toEqual([]);
    expect(lobby.status).toBe("waiting");
    expect(lobby.bots.enabled).toBe(false);
    expect(lobby.createdAt).toBeDefined();
  });

  dbTest("trims name and host", async () => {
    const lobby = await LobbyDao.create(lobbyData({ name: "  Padded  ", host: "  me  " }));
    expect(lobby.name).toBe("Padded");
    expect(lobby.host).toBe("me");
  });

  dbTest("stores bot settings", async () => {
    const lobby = await LobbyDao.create(
      lobbyData({ bots: { enabled: true, amount: 2, difficulty: "hard" } })
    );
    expect(lobby.bots.enabled).toBe(true);
    expect(lobby.bots.amount).toBe(2);
    expect(lobby.bots.difficulty).toBe("hard");
  });

  dbTest("rejects a missing name", async () => {
    await expect(LobbyDao.create({ host: "h" })).rejects.toThrow(/name/i);
  });

  dbTest("rejects a missing host", async () => {
    await expect(LobbyDao.create({ name: "No host" })).rejects.toThrow(/host/i);
  });

  dbTest("rejects a name over 30 characters", async () => {
    await expect(LobbyDao.create(lobbyData({ name: "x".repeat(31) }))).rejects.toThrow();
  });

  dbTest("rejects maxPlayers outside 2-7", async () => {
    await expect(LobbyDao.create(lobbyData({ maxPlayers: 1 }))).rejects.toThrow();
    await expect(LobbyDao.create(lobbyData({ maxPlayers: 8 }))).rejects.toThrow();
  });

  dbTest("rejects ante below 1", async () => {
    await expect(LobbyDao.create(lobbyData({ ante: 0 }))).rejects.toThrow();
  });

  dbTest("rejects an invalid bot difficulty", async () => {
    await expect(
      LobbyDao.create(lobbyData({ bots: { enabled: true, amount: 1, difficulty: "insane" } }))
    ).rejects.toThrow();
  });

  dbTest("rejects an invalid status", async () => {
    await expect(LobbyDao.create(lobbyData({ status: "finished" }))).rejects.toThrow();
  });
});

describe("findPublic", () => {
  dbTest("returns only public lobbies that are waiting", async () => {
    await LobbyDao.create(lobbyData({ name: "Public waiting" }));
    await LobbyDao.create(lobbyData({ name: "Private", isPrivate: true, passwordHash: "s:h" }));
    await LobbyDao.create(lobbyData({ name: "Public started", status: "in_progress" }));

    const lobbies = await LobbyDao.findPublic();
    expect(lobbies).toHaveLength(1);
    expect(lobbies[0].name).toBe("Public waiting");
  });

  dbTest("newest lobby comes first", async () => {
    await LobbyDao.create(lobbyData({ name: "older" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await LobbyDao.create(lobbyData({ name: "newer" }));

    const lobbies = await LobbyDao.findPublic();
    expect(lobbies.map((l) => l.name)).toEqual(["newer", "older"]);
  });

  dbTest("returns an empty array when there are no lobbies", async () => {
    expect(await LobbyDao.findPublic()).toEqual([]);
  });
});

describe("findById", () => {
  dbTest("returns the matching lobby", async () => {
    const created = await LobbyDao.create(lobbyData({ name: "Find me" }));
    const found = await LobbyDao.findById(String(created._id));
    expect(found.name).toBe("Find me");
  });

  dbTest("unknown but valid id returns null", async () => {
    const missing = new mongoose.Types.ObjectId();
    expect(await LobbyDao.findById(String(missing))).toBeNull();
  });

  dbTest("malformed id returns null instead of throwing", async () => {
    expect(await LobbyDao.findById("not-an-object-id")).toBeNull();
  });
});

describe("deleteAll", () => {
  dbTest("removes every lobby", async () => {
    await LobbyDao.create(lobbyData({ name: "a" }));
    await LobbyDao.create(lobbyData({ name: "b" }));
    await LobbyDao.deleteAll();
    expect(await LobbyDao.findPublic()).toEqual([]);
  });
});