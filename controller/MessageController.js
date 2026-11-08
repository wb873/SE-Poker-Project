const MessageDao = require("../model/MessageDao");
const FriendDao = require("../model/FriendDao");

const MAX_MESSAGE_LENGTH = 500;

// Only accepted friends can message each other
async function areFriends(a, b) {
  const friendship = await FriendDao.findBetween(a, b);
  return Boolean(friendship && friendship.status === "accepted");
}

// GET /api/messages/:username (F4)
exports.getConversation = async function (req, res) {
  const me = req.user.username;
  const other = req.params.username;

  try {
    if (!(await areFriends(me, other))) {
      return res.status(403).json({ success: false, error: "You can only message friends." });
    }

    const messages = await MessageDao.conversation(me, other);
    res.json({
      success: true,
      messages: messages.map((m) => ({ from: m.from, text: m.text, sentAt: m.createdAt })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not load messages." });
  }
};

// POST /api/messages/:username body: { text } (F4)
exports.sendMessage = async function (req, res) {
  const me = req.user.username;
  const other = req.params.username;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, error: `Messages must be 1-${MAX_MESSAGE_LENGTH} characters.` });
  }

  try {
    if (!(await areFriends(me, other))) {
      return res.status(403).json({ success: false, error: "You can only message friends." });
    }

    await MessageDao.create(me, other, text);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not send message." });
  }
};