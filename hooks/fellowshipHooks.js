const TopicManager = require('../common/push.helper'); // helper has the unsubscribe method

function applyFellowshipHooks(schema) {
  schema.post('findOneAndDelete', async function (doc) {
    if (!doc) {return;}
    try {
      await TopicManager.removeGroupTopic('fellowship', doc._id);
      console.log(`🧹 [Hook:Fellowship:delete] Removed topic for fellowship ${doc._id}`);
    } catch (err) {
      console.error('[Hook:Fellowship:delete] Topic cleanup failed:', err.message);
    }
  });
}

module.exports = applyFellowshipHooks;
