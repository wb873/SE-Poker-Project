const express = require("express");
const MoneyController = require("../controller/MoneyController");
const { requireUser } = require("../util/AuthSession");

const router = express.Router();

// Every money route needs a logged-in player, so guests can't use them
router.use(requireUser);

router.post("/refill", MoneyController.refill);

module.exports = router;