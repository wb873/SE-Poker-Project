// Run with: npx jest controller/LeaderboardController.test.js
// The DAO is mocked, so no database is needed.
jest.mock("../model/HandResultDao", () => ({
  record: jest.fn(),
  leaderboard: jest.fn(),
}));

const HandResultDao = require("../model/HandResultDao");
const LeaderboardController = require("./LeaderboardController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// The server-side game object, as the game routes pass it in
function finishedGame(overrides = {}) {
  return { phase: "done", owner: "alice", handStartBalance: 1000, balance: 1030, result: "win", ...overrides };
}

beforeEach(() => {
  jest.resetAllMocks();
  HandResultDao.record.mockResolvedValue({});
  HandResultDao.leaderboard.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("recordHand (LB1)", () => {
  test("records a finished hand with its net result", async () => {
    await LeaderboardController.recordHand(finishedGame());
    expect(HandResultDao.record).toHaveBeenCalledWith("alice", 30, "win");
  });

  test("records losses as a negative net", async () => {
    await LeaderboardController.recordHand(finishedGame({ balance: 970, result: "loss" }));
    expect(HandResultDao.record).toHaveBeenCalledWith("alice", -30, "loss");
  });

  test("records a push as zero", async () => {
    await LeaderboardController.recordHand(finishedGame({ balance: 1000, result: "push" }));
    expect(HandResultDao.record).toHaveBeenCalledWith("alice", 0, "push");
  });

  test("skips a hand that is still being played", async () => {
    await LeaderboardController.recordHand(finishedGame({ phase: "decision" }));
    expect(HandResultDao.record).not.toHaveBeenCalled();
  });

  test("skips guest games (no owner)", async () => {
    await LeaderboardController.recordHand(finishedGame({ owner: undefined }));
    expect(HandResultDao.record).not.toHaveBeenCalled();
  });

  test("works with a real game: folding records minus the ante", async () => {
    const { createGame, getGame, applyAction } = require("../game");
    const game = getGame(createGame(10).gameId);
    game.owner = "alice";

    applyAction(game, "fold");
    await LeaderboardController.recordHand(game);

    expect(HandResultDao.record).toHaveBeenCalledWith("alice", -10, "fold");
  });

  test("never throws when the database fails", async () => {
    HandResultDao.record.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(LeaderboardController.recordHand(finishedGame())).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("monthly (LB1)", () => {
  test("returns this month's leaderboard", async () => {
    const players = [{ username: "alice", net: 120, hands: 4 }];
    HandResultDao.leaderboard.mockResolvedValue(players);
    const res = mockRes();
    await LeaderboardController.monthly({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.players).toEqual(players);
  });

  test("counts from midnight on the 1st of the current month", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 25, 15, 30) }); // Oct 25, 3:30pm
    const res = mockRes();
    await LeaderboardController.monthly({}, res);

    const since = HandResultDao.leaderboard.mock.calls[0][0];
    expect(since).toEqual(new Date(2026, 9, 1));
    expect(res.body.since).toEqual(new Date(2026, 9, 1));
  });

  test("starts over when a new month begins", async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 1, 0, 5) }); // Nov 1, 12:05am
    await LeaderboardController.monthly({}, mockRes());

    expect(HandResultDao.leaderboard.mock.calls[0][0]).toEqual(new Date(2026, 10, 1));
  });

  test("returns 500 when the database fails", async () => {
    HandResultDao.leaderboard.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await LeaderboardController.monthly({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
