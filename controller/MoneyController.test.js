jest.mock('../model/UserDao', () => ({
  findById: jest.fn(), findByIdentifier: jest.fn(), refillBalance: jest.fn(),
}));
const express = require('express');
const users = require('../model/UserDao');
const passwords = require('../util/PasswordUtil');
let server, base, player;
const hash = passwords.hash('secret123');
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/user_routes'));
  app.use('/money', require('../routes/money_routes'));
  server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  jest.resetAllMocks();
  player = { _id: '507f1f77bcf86cd799439012', username: 'player', email: 'player@example.com', isAdmin: false, passwordHash: hash };
  users.findByIdentifier.mockResolvedValue(player);
  users.findById.mockResolvedValue(player);
});
async function refill(token) {
  const response = await fetch(`${base}/money/refill`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
}
async function login() {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'player', password: 'secret123' }),
  });
  return (await response.json()).token;
}

test('a broke player gets chips and sees the new balance', async () => {
  users.refillBalance.mockResolvedValue({ balance: 1005 });
  const result = await refill(await login());
  expect(result.status).toBe(200);
  expect(result.body.balance).toBe(1005);
  expect(users.refillBalance).toHaveBeenCalledWith(player._id, 10, 1000);
});
test('a player who is not broke is refused', async () => {
  users.refillBalance.mockResolvedValue(null);
  expect((await refill(await login())).status).toBe(409);
});
test('guests cannot get a refill', async () => {
  expect((await refill(null)).status).toBe(401);
  expect(users.refillBalance).not.toHaveBeenCalled();
});
test('a database failure returns 500', async () => {
  const token = await login();
  users.refillBalance.mockRejectedValue(new Error('offline'));
  expect((await refill(token)).status).toBe(500);
});