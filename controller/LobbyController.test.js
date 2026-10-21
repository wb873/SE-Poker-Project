// Run with: npx jest controller/LobbyController.test.js
// The DAO is mocked, so no database is needed.
jest.mock("../model/LobbyDao", () => ({
  create: jest.fn(),
  findPublic: jest.fn(),
  findById: jest.fn(),
}));

const LobbyDao = require("../model/LobbyDao");
const LobbyController = require("./LobbyController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function validBody(overrides = {}) {
  return {
    name: "Friday Night",
    host: "aidan",
    visibility: "public",
    password: "",
    maxPlayers: 7,
    ante: 10,
    turnTimer: 30,
    sideBets: true,
    botsEnabled: false,
    botAmount: 1,
    botDifficulty: "medium",
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  LobbyDao.create.mockImplementation(async (data) => ({
    _id: "507f1f77bcf86cd799439011",
    status: "waiting",
    ...data,
  }));
  LobbyDao.findPublic.mockResolvedValue([]);
  LobbyDao.findById.mockResolvedValue(null);
});

describe("createLobby", () => {
  test("valid public lobby returns 201 and a public lobby", async () => {
    const res = mockRes();
    await LobbyController.createLobby({ body: validBody() }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.lobby.id).toBe("507f1f77bcf86cd799439011");
    expect(res.body.lobby.name).toBe("Friday Night");
    expect(res.body.lobby.isPrivate).toBe(false);
    expect(res.body.lobby.playerCount).toBe(1);
  });

  test("trims name and host before saving", async () => {
    const res = mockRes();
    await LobbyController.createLobby(
      { body: validBody({ name: "  Spaced  ", host: "  aidan " }) },
      res
    );
    const saved = LobbyDao.create.mock.calls[0][0];
    expect(saved.name).toBe("Spaced");
    expect(saved.host).toBe("aidan");
    expect(saved.players).toEqual(["aidan"]);
  });

  test("private lobby stores a hash, never the plain password", async () => {
    const res = mockRes();
    await LobbyController.createLobby(
      { body: validBody({ visibility: "private", password: "secret" }) },
      res
    );
    const saved = LobbyDao.create.mock.calls[0][0];
    expect(res.statusCode).toBe(201);
    expect(saved.isPrivate).toBe(true);
    expect(saved.passwordHash).not.toBe("secret");
    expect(saved.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(res.body.lobby).not.toHaveProperty("passwordHash");
    expect(res.body.lobby).not.toHaveProperty("password");
  });

  test("public lobby has no password hash", async () => {
    await LobbyController.createLobby({ body: validBody() }, mockRes());
    expect(LobbyDao.create.mock.calls[0][0].passwordHash).toBeNull();
  });

  test("bots enabled are saved with amount and difficulty", async () => {
    await LobbyController.createLobby(
      { body: validBody({ botsEnabled: true, botAmount: 2, botDifficulty: "hard" }) },
      mockRes()
    );
    expect(LobbyDao.create.mock.calls[0][0].bots).toEqual({
      enabled: true,
      amount: 2,
      difficulty: "hard",
    });
  });

  test("bots disabled are saved as disabled", async () => {
    await LobbyController.createLobby({ body: validBody() }, mockRes());
    expect(LobbyDao.create.mock.calls[0][0].bots).toEqual({
      enabled: false,
      amount: 0,
      difficulty: "medium",
    });
  });

  test("sideBets defaults to true unless explicitly false", async () => {
    const body = validBody();
    delete body.sideBets;
    await LobbyController.createLobby({ body }, mockRes());
    expect(LobbyDao.create.mock.calls[0][0].sideBets).toBe(true);

    await LobbyController.createLobby({ body: validBody({ sideBets: false }) }, mockRes());
    expect(LobbyDao.create.mock.calls[1][0].sideBets).toBe(false);
  });

  test.each([
    ["missing name", { name: undefined }, /name/i],
    ["empty name", { name: "   " }, /name/i],
    ["name over 30 chars", { name: "x".repeat(31) }, /name/i],
    ["missing host", { host: undefined }, /host/i],
    ["blank host", { host: "  " }, /host/i],
    ["bad visibility", { visibility: "secret" }, /visibility/i],
    ["private without password", { visibility: "private", password: "" }, /password/i],
    ["maxPlayers below 2", { maxPlayers: 1 }, /max players/i],
    ["maxPlayers above 7", { maxPlayers: 8 }, /max players/i],
    ["maxPlayers not an integer", { maxPlayers: 4.5 }, /max players/i],
    ["maxPlayers as string", { maxPlayers: "4" }, /max players/i],
    ["ante zero", { ante: 0 }, /ante/i],
    ["ante negative", { ante: -5 }, /ante/i],
    ["ante not an integer", { ante: 2.5 }, /ante/i],
    ["turn timer not allowed", { turnTimer: 20 }, /turn timer/i],
    ["bot amount zero", { botsEnabled: true, botAmount: 0 }, /bot amount/i],
    ["bots fill every seat", { botsEnabled: true, maxPlayers: 4, botAmount: 4 }, /bot amount/i],
    ["bad bot difficulty", { botsEnabled: true, botAmount: 1, botDifficulty: "insane" }, /difficulty/i],
  ])("rejects %s with 400", async (_label, overrides, pattern) => {
    const res = mockRes();
    await LobbyController.createLobby({ body: validBody(overrides) }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(pattern);
    expect(LobbyDao.create).not.toHaveBeenCalled();
  });

  test("missing body returns 400", async () => {
    const res = mockRes();
    await LobbyController.createLobby({}, res);
    expect(res.statusCode).toBe(400);
  });

  test("DAO failure returns 500", async () => {
    LobbyDao.create.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await LobbyController.createLobby({ body: validBody() }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Could not create lobby." });
  });
});

describe("listLobbies", () => {
  test("returns public lobbies without password hashes", async () => {
    LobbyDao.findPublic.mockResolvedValue([
      {
        _id: "a1", name: "One", host: "h", isPrivate: false, passwordHash: "leak",
        maxPlayers: 4, ante: 5, turnTimer: 30, sideBets: true,
        bots: { enabled: false, amount: 0, difficulty: "medium" },
        players: ["h", "p2"], status: "waiting",
      },
    ]);
    const res = mockRes();
    await LobbyController.listLobbies({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.lobbies).toHaveLength(1);
    expect(res.body.lobbies[0].id).toBe("a1");
    expect(res.body.lobbies[0].playerCount).toBe(2);
    expect(res.body.lobbies[0]).not.toHaveProperty("passwordHash");
  });

  test("empty list returns an empty array", async () => {
    const res = mockRes();
    await LobbyController.listLobbies({}, res);
    expect(res.body).toEqual({ success: true, lobbies: [] });
  });

  test("DAO failure returns 500", async () => {
    LobbyDao.findPublic.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await LobbyController.listLobbies({}, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Could not load lobbies.");
  });
});

describe("getLobby", () => {
  test("returns the lobby when found", async () => {
    LobbyDao.findById.mockImplementation(async (id) => ({
      _id: id, name: "Found", host: "h", isPrivate: true, passwordHash: "leak",
      maxPlayers: 3, ante: 1, turnTimer: 15, sideBets: false,
      bots: { enabled: true, amount: 1, difficulty: "easy" },
      players: ["h"], status: "waiting",
    }));
    const res = mockRes();
    await LobbyController.getLobby({ params: { id: "abc" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.lobby.id).toBe("abc");
    expect(res.body.lobby.isPrivate).toBe(true);
    expect(res.body.lobby).not.toHaveProperty("passwordHash");
  });

  test("unknown id returns 404", async () => {
    const res = mockRes();
    await LobbyController.getLobby({ params: { id: "nope" } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Lobby not found.");
  });

  test("DAO failure returns 500", async () => {
    LobbyDao.findById.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await LobbyController.getLobby({ params: { id: "x" } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Could not load lobby.");
  });
});