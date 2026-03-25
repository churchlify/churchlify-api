// middlewares/attachUser.js
const User = require('../models/user');

async function attachUser(req, res, next) {
  try {
    const firebaseUid = req.user?.uid;
    if (!firebaseUid) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findOne({ firebaseId: firebaseUid }).lean();
    if (!user) return res.status(401).json({ error: 'User profile not found' });

    req.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = attachUser;