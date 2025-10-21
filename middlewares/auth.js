// middlewares/auth.js
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

const serviceAccount = require('../service_account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

 const authenticateFirebaseToken = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        return res.status(401).json({ message: 'Access denied. No Firebase token provided.' });
    }

    try {
        req.user = await admin.auth().verifyIdToken(idToken); 
        next();
    } catch (error) {
        console.error('Firebase Token Error:', error.message);
        res.status(401).json({ message: 'Invalid or expired Firebase token.' });
    }
};
 const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

module.exports = { authenticateToken, authenticateFirebaseToken };