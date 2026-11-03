const express = require("express");
const UserController = require("../controller/UserController");
const AuthSession = require("../util/AuthSession");

const router = express.Router();

router.post("/register", UserController.register);           // P1
router.get("/availability", UserController.checkAvailability); // P1
router.post("/login", UserController.login);                 // P2
router.post("/logout", UserController.logout);               // P3
router.post("/reset-password", UserController.resetPassword); // P4
router.post("/forgot-password", UserController.forgotPassword); // P4
router.post("/change-password", AuthSession.requireUser, UserController.changePassword); // P4

module.exports = router;
