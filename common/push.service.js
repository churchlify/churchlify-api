const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString('utf-8')
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

/**
 * Sends a welcome notification to a new FCM topic.
 * @param {string} topicName - The name of the FCM topic to create.
 * @param {string} title - Notification title.
 * @param {string} body - Notification body.
 * @returns {Promise<void>}
 */
const createFcmTopic = async (topicName, title = 'New Topic Created', body = 'Welcome!') => {
  try {
    await admin.messaging().send({
      topic: topicName,
      notification: {
        title,
        body,
      },
    });
    console.log(`✅ FCM topic '${topicName}' created and notification sent.`);
  } catch (err) {
    console.error(`❌ Failed to create FCM topic '${topicName}':`, err.message);
    throw err;
  }
};

/**
 * Subscribes user tokens to a given FCM topic based on role.
 * @param {string[]} tokens - Array of FCM device tokens.
 * @param {string} topic - Sanitized topic name.
 * @param {string[]} allowedRoles - Roles eligible for subscription.
 * @param {Object[]} users - Array of user objects with `role` and `token`.
 */
const subscribeUsersToTopic = async (tokens, topic, allowedRoles, users) => {
  const eligibleTokens = users
    .filter(user => allowedRoles.includes(user.role) && tokens.includes(user.token))
    .map(user => user.token);

  if (eligibleTokens.length === 0) {return;}

  try {
    await admin.messaging().subscribeToTopic(eligibleTokens, topic);
    console.log(`✅ Subscribed ${eligibleTokens.length} users to topic '${topic}'`);
  } catch (err) {
    console.error(`❌ Subscription failed for topic '${topic}':`, err.message);
    throw err;
  }
};

module.exports = {  createFcmTopic, subscribeUsersToTopic };