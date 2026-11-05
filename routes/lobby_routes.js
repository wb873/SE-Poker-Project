const express = require("express");
const LobbyController = require("../controller/LobbyController");

const router = express.Router();

router.get("/", LobbyController.listLobbies);
router.post("/", LobbyController.createLobby);
router.get("/:id", LobbyController.getLobby);
router.post("/:id/join", LobbyController.joinLobby);

module.exports = router;