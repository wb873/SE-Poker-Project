const FriendDao = require("../model/FriendDao");

const MAX_USERNAME_LENGTH = 20;

//Splits a player's friendship into accepted friends and pending requests
function sortFriendships(username, friendships){
    const result = { friends: [], incoming: [], outgoing: [] };

    for (const friendship of friendships) {
        const other = friendship.requester === username ? friendship.recipient : friendship.requester;

        if (friendship.status === "accepted") result.friends.push(other);
        else if (friendship.recipient === username) result.incoming.push(other);
        else result.outgoing.push(other);

    }
    return result;
}

// GET /api/friends (F3)
exports.listFriends = async function (req, res) {
    try { 
        const friendships = await FriendDao.listFor(req.user.username);
        res.json({ success: true, ...sortFriendships(req.user.username, friendships) });      
    } catch (err) {
        res.status(500).json({ success: false, error: "Could not load friends." });
    }
};

// POST /api/friends/requests body: { username } (F1)
exports.sendRequest = async function (req, res) {
    const me = req.user.username;
    const other = typeof req.body?.username === "string" ? req.body.username.trim() : "";

    if (!other || other.length > MAX_USERNAME_LENGTH){
        return res.status(400).json({ success: false, error: "Enter a valid username." });
    }
    if (other === me) {
        return res.status(400).json({ success: false, error: "You can't add yourself." });
    }

    //TODO: check the player exists once UserDao (P1) is ready

    try {
        const existing = await FriendDao.findBetween(me, other);

        if (!existing) {
            await FriendDao.create(me, other);
            return res.status(201).json({ success: true, message: `Friend request sent to ${other}.` });
        }
        if (existing.status === "accepted") {
            return res.status(409).json({ success: false, error: `You're already friends with ${other}.` });
        }
        if (existing.requester === me) {
            return res.status(409).json({ success: false, error: `You already sent ${other} a request.` });
        }

        //They already asked us, so sending one back accepts it
        await FriendDao.accept(existing._id);
        res.json({ success: true, message: `You and ${other} are now friends.` });
    } catch (err) {
        res.status(500).json({ success: false, error: "Could not send friend request." });
    }
};

// POST /api/friends/requests/:username/accept (F1)
exports.acceptRequest = async function (req, res) {
    const me = req.user.username;
    const other = req.params.username;

    try {
        const existing = await FriendDao.findBetween(me, other);

        //Only the player who received a pending request can accept it
        if (!existing || existing.status !== "pending" || existing.recipient !== me) {
            return res.status(404).json({ success: false, error: `No friend request from ${other}.` });
        }

        await FriendDao.accept(existing._id);
        res.json({ success: true, message: `You and ${other} are now friends.` });
    } catch (err) {
        res.status(500).json({ success: false, error: "Could not accept friend request." });
    }
};

// DELETE /api/friends/requests/:username - decline their or cancel yours (F1)
exports.removeRequest = async function (req, res) {
    const me = req.user.username;
    const other = req.params.username;

    try {
        const existing = await FriendDao.findBetween(me, other);
        if (!existing || existing.status !== "pending"){
            return res.status(404).json({ success: false, error: `No pending request with ${other}.` });
        }

        await FriendDao.remove(existing._id);
        res.json({ success: true, message: `Request with ${other} removed.` });
    } catch (err) {
        res.status(500).json({ success: false, error: "Could not remove friend request." });
    }
};

// DELETE /api/friends/:username (story F2)
exports.removeFriend = async function (req, res) {
  const me = req.user.username;
  const other = req.params.username;

  try {
    const existing = await FriendDao.findBetween(me, other);
    if (!existing || existing.status !== "accepted") {
      return res.status(404).json({ success: false, error: `${other} isn't on your friends list.` });
    }

    await FriendDao.remove(existing._id);
    res.json({ success: true, message: `${other} was removed from your friends.` });
  } catch (err) {
    res.status(500).json({ success: false, error: "Could not remove friend." });
  }
};
