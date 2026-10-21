const controller = require('./ContactController');
const dao = require('../model/ContactDao');

jest.mock('../model/ContactDao');

let res;

beforeEach(function() {
    jest.resetAllMocks();
    res = { status: jest.fn(), json: jest.fn() };
});

function contactRequest() {
    return { body: {
        txt_name: 'John Doe',
        txt_email: 'john.doe@example.com',
        txt_subject: 'Game problem',
        txt_message: 'My table disconnected.'
    } };
}

test('getAll reads and returns the contact messages', async function() {
    const contacts = [{ _id: '123', message: 'Please help.' }];
    dao.readAll.mockResolvedValue(contacts);

    await controller.getAll({}, res);

    expect(dao.readAll).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(contacts);
});

test('getAll handles database errors', async function() {
    dao.readAll.mockRejectedValue(new Error('Database unavailable'));

    await controller.getAll({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unable to retrieve contact messages.' });
});

test('postCreate maps form fields and ignores client-supplied status', async function() {
    const req = contactRequest();
    req.body.status = 1;
    dao.create.mockResolvedValue({ _id: '123' });

    await controller.postCreate(req, res);

    expect(dao.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john.doe@example.com',
        subject: 'Game problem',
        message: 'My table disconnected.'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Your message has been sent to the admin.' });
});

test.each(['txt_email', 'txt_message'])('postCreate rejects blank %s', async function(field) {
    const req = contactRequest();
    req.body[field] = '   ';

    await controller.postCreate(req, res);

    expect(dao.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
});

test('postCreate handles a missing request body', async function() {
    await controller.postCreate({}, res);

    expect(dao.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
});

test('postCreate rejects an unsuccessful create', async function() {
    dao.create.mockResolvedValue({ _id: null });

    await controller.postCreate(contactRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
});

test('postCreate handles database validation errors', async function() {
    dao.create.mockRejectedValue(Object.assign(new Error('Invalid contact'), { name: 'ValidationError' }));

    await controller.postCreate(contactRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
});

test('postCreate handles unexpected database errors', async function() {
    dao.create.mockRejectedValue(new Error('Database unavailable'));

    await controller.postCreate(contactRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unable to create contact message.' });
});
