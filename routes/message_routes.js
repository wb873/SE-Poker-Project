const express = require("express");
const MessageController = require("../controller/MessageController");
const { requireUser } = require("../util/AuthSession");

const router = express.Router();

// Every messaging route needs a logged-in player
router.use(requireUser);

router.get("/:username", MessageController.getConversation);
router.post("/:username", MessageController.sendMessage);

module.exports = router;