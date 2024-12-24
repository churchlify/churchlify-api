// middlewares/auth.js
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config()

// Initialize Firebase Admin SDK
// const GOOGLE_CLOUD_CREDENTIALS = JSON.parse(
//     Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString('utf-8')
// );
const serviceAccount = require('../service_account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)// Set up your Firebase credentials
});

// Middleware to verify Firebase ID token
 const authenticateFirebaseToken = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).send('Unauthorized');
    }

    try {
        req.user = await admin.auth().verifyIdToken(idToken); // Attach the decoded token to the request object
        next();
    } catch (error) {
        console.log(error)
        res.status(401).send(error);
    }
};
 const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

module.exports = { authenticateToken, authenticateFirebaseToken };
