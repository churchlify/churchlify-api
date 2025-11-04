const TopicManager = require('../common/push.helper');

function applyMinistryHooks(schema) {
  schema.post('findOneAndDelete', async function (doc) {
    if (!doc) {return;}
    try {
      await TopicManager.removeGroupTopic('ministry', doc._id);
      console.log(`🧹 [Hook:Ministry:delete] Removed topic for ministry ${doc._id}`);
    } catch (err) {
      console.error('[Hook:Ministry:delete] Topic cleanup failed:', err.message);
    }
  });
}

module.exports = applyMinistryHooks;