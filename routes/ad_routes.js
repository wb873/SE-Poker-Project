const express = require("express");
const AdController = require("../controller/AdController");

const router = express.Router();
router.get("/", AdController.getAd); // R1 (placeholder)

module.exports = router;