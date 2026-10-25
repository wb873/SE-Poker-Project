const router = require('express').Router();
const auth = require('../util/AuthSession');
const controller = require('../controller/ContactController');
router.use(auth.requireUser);
router.post('/', controller.postCreate);
router.get('/mine', controller.getMine);
module.exports = router;
