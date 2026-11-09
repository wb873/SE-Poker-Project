jest.mock("../model/LobbyDao", () => ({
  findById: jest.fn(),
  removePlayer: jest.fn(),
  deleteById: jest.fn(),
  findAll: jest.fn(),
}));
jest.mock('../util/AuthSession', () => ({ authenticate: jest.fn() }));
jest.mock('./LeaderboardController', () => ({ recordHand: jest.fn() }));

const LobbyDao = require("../model/LobbyDao");
const tableGame = require("../tableGame");
const TableController = require("./TableController");
const sessions = require('../util/AuthSession');
const leaderboard = require('./LeaderboardController');

function fakeIo() {
  const emit = jest.fn();
  const rooms = new Map();
  const sockets = new Map();
  return {
    emit,
    to: jest.fn(() => ({ emit })),
    sockets: { adapter: { rooms }, sockets },
    // Test helper: connect a fake socket the way socket.io would
    connect(socket, id = `sock${sockets.size + 1}`) {
      sockets.set(id, socket);
      const originalJoin = socket.join;
      socket.join = (room) => {
        originalJoin(room);
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(id);
      };
    },
  };
}

function fakeSocket() {
  const handlers = {};
  return {
    data: {},
    handlers,
    on: (event, fn) => { handlers[event] = fn; },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  };
}

const lobby = (id, players = ["a"]) => ({ _id: id, ante: 10, turnTimer: 30, players });

beforeEach(() => {
  jest.resetAllMocks();
  leaderboard.recordHand.mockResolvedValue();
});
afterEach(() => { for (const id of tableGame.tableIds()) tableGame.deleteTable(id); });

describe('authenticated leaderboard settlement', () => {
  const user = { _id: '507f1f77bcf86cd799439011', username: 'a' };
  async function join(id, token) {
    LobbyDao.findById.mockResolvedValue(lobby(id));
    sessions.authenticate.mockResolvedValue(user);
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);
    await socket.handlers['table:join']({ lobbyId: id, username: 'a', token });
    return socket;
  }
  test('a logged-in table fold records net chips against the verified account', async () => {
    const socket = await join('LB1', 'valid-token');
    socket.handlers['table:deal']();
    socket.handlers['table:action']({ action: 'fold' });
    expect(sessions.authenticate).toHaveBeenCalledWith('valid-token');
    expect(leaderboard.recordHand).toHaveBeenCalledTimes(1);
    expect(leaderboard.recordHand).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user._id, phase: 'done', balance: 990, handStartBalance: 1000, result: 'fold', handId: expect.any(String),
    }));
  });
  test('a guest using a registered-looking name never records an account result', async () => {
    const socket = await join('LB2');
    socket.handlers['table:deal']();
    socket.handlers['table:action']({ action: 'fold' });
    expect(leaderboard.recordHand).not.toHaveBeenCalled();
  });
  test('timer folds record registered players', async () => {
    jest.useFakeTimers();
    try {
      const socket = await join('LB3', 'valid-token');
      socket.handlers['table:deal']();
      await jest.advanceTimersByTimeAsync(30000);
      expect(leaderboard.recordHand).toHaveBeenCalledWith(expect.objectContaining({ result: 'fold', balance: 990 }));
    } finally { jest.useRealTimers(); }
  });
  test('leaving mid-hand records the fold before the seat disappears', async () => {
    const socket = await join('LB4', 'valid-token');
    LobbyDao.removePlayer.mockResolvedValue({ players: [] });
    socket.handlers['table:deal']();
    await socket.handlers['table:leave']();
    expect(leaderboard.recordHand).toHaveBeenCalledTimes(1);
    expect(leaderboard.recordHand).toHaveBeenCalledWith(expect.objectContaining({ ownerId: user._id, result: 'fold' }));
  });
  test('an invalid session is rejected before joining a table', async () => {
    LobbyDao.findById.mockResolvedValue(lobby('LB5'));
    sessions.authenticate.mockRejectedValue(Object.assign(new Error('Please log in again.'), { status: 401 }));
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);
    await socket.handlers['table:join']({ lobbyId: 'LB5', username: 'a', token: 'forged' });
    expect(socket.emit).toHaveBeenCalledWith('table:error', 'Please log in again.');
    expect(tableGame.getTable('LB5')).toBeUndefined();
  });
  test('anonymous joins cannot take over a registered seat', async () => {
    await join('LB6', 'valid-token');
    const socket = await join('LB6');
    expect(socket.emit).toHaveBeenCalledWith('table:error', expect.stringContaining('Sign in'));
  });
});

