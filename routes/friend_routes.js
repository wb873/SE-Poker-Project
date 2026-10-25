const express = require("express");
const FriendController = require("../controller/FriendController");
const { requireUser } = require("../util/AuthSession");

const router = express.Router();

// Every friends route needs a logged-in, non-guest player
router.use(requireUser);

router.get("/", FriendController.listFriends);
router.post("/requests", FriendController.sendRequest);
router.post("/requests/:username/accept", FriendController.acceptRequest);
router.delete("/requests/:username", FriendController.removeRequest);
router.delete("/:username", FriendController.removeFriend);

module.exports = router;