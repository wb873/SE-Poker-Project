// Run with: npx jest controller/FriendController.test.js
// The DAOs are mocked, so no database is needed.
jest.mock("../model/FriendDao", () => ({
  findBetween: jest.fn(),
  listFor: jest.fn(),
  create: jest.fn(),
  accept: jest.fn(),
  remove: jest.fn(),
}));
jest.mock("../model/UserDao", () => ({
  findByIdentifier: jest.fn(),
}));

const FriendDao = require("../model/FriendDao");
const UserDao = require("../model/UserDao");
const FriendController = require("./FriendController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// requireUser has already run, so req.user is the logged-in player
function mockReq({ body, params } = {}) {
  return { user: { username: "alice" }, body, params };
}

function friendship(overrides = {}) {
  return { _id: "f1", requester: "alice", recipient: "bob", status: "pending", ...overrides };
}

beforeEach(() => {
  jest.resetAllMocks();
  // Every player looked up exists, with exactly the username asked for
  UserDao.findByIdentifier.mockImplementation(async (name) => ({ username: name }));
  FriendDao.findBetween.mockResolvedValue(null);
  FriendDao.listFor.mockResolvedValue([]);
});

describe("listFriends (F3)", () => {
  test("splits friendships into friends, incoming and outgoing", async () => {
    FriendDao.listFor.mockResolvedValue([
      friendship({ requester: "bob", recipient: "alice", status: "accepted" }),
      friendship({ requester: "alice", recipient: "carol", status: "accepted" }),
      friendship({ requester: "dave", recipient: "alice" }),
      friendship({ requester: "alice", recipient: "erin" }),
    ]);
    const res = mockRes();
    await FriendController.listFriends(mockReq(), res);

    expect(FriendDao.listFor).toHaveBeenCalledWith("alice");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      friends: ["bob", "carol"],
      incoming: ["dave"],
      outgoing: ["erin"],
    });
  });

  test("returns empty lists for a player with no friends", async () => {
    const res = mockRes();
    await FriendController.listFriends(mockReq(), res);

    expect(res.body).toEqual({ success: true, friends: [], incoming: [], outgoing: [] });
  });

  test("returns 500 when the database fails", async () => {
    FriendDao.listFor.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await FriendController.listFriends(mockReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("sendRequest (F1)", () => {
  test("creates a request and returns 201", async () => {
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob" } }), res);

    expect(res.statusCode).toBe(201);
    expect(FriendDao.create).toHaveBeenCalledWith("alice", "bob");
  });

  test("trims the username before using it", async () => {
    await FriendController.sendRequest(mockReq({ body: { username: "  bob  " } }), mockRes());
    expect(FriendDao.create).toHaveBeenCalledWith("alice", "bob");
  });

  test.each([
    ["missing body", undefined],
    ["missing username", {}],
    ["empty username", { username: "   " }],
    ["non-string username", { username: 42 }],
    ["username over 20 characters", { username: "x".repeat(21) }],
  ])("rejects %s with 400", async (label, body) => {
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body }), res);

    expect(res.statusCode).toBe(400);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("rejects adding yourself with 400", async () => {
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "alice" } }), res);

    expect(res.statusCode).toBe(400);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("returns 404 for a player that doesn't exist", async () => {
    UserDao.findByIdentifier.mockResolvedValue(null);
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "nobody" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("returns 404 when the name only matches someone's email", async () => {
    // findByIdentifier also matches emails, so the controller must check the username itself
    UserDao.findByIdentifier.mockResolvedValue({ username: "bob" });
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob@x.io" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("returns 409 when already friends", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ status: "accepted" }));
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob" } }), res);

    expect(res.statusCode).toBe(409);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("returns 409 when the request was already sent", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship());
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob" } }), res);

    expect(res.statusCode).toBe(409);
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("accepts instead when the other player already sent a request", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ requester: "bob", recipient: "alice" }));
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob" } }), res);

    expect(res.statusCode).toBe(200);
    expect(FriendDao.accept).toHaveBeenCalledWith("f1");
    expect(FriendDao.create).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    FriendDao.findBetween.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await FriendController.sendRequest(mockReq({ body: { username: "bob" } }), res);

    expect(res.statusCode).toBe(500);
  });
});

describe("acceptRequest (F1)", () => {
  test("the recipient can accept a pending request", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ requester: "bob", recipient: "alice" }));
    const res = mockRes();
    await FriendController.acceptRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(200);
    expect(FriendDao.accept).toHaveBeenCalledWith("f1");
  });

  test("the sender can't accept their own request", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship());
    const res = mockRes();
    await FriendController.acceptRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.accept).not.toHaveBeenCalled();
  });

  test("returns 404 when there is no request", async () => {
    const res = mockRes();
    await FriendController.acceptRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 404 when already friends", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ requester: "bob", recipient: "alice", status: "accepted" }));
    const res = mockRes();
    await FriendController.acceptRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.accept).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    FriendDao.findBetween.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await FriendController.acceptRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(500);
  });
});

describe("removeRequest (F1)", () => {
  test("declines a request someone sent you", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ requester: "bob", recipient: "alice" }));
    const res = mockRes();
    await FriendController.removeRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(200);
    expect(FriendDao.remove).toHaveBeenCalledWith("f1");
  });

  test("cancels a request you sent", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship());
    const res = mockRes();
    await FriendController.removeRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(200);
    expect(FriendDao.remove).toHaveBeenCalledWith("f1");
  });

  test("won't remove an accepted friendship", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ status: "accepted" }));
    const res = mockRes();
    await FriendController.removeRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.remove).not.toHaveBeenCalled();
  });

  test("returns 404 when there is no request", async () => {
    const res = mockRes();
    await FriendController.removeRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 500 when the database fails", async () => {
    FriendDao.findBetween.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await FriendController.removeRequest(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(500);
  });
});

describe("removeFriend (F2)", () => {
  test("removes an accepted friend", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship({ status: "accepted" }));
    const res = mockRes();
    await FriendController.removeFriend(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(200);
    expect(FriendDao.remove).toHaveBeenCalledWith("f1");
  });

  test("won't remove a pending request", async () => {
    FriendDao.findBetween.mockResolvedValue(friendship());
    const res = mockRes();
    await FriendController.removeFriend(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
    expect(FriendDao.remove).not.toHaveBeenCalled();
  });

  test("returns 404 when not friends", async () => {
    const res = mockRes();
    await FriendController.removeFriend(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 500 when the database fails", async () => {
    FriendDao.findBetween.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await FriendController.removeFriend(mockReq({ params: { username: "bob" } }), res);

    expect(res.statusCode).toBe(500);
  });
});
