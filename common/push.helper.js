// common/push.helper.js
const { messaging } = require('./firebase');

const TopicManager = {
  topics: {
    church: (churchId) => `church_${churchId}`,
    leaders: (churchId) => `church_${churchId}_leaders`,
    ministry: (ministryId) => `ministry_${ministryId}`,
    fellowship: (fellowshipId) => `fellowship_${fellowshipId}`,
  },

  async subscribeTokenToTopics(token, topics) {
    if (!token){ return;}
    for (const topic of topics) {
      try {
        await messaging.subscribeToTopic(token, topic);
        console.log(`✅ Token subscribed to ${topic}`);
      } catch (err) {
        console.error(`❌ Failed to subscribe token to ${topic}:`, err.message);
      }
    }
  },

  async unsubscribeTokenFromTopics(token, topics) {
    if (!token){ return;}
    for (const topic of topics) {
      try {
        await messaging.unsubscribeFromTopic(token, topic);
        console.log(`🚫 Token unsubscribed from ${topic}`);
      } catch (err) {
        console.error(`❌ Failed to unsubscribe token from ${topic}:`, err.message);
      }
    }
  }
};

module.exports = TopicManager;
