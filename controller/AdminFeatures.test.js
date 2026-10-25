jest.mock('../model/UserDao', () => ({
  findById: jest.fn(), findByIdentifier: jest.fn(), listForAdmin: jest.fn(),
  updatePassword: jest.fn(), setBanned: jest.fn(),
}));
jest.mock('../model/ContactDao', () => ({
  create: jest.fn(), readAll: jest.fn(), readMine: jest.fn(), respond: jest.fn(),
}));
const express = require('express');
const users = require('../model/UserDao');
const contacts = require('../model/ContactDao');
const passwords = require('../util/PasswordUtil');
let server, base, admin, player;
const hash = passwords.hash('secret123');
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/user_routes'));
  app.use('/admin', require('../routes/admin_routes'));
  app.use('/contacts', require('../routes/contact_routes'));
  server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  jest.resetAllMocks();
  admin = { _id: '507f1f77bcf86cd799439011', username: 'admin', email: 'admin@example.com', isAdmin: true, passwordHash: hash };
  player = { _id: '507f1f77bcf86cd799439012', username: 'player', email: 'player@example.com', isAdmin: false, passwordHash: hash };
  users.findByIdentifier.mockImplementation(async (name) => name === 'admin' ? admin : player);
  users.findById.mockImplementation(async (id) => id === admin._id ? admin : id === player._id ? player : null);
});
async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function login(name = 'admin') {
  const response = await request('/auth/login', null, 'POST', { identifier: name, password: 'secret123' });
  expect(response.status).toBe(200);
  return response.body.token;
}

test('anonymous callers cannot read admin messages', async () => {
  expect((await request('/admin/contacts')).status).toBe(401);
  expect(contacts.readAll).not.toHaveBeenCalled();
});
test('a player token cannot access admin operations', async () => {
  expect((await request('/admin/users', await login('player'))).status).toBe(403);
  expect(users.listForAdmin).not.toHaveBeenCalled();
});
test('forged tokens cannot access admin operations', async () => {
  expect((await request('/admin/users', 'made-up-token')).status).toBe(401);
});
test('admins can read contact messages', async () => {
  contacts.readAll.mockResolvedValue([{ _id: 'message', message: 'Help' }]);
  const result = await request('/admin/contacts', await login());
  expect(result.status).toBe(200);
  expect(result.body[0].message).toBe('Help');
});
test('contact submission binds ownership and email to the authenticated user', async () => {
  contacts.create.mockResolvedValue({ _id: 'message' });
  const result = await request('/contacts', await login('player'), 'POST', {
    userId: admin._id, txt_name: 'Fake', txt_email: 'fake@example.com', txt_subject: 'Help', txt_message: 'Please help', status: 1,
  });
  expect(result.status).toBe(201);
  expect(contacts.create).toHaveBeenCalledWith({ userId: player._id, name: player.username, email: player.email, subject: 'Help', message: 'Please help' });
});
test('users only query their own contact history', async () => {
  contacts.readMine.mockResolvedValue([]);
  expect((await request('/contacts/mine', await login('player'))).status).toBe(200);
  expect(contacts.readMine).toHaveBeenCalledWith(player._id);
});
test('admin replies are saved and then available in the user inbox', async () => {
  const message = { _id: 'message', userId: player._id, reply: 'Fixed', status: 1 };
  contacts.respond.mockResolvedValue(message);
  const result = await request('/admin/contacts/message/reply', await login(), 'PATCH', { reply: ' Fixed ' });
  expect(result.status).toBe(200);
  expect(contacts.respond).toHaveBeenCalledWith('message', 'Fixed');
  contacts.readMine.mockResolvedValue([message]);
  expect((await request('/contacts/mine', await login('player'))).body[0].reply).toBe('Fixed');
});
test('blank replies are rejected before saving', async () => {
  expect((await request('/admin/contacts/message/reply', await login(), 'PATCH', { reply: ' ' })).status).toBe(400);
  expect(contacts.respond).not.toHaveBeenCalled();
});
test('missing messages return 404', async () => {
  contacts.respond.mockResolvedValue(null);
  expect((await request('/admin/contacts/missing/reply', await login(), 'PATCH', { reply: 'Hello' })).status).toBe(404);
});
test('admins reset passwords using a hash and old sessions are rejected', async () => {
  const oldToken = await login('player');
  users.updatePassword.mockImplementation(async (id, passwordHash) => { player.passwordHash = passwordHash; return player; });
  const result = await request(`/admin/users/${player._id}/password`, await login(), 'PATCH', { newPassword: 'newSecret123' });
  expect(result.status).toBe(200);
  expect(passwords.verify('newSecret123', player.passwordHash)).toBe(true);
  expect((await request('/contacts/mine', oldToken)).status).toBe(401);
});
test('short passwords are rejected', async () => {
  expect((await request(`/admin/users/${player._id}/password`, await login(), 'PATCH', { newPassword: 'short' })).status).toBe(400);
  expect(users.updatePassword).not.toHaveBeenCalled();
});
test('admins can ban and unban, and banned users cannot log in or reuse sessions', async () => {
  const oldToken = await login('player');
  const adminToken = await login();
  users.setBanned.mockImplementation(async (id, banned) => { player.isBanned = banned; return { _id: player._id, isBanned: banned }; });
  expect((await request(`/admin/users/${player._id}/ban`, adminToken, 'PATCH', { isBanned: true })).status).toBe(200);
  expect((await request('/contacts/mine', oldToken)).status).toBe(401);
  expect((await request('/auth/login', null, 'POST', { identifier: 'player', password: 'secret123' })).status).toBe(403);
  expect((await request(`/admin/users/${player._id}/ban`, adminToken, 'PATCH', { isBanned: false })).status).toBe(200);
  await login('player');
});
test('admin accounts cannot be banned or reset using player tools', async () => {
  const token = await login();
  expect((await request(`/admin/users/${admin._id}/ban`, token, 'PATCH', { isBanned: true })).status).toBe(403);
  expect((await request(`/admin/users/${admin._id}/password`, token, 'PATCH', { newPassword: 'newSecret123' })).status).toBe(403);
});
test('logout revokes access', async () => {
  const token = await login();
  await request('/auth/logout', token, 'POST');
  expect((await request('/admin/users', token)).status).toBe(401);
});
test('removing admin permission takes effect on existing sessions', async () => {
  const token = await login();
  admin.isAdmin = false;
  expect((await request('/admin/users', token)).status).toBe(403);
});
test('database failures return 500 rather than granting access', async () => {
  const token = await login();
  users.findById.mockRejectedValue(new Error('offline'));
  expect((await request('/admin/users', token)).status).toBe(500);
});
