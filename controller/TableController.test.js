jest.mock("../model/LobbyDao", () => ({
  findById: jest.fn(),
  removePlayer: jest.fn(),
  deleteById: jest.fn(),
  findAll: jest.fn(),
}));

jest.mock("../model/UserDao", () => ({ applyHandResult: jest.fn() }));
jest.mock("../util/AuthSession", () => ({ userFromToken: jest.fn() }));

const LobbyDao = require("../model/LobbyDao");
const UserDao = require("../model/UserDao");
const AuthSession = require("../util/AuthSession");
const tableGame = require("../tableGame");
const TableController = require("./TableController");

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

  test("keeps a player who is still connected", async () => {
    LobbyDao.findAll.mockResolvedValue([lobby("S3", ["a"])]);
    const io = fakeIo();
    io.sockets.sockets.set("sock1", { data: { tableLobby: "S3", tableUser: "a" } });
    TableController.startSweeper(io);

    await jest.advanceTimersByTimeAsync(120 * 1000);

    expect(LobbyDao.removePlayer).not.toHaveBeenCalled();
  });
});

describe("account balances at the table", () => {
  const account = { _id: "u1", username: "a", balance: 5000 };

  async function joinWithToken(id, players = ["a"]) {
    LobbyDao.findById.mockResolvedValue(lobby(id, players));
    AuthSession.userFromToken.mockResolvedValue(account);
    const io = fakeIo();
    const socket = fakeSocket();
    io.connect(socket);
    TableController.registerTableHandlers(io, socket);
    await socket.handlers["table:join"]({ lobbyId: id, username: "a", token: "good" });
    return { io, socket };
  }

  test("a logged-in player sits down with their account balance", async () => {
    await joinWithToken("B1");
    expect(AuthSession.userFromToken).toHaveBeenCalledWith("good");
    expect(tableGame.getTable("B1").seats.get("a")).toMatchObject({ userId: "u1", balance: 5000 });
  });

  test("a guest without a token gets the guest balance", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("B2"));
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);
    await socket.handlers["table:join"]({ lobbyId: "B2", username: "a" });
    expect(AuthSession.userFromToken).not.toHaveBeenCalled();
    expect(tableGame.getTable("B2").seats.get("a")).toMatchObject({ userId: null, balance: 1000 });
  });

  test("an expired token is refused instead of seating a guest", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("B3"));
    AuthSession.userFromToken.mockResolvedValue(null);
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);
    await socket.handlers["table:join"]({ lobbyId: "B3", username: "a", token: "old" });
    expect(socket.emit).toHaveBeenCalledWith("table:error", "Please log in again.");
    expect(tableGame.getTable("B3")).toBeUndefined();
  });

  test("a token can't be used to sit in someone else's seat", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("B4", ["a", "b"]));
    AuthSession.userFromToken.mockResolvedValue(account); // the token belongs to "a"
    const socket = fakeSocket();
    TableController.registerTableHandlers(fakeIo(), socket);
    await socket.handlers["table:join"]({ lobbyId: "B4", username: "b", token: "good" });
    expect(socket.emit).toHaveBeenCalledWith("table:error", "That seat belongs to a different account.");
    expect(tableGame.getTable("B4")).toBeUndefined();
  });

  test("finishing a hand saves the result to the account", async () => {
    const { socket } = await joinWithToken("B5");
    socket.handlers["table:deal"]();
    socket.handlers["table:action"]({ action: "fold" });
    expect(UserDao.applyHandResult).toHaveBeenCalledTimes(1);
    expect(UserDao.applyHandResult).toHaveBeenCalledWith("u1", -10);
    tableGame.deleteTable("B5"); // stops the turn timer
  });

  test("a guest's hand is never saved", async () => {
    LobbyDao.findById.mockResolvedValue(lobby("B6"));
    const io = fakeIo();
    const socket = fakeSocket();
    io.connect(socket);
    TableController.registerTableHandlers(io, socket);
    await socket.handlers["table:join"]({ lobbyId: "B6", username: "a" });
    socket.handlers["table:deal"]();
    socket.handlers["table:action"]({ action: "fold" });
    expect(UserDao.applyHandResult).not.toHaveBeenCalled();
    tableGame.deleteTable("B6");
  });

  test("the last player leaving mid-hand still has the loss saved", async () => {
    const { socket } = await joinWithToken("B7");
    socket.handlers["table:deal"]();
    LobbyDao.removePlayer.mockResolvedValue({ players: [] });

    await socket.handlers["table:leave"]();

    expect(UserDao.applyHandResult).toHaveBeenCalledWith("u1", -10);
    expect(tableGame.getTable("B7")).toBeUndefined();
  });

  test("a failed save is logged and doesn't break the table", async () => {
    const { socket } = await joinWithToken("B8");
    UserDao.applyHandResult.mockRejectedValue(new Error("db down"));
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    socket.handlers["table:deal"]();
    socket.handlers["table:action"]({ action: "fold" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toHaveBeenCalledWith("Could not save hand result:", "db down");
    expect(tableGame.getTable("B8").phase).toBe("done");
    log.mockRestore();
    tableGame.deleteTable("B8");
  });
});
