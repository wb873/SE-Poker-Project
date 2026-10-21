const express = require("express");
const LobbyController = require("../controller/LobbyController");

const router = express.Router();

router.get("/", LobbyController.listLobbies);
router.post("/", LobbyController.createLobby);
router.get("/:id", LobbyController.getLobby);

module.exports = router;