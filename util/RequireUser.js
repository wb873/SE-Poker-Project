//TEMPORARY identity stub until P2 exists
//TODO: replace with real auth middleware that sets the same req.user
module.exports = function requireUser(req, res, next) {
    const username = req.get("X-Username"); //anyone can fake this header

    if (typeof username !== "string" || !username.trim()) {
        return res.status(401).json( { success: false, error: "Log in first."});
    }

    //every guest is named "Guest", so they would all share one account
    if (username.trim() === "Guest"){
        return res.status(403).json({ success: false, error: "Guests can't use this feature."});
    }

    req.user = { username: username.trim() };
    next();
};  