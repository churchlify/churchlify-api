// hooks/ministryHooks.js
const TopicManager = require('../common/push.helper');
let Assignment;

function getAssignmentModel() {
  if (!Assignment){ Assignment = require('../models/assignment');}
  return Assignment;
}


function applyMinistryHooks(schema) {
  schema.post('findOneAndDelete', async function (doc) {
    if (!doc) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find all assignments tied to this ministry
      const assignments = await AssignmentModel.find({ ministryId: doc._id }).populate('userId');

      const topic = TopicManager.topics.ministry(doc._id);

      for (const assignment of assignments) {
        const user = assignment.userId;
        if (user?.pushToken) {
          await TopicManager.unsubscribeTokenFromTopics(user.pushToken, [topic]);
          console.log(`🚫 Unsubscribed user ${user._id} from deleted ministry topic ${topic}`);
        }
      }

      console.log(`🧹 [Hook:Ministry:delete] Removed topic for ministry ${doc._id}`);
    } catch (err) {
      console.error('[Hook:Ministry:delete] Topic cleanup failed:', err.message);
    }
  });
}

module.exports = applyMinistryHooks;
