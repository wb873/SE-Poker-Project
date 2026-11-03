const mongoose = require('mongoose');
const users = require('./UserDao');
const contacts = require('./ContactDao');
afterEach(() => jest.restoreAllMocks());

test('admin user list explicitly selects safe fields', async () => {
  const query = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
  jest.spyOn(users.model, 'find').mockReturnValue(query);
  await users.listForAdmin();
  expect(query.select).toHaveBeenCalledWith('username email isAdmin isBanned mustChangePassword');
});
test('ban updates only the ban field and selects safe response fields', async () => {
  const query = { select: jest.fn().mockResolvedValue({ isBanned: true }) };
  const update = jest.spyOn(users.model, 'findByIdAndUpdate').mockReturnValue(query);
  await users.setBanned('507f1f77bcf86cd799439012', true);
  expect(update).toHaveBeenCalledWith('507f1f77bcf86cd799439012', { isBanned: true }, { returnDocument: 'after' });
  expect(query.select).toHaveBeenCalledWith('username email isAdmin isBanned');
});
test('contact history is filtered by owner', async () => {
  const query = { sort: jest.fn().mockResolvedValue([]) };
  const find = jest.spyOn(mongoose.model('contact'), 'find').mockReturnValue(query);
  await contacts.readMine('507f1f77bcf86cd799439012');
  expect(find).toHaveBeenCalledWith({ userId: '507f1f77bcf86cd799439012' });
});
test('respond records the reply, timestamp and responded status', async () => {
  const update = jest.spyOn(mongoose.model('contact'), 'findByIdAndUpdate').mockResolvedValue({});
  await contacts.respond('507f1f77bcf86cd799439012', 'Hello');
  expect(update).toHaveBeenCalledWith('507f1f77bcf86cd799439012', {
    reply: 'Hello', repliedAt: expect.any(Date), status: 1,
  }, { returnDocument: 'after', runValidators: true });
});
test('respond rejects malformed ids without issuing a database operation', async () => {
  const update = jest.spyOn(mongoose.model('contact'), 'findByIdAndUpdate');
  expect(await contacts.respond('bad-id', 'Hello')).toBeNull();
  expect(update).not.toHaveBeenCalled();
});
test('setAdmin sets only the admin flag and selects safe response fields', async () => {
  const query = { select: jest.fn().mockResolvedValue({ isAdmin: false }) };
  const update = jest.spyOn(users.model, 'findByIdAndUpdate').mockReturnValue(query);
  await users.setAdmin('507f1f77bcf86cd799439012', false);
  expect(update).toHaveBeenCalledWith('507f1f77bcf86cd799439012', { isAdmin: false }, { returnDocument: 'after' });
  expect(query.select).toHaveBeenCalledWith('username email isAdmin isBanned mustChangePassword');
});
