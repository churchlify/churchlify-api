// common/firebase.js
const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
let serviceAccount;
let app;

try {
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    serviceAccount = JSON.parse(
      Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, "base64").toString("utf-8")
    );
  } else {
    serviceAccount = require("../churchlify-firebase-adminsdk-tpj2w-6e2483e01a.json");
  }
} catch (err) {
  console.error("❌ Failed to load Firebase service account:", err);
}

try {
  if (!getApps().length) {
    app = initializeApp({ credential: cert(serviceAccount) });
    console.log("✅ Firebase Admin SDK initialized successfully.");
  } else {
    app = getApp();
  }
} catch (err) {
  console.error(`❌ Unable to initialize Firebase Admin SDK: ${err}`);
}

const messaging = getMessaging(app);
const auth = getAuth(app);

module.exports = { app, messaging, auth };
