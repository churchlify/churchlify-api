// hooks/fellowshipHooks.js
const TopicManager = require('../common/push.helper');
let Assignment;

function getAssignmentModel() {
  if (!Assignment){ Assignment = require('../models/assignment');}
  return Assignment;
}

function applyFellowshipHooks(schema) {
  schema.post('findOneAndDelete', async function (doc) {
    if (!doc) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find all assignments tied to this fellowship
      const assignments = await AssignmentModel.find({ fellowshipId: doc._id }).populate('userId');

      const topic = TopicManager.topics.fellowship(doc._id);

      for (const assignment of assignments) {
        const user = assignment.userId;
        if (user?.pushToken) {
          await TopicManager.unsubscribeTokenFromTopics(user.pushToken, [topic]);
          console.log(`🚫 Unsubscribed user ${user._id} from deleted fellowship topic ${topic}`);
        }
      }

      console.log(`🧹 [Hook:Fellowship:delete] Removed topic for fellowship ${doc._id}`);
    } catch (err) {
      console.error('[Hook:Fellowship:delete] Topic cleanup failed:', err.message);
    }
  });
}

module.exports = applyFellowshipHooks;
