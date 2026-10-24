const express = require("express");
const UserController = require("../controller/UserController");

const router = express.Router();

router.post("/register", UserController.register);           // P1
router.post("/login", UserController.login);                 // P2
router.post("/logout", UserController.logout);               // P3
router.post("/reset-password", UserController.resetPassword); // P4

module.exports = router;
