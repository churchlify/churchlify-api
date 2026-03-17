// middlewares/auth.js

const jwt = require('jsonwebtoken');
const { auth } = require('../common/firebase');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/user');

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

const authenticateFirebaseToken = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    if (!idToken) {
        return res.status(401).json({ message: 'Access denied. No Firebase token provided.' });
    }

    try {
        req.user = await auth.verifyIdToken(idToken);

        // Inactivity timeout for web clients
        if (req.headers['x-client-web'] === 'true' && req.user && req.user.uid) {
            const user = await User.findOne({ firebaseId: req.user.uid });
            if (user) {
                const now = Date.now();
                const lastActivity = user.lastActivityAt ? new Date(user.lastActivityAt).getTime() : 0;
                // auth_time is seconds; if the fresh login happened after the last recorded
                // activity the user has re-authenticated and the inactivity window resets.
                const freshLogin = req.user.auth_time * 1000 > lastActivity;
                if (!freshLogin && lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS) {
                    return res.status(440).json({ message: 'Session expired due to inactivity.' });
                }
                user.lastActivityAt = new Date();
                await user.save();
            }
        }

        next();
    } catch (error) {
        console.error('Firebase Token Error:', error.message);
        res.status(401).json({ message: 'Invalid or expired Firebase token.' });
    }
};
const authenticateToken = async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);

        // Inactivity timeout for web clients
        if (req.headers['x-client-web'] === 'true' && req.user && req.user.id) {
            const user = await User.findById(req.user.id);
            if (user) {
                const now = Date.now();
                const lastActivity = user.lastActivityAt ? new Date(user.lastActivityAt).getTime() : 0;
                // iat is seconds; if this token was issued after the last activity the
                // user has freshly logged in and the inactivity window should reset.
                const freshLogin = req.user.iat * 1000 > lastActivity;
                if (!freshLogin && lastActivity && now - lastActivity > INACTIVITY_TIMEOUT_MS) {
                    return res.status(440).json({ message: 'Session expired due to inactivity.' });
                }
                user.lastActivityAt = new Date();
                await user.save();
            }
        }

        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

module.exports = { authenticateToken, authenticateFirebaseToken };