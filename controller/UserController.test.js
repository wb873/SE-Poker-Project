// Run with: npx jest controller/UserController.test.js
// The DAO is mocked, so no database is needed. PasswordUtil is real: it is a pure function.
jest.mock("../model/UserDao", () => ({
  create: jest.fn(),
  findByIdentifier: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByUsernameAndEmail: jest.fn(),
  updatePassword: jest.fn(),
  setResetToken: jest.fn(),
  resetPasswordWithToken: jest.fn(),
}));
jest.mock("../util/Mailer", () => ({
  appUrl: () => "http://localhost:5173",
  sendPasswordReset: jest.fn(),
}));
jest.mock("../util/AuthSession", () => ({ ...jest.requireActual("../util/AuthSession"), revokeUser: jest.fn() }));

const crypto = require("crypto");
const UserDao = require("../model/UserDao");
const Mailer = require("../util/Mailer");
const AuthSession = require("../util/AuthSession");
const UserController = require("./UserController");
const PasswordUtil = require("../util/PasswordUtil");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function storedUser(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    username: "willb",
    email: "will@example.com",
    passwordHash: PasswordUtil.hash("secret123"),
    avatar: "default",
    balance: 10000,
    isAdmin: false,
    stats: { handsPlayed: 0, handsWon: 0, biggestPot: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  UserDao.create.mockImplementation(async (data) => storedUser(data));
  UserDao.findByIdentifier.mockResolvedValue(null);
  UserDao.findByEmail.mockResolvedValue(null);
  UserDao.findByUsername.mockResolvedValue(null);
  UserDao.findByUsernameAndEmail.mockResolvedValue(null);
  UserDao.setResetToken.mockResolvedValue(storedUser());
  UserDao.resetPasswordWithToken.mockResolvedValue(null);
  Mailer.sendPasswordReset.mockResolvedValue();
  UserDao.updatePassword.mockImplementation(async (id, passwordHash) => storedUser({ passwordHash }));
});

