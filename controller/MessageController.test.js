// Run with: npx jest controller/MessageController.test.js
// The DAOs are mocked, so no database is needed.
jest.mock("../model/MessageDao", () => ({
  create: jest.fn(),
  conversation: jest.fn(),
}));
jest.mock("../model/FriendDao", () => ({
  findBetween: jest.fn(),
}));

const MessageDao = require("../model/MessageDao");
const FriendDao = require("../model/FriendDao");
const MessageController = require("./MessageController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// requireUser has already run, so req.user is the logged-in player
function mockReq({ body, username = "bob" } = {}) {
  return { user: { username: "alice" }, params: { username }, body };
}

beforeEach(() => {
  jest.resetAllMocks();
  // alice and bob are friends unless a test says otherwise
  FriendDao.findBetween.mockResolvedValue({ _id: "f1", requester: "alice", recipient: "bob", status: "accepted" });
  MessageDao.conversation.mockResolvedValue([]);
});

describe("getConversation (F4)", () => {
  test("returns the messages between two friends", async () => {
    const sentAt = new Date("2026-10-25T12:00:00Z");
    MessageDao.conversation.mockResolvedValue([
      { _id: "m1", from: "alice", to: "bob", text: "hi", createdAt: sentAt, updatedAt: sentAt, __v: 0 },
    ]);
    const res = mockRes();
    await MessageController.getConversation(mockReq(), res);

    expect(MessageDao.conversation).toHaveBeenCalledWith("alice", "bob");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, messages: [{ from: "alice", text: "hi", sentAt }] });
  });

  test("returns an empty list when nobody has written yet", async () => {
    const res = mockRes();
    await MessageController.getConversation(mockReq(), res);

    expect(res.body).toEqual({ success: true, messages: [] });
  });

  test("returns 403 for a player who isn't a friend", async () => {
    FriendDao.findBetween.mockResolvedValue(null);
    const res = mockRes();
    await MessageController.getConversation(mockReq({ username: "carol" }), res);

    expect(res.statusCode).toBe(403);
    expect(MessageDao.conversation).not.toHaveBeenCalled();
  });

  test("returns 403 while the friend request is still pending", async () => {
    FriendDao.findBetween.mockResolvedValue({ _id: "f1", requester: "alice", recipient: "bob", status: "pending" });
    const res = mockRes();
    await MessageController.getConversation(mockReq(), res);

    expect(res.statusCode).toBe(403);
    expect(MessageDao.conversation).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    MessageDao.conversation.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await MessageController.getConversation(mockReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("sendMessage (F4)", () => {
  test("saves the message and returns 201", async () => {
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body: { text: "hello" } }), res);

    expect(res.statusCode).toBe(201);
    expect(MessageDao.create).toHaveBeenCalledWith("alice", "bob", "hello");
  });

  test("trims the text before saving", async () => {
    await MessageController.sendMessage(mockReq({ body: { text: "  hello  " } }), mockRes());
    expect(MessageDao.create).toHaveBeenCalledWith("alice", "bob", "hello");
  });

  test("accepts exactly 500 characters", async () => {
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body: { text: "x".repeat(500) } }), res);

    expect(res.statusCode).toBe(201);
  });

  test.each([
    ["missing body", undefined],
    ["missing text", {}],
    ["empty text", { text: "   " }],
    ["non-string text", { text: 42 }],
    ["text over 500 characters", { text: "x".repeat(501) }],
  ])("rejects %s with 400", async (label, body) => {
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body }), res);

    expect(res.statusCode).toBe(400);
    expect(FriendDao.findBetween).not.toHaveBeenCalled();
    expect(MessageDao.create).not.toHaveBeenCalled();
  });

  test("returns 403 for a player who isn't a friend", async () => {
    FriendDao.findBetween.mockResolvedValue(null);
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body: { text: "hi" }, username: "carol" }), res);

    expect(res.statusCode).toBe(403);
    expect(MessageDao.create).not.toHaveBeenCalled();
  });

  test("returns 403 while the friend request is still pending", async () => {
    FriendDao.findBetween.mockResolvedValue({ _id: "f1", requester: "alice", recipient: "bob", status: "pending" });
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body: { text: "hi" } }), res);

    expect(res.statusCode).toBe(403);
    expect(MessageDao.create).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    MessageDao.create.mockRejectedValue(new Error("db down"));
    const res = mockRes();
    await MessageController.sendMessage(mockReq({ body: { text: "hi" } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