describe("table:join", () => {
  test("seats a lobby member", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("T1"));
    const io = fakeIo();
    const socket = fakeSocket();
    io.connect(socket);
    TableController.registerTableHandlers(io, socket);

    await socket.handlers["table:join"]({ lobbyId: "T1", username: "a" });

    expect(tableGame.getTable("T1").seats.has("a")).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith("table:state", expect.any(Object));
  });

  test("rejects someone who is not in the lobby", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("T2"));
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);

    await socket.handlers["table:join"]({ lobbyId: "T2", username: "intruder" });

    expect(socket.emit).toHaveBeenCalledWith("table:error", "Join this lobby before sitting at its table.");
    expect(tableGame.getTable("T2")).toBeUndefined();
  });

  test("a missing lobby sends an error", async () => {
    LobbyDao.findById.mockResolvedValue(null);
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);

    await socket.handlers["table:join"]({ lobbyId: "nope", username: "a" });

    expect(socket.emit).toHaveBeenCalledWith("table:error", "Lobby not found.");
  });
});

describe("table:leave", () => {
  async function seatedSocket(id, players) {
    LobbyDao.findById.mockResolvedValue(lobby(id, players));
    const io = fakeIo();
    const socket = fakeSocket();
    TableController.registerTableHandlers(io, socket);
    await socket.handlers["table:join"]({ lobbyId: id, username: "a" });
    return { io, socket };
  }

  test("the last player leaving deletes the lobby and its table", async () => {
    const { io, socket } = await seatedSocket("T3", ["a"]);
    LobbyDao.removePlayer.mockResolvedValue({ players: [] });

    await socket.handlers["table:leave"]();

    expect(LobbyDao.removePlayer).toHaveBeenCalledWith("T3", "a");
    expect(LobbyDao.deleteById).toHaveBeenCalledWith("T3");
    expect(tableGame.getTable("T3")).toBeUndefined();
    expect(io.to).toHaveBeenCalledWith("table:T3");
  });

  test("the lobby survives while other players remain", async () => {
    const { socket } = await seatedSocket("T4", ["a", "b"]);
    LobbyDao.removePlayer.mockResolvedValue({ players: ["b"] });

    await socket.handlers["table:leave"]();

    expect(LobbyDao.deleteById).not.toHaveBeenCalled();
    expect(tableGame.getTable("T4")).toBeDefined();
  });
});

describe("sweeper", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("removes a player who stays offline past the grace period, then deletes the empty lobby", async () => {
    LobbyDao.findAll.mockResolvedValue([lobby("S1", ["ghost"])]);
    LobbyDao.removePlayer.mockResolvedValue({ players: [] });
    tableGame.sitDown(tableGame.getOrCreateTable(lobby("S1", ["ghost"])), "ghost");
    TableController.startSweeper(fakeIo());

    await jest.advanceTimersByTimeAsync(20 * 1000); // clock starts, still inside the grace period
    expect(LobbyDao.removePlayer).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(40 * 1000);
    expect(LobbyDao.removePlayer).toHaveBeenCalledWith("S1", "ghost");
    expect(LobbyDao.deleteById).toHaveBeenCalledWith("S1");
  });

  test("deletes a lobby that already has no players", async () => {
    LobbyDao.findAll.mockResolvedValue([lobby("S2", [])]);
    TableController.startSweeper(fakeIo());

    await jest.advanceTimersByTimeAsync(10 * 1000);

    expect(LobbyDao.deleteById).toHaveBeenCalledWith("S2");
  });

  test("leaves alone a lobby whose table runs on another server", async () => {
    LobbyDao.findAll.mockResolvedValue([lobby("S4", ["elsewhere"])]);
    TableController.startSweeper(fakeIo());

    await jest.advanceTimersByTimeAsync(120 * 1000);

    expect(LobbyDao.removePlayer).not.toHaveBeenCalled();
    expect(LobbyDao.deleteById).not.toHaveBeenCalled();
  });

  test("keeps a player who is still connected", async () => {
    LobbyDao.findAll.mockResolvedValue([lobby("S3", ["a"])]);
    const io = fakeIo();
    io.sockets.sockets.set("sock1", { data: { tableLobby: "S3", tableUser: "a" } });
    TableController.startSweeper(io);

    await jest.advanceTimersByTimeAsync(120 * 1000);

    expect(LobbyDao.removePlayer).not.toHaveBeenCalled();
  });
});