describe("register (P1)", () => {
  const validBody = { username: "willb", email: "will@example.com", password: "secret123" };

  test("valid registration returns 201 and the public user", async () => {
    const res = mockRes();
    await UserController.register({ body: validBody }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({ username: "willb", email: "will@example.com", balance: 10000 });
  });

  test("never returns the password or its hash", async () => {
    const res = mockRes();
    await UserController.register({ body: validBody }, res);

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("secret123");
  });

  test("stores a hash, not the raw password", async () => {
    await UserController.register({ body: validBody }, mockRes());

    const saved = UserDao.create.mock.calls[0][0];
    expect(saved.passwordHash).not.toBe("secret123");
    expect(PasswordUtil.verify("secret123", saved.passwordHash)).toBe(true);
  });

  test("trims the username and email before saving", async () => {
    await UserController.register({ body: { ...validBody, username: "  willb  ", email: "  will@example.com  " } }, mockRes());

    const saved = UserDao.create.mock.calls[0][0];
    expect(saved.username).toBe("willb");
    expect(saved.email).toBe("will@example.com");
  });

  test.each([
    ["a username that is too short", { username: "ab" }],
    ["a username with illegal characters", { username: "will b!" }],
    ["a missing username", { username: undefined }],
    ["an invalid email", { email: "not-an-email" }],
    ["a missing email", { email: undefined }],
    ["a password that is too short", { password: "short" }],
    ["a missing password", { password: undefined }],
  ])("rejects %s with 400", async (_label, override) => {
    const res = mockRes();
    await UserController.register({ body: { ...validBody, ...override } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(UserDao.create).not.toHaveBeenCalled();
  });

  test("rejects a missing body without throwing", async () => {
    const res = mockRes();
    await UserController.register({}, res);
    expect(res.statusCode).toBe(400);
  });

  test("returns 409 naming the username when it is already in use", async () => {
    UserDao.findByUsername.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.register({ body: validBody }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ field: "username", error: "That username is already in use." });
    expect(UserDao.create).not.toHaveBeenCalled();
  });

  test("checks the username exactly as typed so the DAO can match it ignoring case", async () => {
    UserDao.findByUsername.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.register({ body: { ...validBody, username: "WillB" } }, res);

    expect(UserDao.findByUsername).toHaveBeenCalledWith("WillB");
    expect(res.statusCode).toBe(409);
  });

  test("returns 409 naming the email when it is already in use", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.register({ body: validBody }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ field: "email", error: "That email is already in use." });
    expect(UserDao.create).not.toHaveBeenCalled();
  });

  test("returns 409 when the unique index rejects a racing signup", async () => {
    UserDao.create.mockRejectedValue({ code: 11000 });
    const res = mockRes();

    await UserController.register({ body: validBody }, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("That username or email is already taken.");
  });

  test("returns 500 when the database fails", async () => {
    UserDao.create.mockRejectedValue(new Error("connection lost"));
    const res = mockRes();

    await UserController.register({ body: validBody }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("login (P2)", () => {
  test("correct credentials return the public user", async () => {
    UserDao.findByIdentifier.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.login({ body: { identifier: "willb", password: "secret123" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe("willb");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test("accepts an email as the identifier", async () => {
    UserDao.findByIdentifier.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.login({ body: { identifier: "will@example.com", password: "secret123" } }, res);

    expect(res.body.success).toBe(true);
    expect(UserDao.findByIdentifier).toHaveBeenCalledWith("will@example.com");
  });

  test("a wrong password returns 401", async () => {
    UserDao.findByIdentifier.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.login({ body: { identifier: "willb", password: "wrongpassword" } }, res);

    expect(res.statusCode).toBe(401);
  });

  test("an unknown user returns 404 ACCOUNT_NOT_FOUND so the client sends them to Create Account", async () => {
    UserDao.findByIdentifier.mockResolvedValue(null);
    const res = mockRes();

    await UserController.login({ body: { identifier: "nobody", password: "secret123" } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("ACCOUNT_NOT_FOUND");
    expect(res.body.success).toBe(false);
  });

  test("a temporary password logs in and tells the client to offer a change", async () => {
    UserDao.findByIdentifier.mockResolvedValue(storedUser({ mustChangePassword: true }));
    const res = mockRes();

    await UserController.login({ body: { identifier: "willb", password: "secret123" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  test.each([
    ["a missing identifier", { identifier: undefined, password: "secret123" }],
    ["a blank identifier", { identifier: "   ", password: "secret123" }],
    ["a missing password", { identifier: "willb", password: undefined }],
  ])("rejects %s with 400", async (_label, body) => {
    const res = mockRes();
    await UserController.login({ body }, res);

    expect(res.statusCode).toBe(400);
    expect(UserDao.findByIdentifier).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    UserDao.findByIdentifier.mockRejectedValue(new Error("connection lost"));
    const res = mockRes();

    await UserController.login({ body: { identifier: "willb", password: "secret123" } }, res);

    expect(res.statusCode).toBe(500);
  });
});

describe("logout (P3)", () => {
  test("confirms the logout", async () => {
    const res = mockRes();
    await UserController.logout({ body: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("resetPassword (P4)", () => {
  const validBody = {
    email: "will@example.com",
    currentPassword: "secret123",
    newPassword: "brandnew456",
  };

  test("correct current password updates the stored hash", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.resetPassword({ body: validBody }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const [, newHash] = UserDao.updatePassword.mock.calls[0];
    expect(PasswordUtil.verify("brandnew456", newHash)).toBe(true);
    expect(PasswordUtil.verify("secret123", newHash)).toBe(false);
  });

  test("never returns the password hash", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.resetPassword({ body: validBody }, res);

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("brandnew456");
  });

  test("a wrong current password returns 401 and changes nothing", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.resetPassword({ body: { ...validBody, currentPassword: "wrongpassword" } }, res);

    expect(res.statusCode).toBe(401);
    expect(UserDao.updatePassword).not.toHaveBeenCalled();
  });

  test("an unknown email returns 401 and changes nothing", async () => {
    UserDao.findByEmail.mockResolvedValue(null);
    const res = mockRes();

    await UserController.resetPassword({ body: validBody }, res);

    expect(res.statusCode).toBe(401);
    expect(UserDao.updatePassword).not.toHaveBeenCalled();
  });

  test.each([
    ["an invalid email", { email: "not-an-email" }],
    ["a missing current password", { currentPassword: undefined }],
    ["a new password that is too short", { newPassword: "short" }],
    ["a missing new password", { newPassword: undefined }],
    ["a new password identical to the old one", { newPassword: "secret123" }],
  ])("rejects %s with 400", async (_label, override) => {
    const res = mockRes();
    await UserController.resetPassword({ body: { ...validBody, ...override } }, res);

    expect(res.statusCode).toBe(400);
    expect(UserDao.updatePassword).not.toHaveBeenCalled();
  });

  test("returns 500 when the database fails", async () => {
    UserDao.findByEmail.mockRejectedValue(new Error("connection lost"));
    const res = mockRes();

    await UserController.resetPassword({ body: validBody }, res);

    expect(res.statusCode).toBe(500);
  });
});

describe("checkAvailability (P1)", () => {
  test("reports a taken username and a free email", async () => {
    UserDao.findByUsername.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.checkAvailability({ query: { username: "willb", email: "new@example.com" } }, res);

    expect(res.body).toEqual({ success: true, usernameAvailable: false, emailAvailable: true });
  });

  test("only reports the fields it was asked about", async () => {
    const res = mockRes();
    await UserController.checkAvailability({ query: { email: "new@example.com" } }, res);

    expect(res.body).toEqual({ success: true, emailAvailable: true });
    expect(UserDao.findByUsername).not.toHaveBeenCalled();
  });
});

describe("forgotPassword (P4)", () => {
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

  test("emails a reset link and stores only a hash of its token", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const res = mockRes();

    await UserController.forgotPassword({ body: { email: "Will@Example.com " } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Mailer.sendPasswordReset).toHaveBeenCalledTimes(1);
    const [user, link, minutes] = Mailer.sendPasswordReset.mock.calls[0];
    expect(user.email).toBe("will@example.com");
    expect(minutes).toBe(30);
    const token = link.match(/^http:\/\/localhost:5173\/#\/reset-password\?token=([0-9a-f]{64})$/)[1];

    const [id, storedHash, expires] = UserDao.setResetToken.mock.calls[0];
    expect(id).toBe(storedUser()._id);
    expect(storedHash).toBe(sha256(token));
    expect(storedHash).not.toBe(token);
    expect(expires.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  test("an unknown email gets the same reply and no email is sent", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    const known = mockRes();
    await UserController.forgotPassword({ body: { email: "will@example.com" } }, known);

    UserDao.findByEmail.mockResolvedValue(null);
    Mailer.sendPasswordReset.mockClear();
    const unknown = mockRes();
    await UserController.forgotPassword({ body: { email: "nobody@example.com" } }, unknown);

    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(Mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  test("a banned account is not sent a link", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser({ isBanned: true }));
    const res = mockRes();
    await UserController.forgotPassword({ body: { email: "will@example.com" } }, res);

    expect(res.statusCode).toBe(200);
    expect(UserDao.setResetToken).not.toHaveBeenCalled();
    expect(Mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  test("a failed send still gets the usual reply", async () => {
    UserDao.findByEmail.mockResolvedValue(storedUser());
    Mailer.sendPasswordReset.mockRejectedValue(new Error("SMTP down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();

    await UserController.forgotPassword({ body: { email: "will@example.com" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test.each([["a missing email", {}], ["an invalid email", { email: "nope" }]])("rejects %s with 400", async (_label, body) => {
    const res = mockRes();
    await UserController.forgotPassword({ body }, res);

    expect(res.statusCode).toBe(400);
    expect(UserDao.findByEmail).not.toHaveBeenCalled();
  });
});

describe("confirmPasswordReset (P4)", () => {
  const token = "a".repeat(64);
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

  test("a valid token sets the new password and signs the player out everywhere", async () => {
    UserDao.resetPasswordWithToken.mockImplementation(async (_hash, passwordHash) => storedUser({ passwordHash }));
    const res = mockRes();

    await UserController.confirmPasswordReset({ body: { token, newPassword: "brandnew1" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const [tokenHash, passwordHash] = UserDao.resetPasswordWithToken.mock.calls[0];
    expect(tokenHash).toBe(sha256(token));
    expect(PasswordUtil.verify("brandnew1", passwordHash)).toBe(true);
    expect(AuthSession.revokeUser).toHaveBeenCalledWith(storedUser()._id);
  });

  test("an expired, used or unknown token is rejected", async () => {
    const res = mockRes();
    await UserController.confirmPasswordReset({ body: { token, newPassword: "brandnew1" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid or has expired/);
    expect(AuthSession.revokeUser).not.toHaveBeenCalled();
  });

  test.each([
    ["a missing token", { newPassword: "brandnew1" }],
    ["a malformed token", { token: "not-a-token", newPassword: "brandnew1" }],
    ["a short password", { token, newPassword: "short" }],
  ])("rejects %s with 400 before touching the database", async (_label, body) => {
    const res = mockRes();
    await UserController.confirmPasswordReset({ body }, res);

    expect(res.statusCode).toBe(400);
    expect(UserDao.resetPasswordWithToken).not.toHaveBeenCalled();
  });
});

const res_mock = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };

test("updateAvatar saves a valid emoji", async () => {
  UserDao.setAvatar = jest.fn().mockResolvedValue({ _id: "1", username: "a", avatar: "😎" });
  const res = res_mock();
  await UserController.updateAvatar({ user: { _id: "1" }, body: { avatar: "😎" } }, res);
  expect(UserDao.setAvatar).toHaveBeenCalledWith("1", "😎");
  expect(res.json.mock.calls[0][0].success).toBe(true);
});

test.each([["abc"], [""], [5], ["<script>"], ["😎😎😎😎😎😎😎😎😎"]])("updateAvatar rejects %p", async (avatar) => {
  const res = res_mock();
  await UserController.updateAvatar({ user: { _id: "1" }, body: { avatar } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test("updateAvatar returns 404 when the account is gone", async () => {
  UserDao.setAvatar = jest.fn().mockResolvedValue(null);
  const res = res_mock();
  await UserController.updateAvatar({ user: { _id: "1" }, body: { avatar: "😎" } }, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test("getMe returns the public user", () => {
  const res = res_mock();
  UserController.getMe({ user: { _id: "1", username: "a", email: "a@b.c", avatar: "😎", balance: 5 } }, res);
  expect(res.json.mock.calls[0][0].user.avatar).toBe("😎");
});