require('dotenv').config();
const mongoose = require('mongoose');
const dao = require('./ContactDao');

// Set TESTDB_URI to run these integration tests. Always use a separate database.
const describeWithDatabase = process.env.TESTDB_URI ? describe : describe.skip;

describeWithDatabase('ContactDao integration', function() {
    beforeAll(async function() {
        await mongoose.connect(process.env.TESTDB_URI, {
            dbName: 'poker_contact_dao_test',
            serverSelectionTimeoutMS: 10000
        });
    }, 15000);

    beforeEach(async function() {
        await dao.deleteAll();
    });

    afterAll(async function() {
        try {
            if (mongoose.connection.readyState === 1) await dao.deleteAll();
        } finally {
            await mongoose.disconnect();
        }
    });

    test('readAll returns an empty list for an empty database', async function() {
        expect(await dao.readAll()).toEqual([]);
    });

    test('create persists the contact and sets defaults', async function() {
        const data = {
            name: 'John Doe',
            email: 'john.doe@example.com',
            subject: 'Game problem',
            message: 'My table disconnected.'
        };

        const created = await dao.create(data);
        const contacts = await dao.readAll();

        expect(created._id).toBeDefined();
        expect(contacts).toHaveLength(1);
        expect(contacts[0].toObject()).toMatchObject(data);
        expect(contacts[0]._id.toString()).toBe(created._id.toString());
        expect(contacts[0].status).toBe(0);
        expect(contacts[0].creation).toBeInstanceOf(Date);
    });

    test('create rejects contacts without an email', async function() {
        await expect(dao.create({ message: 'Please help.' })).rejects.toMatchObject({
            name: 'ValidationError'
        });
        expect(await dao.readAll()).toHaveLength(0);
    });

    test('deleteAll removes contact messages', async function() {
        await dao.create({ email: 'john.doe@example.com', message: 'Please help.' });

        await dao.deleteAll();

        expect(await dao.readAll()).toEqual([]);
    });
});
