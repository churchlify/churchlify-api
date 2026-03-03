// hooks/ministryHooks.js
const TopicManager = require('../common/push.helper');
let Assignment;

function getAssignmentModel() {
  if (!Assignment){ Assignment = require('../models/assignment');}
  return Assignment;
}


function applyMinistryHooks(schema) {
  // Update assignment role when leader is set
  schema.post('save', async function (doc) {
    if (!doc.leaderId) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find existing assignment for the leader
      const assignment = await AssignmentModel.findOne({
        ministryId: doc._id,
        userId: doc.leaderId
      });

      if (assignment && assignment.role !== 'leader') {
        assignment.role = 'leader';
        await assignment.save();
        console.log(`👑 [Hook:Ministry:save] Updated ${doc.leaderId} role to leader in ministry ${doc._id}`);
      }
    } catch (err) {
      console.error('[Hook:Ministry:save] Leader role update failed:', err.message);
    }
  });

  schema.post('findOneAndUpdate', async function (doc) {
    if (!doc || !doc.leaderId) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find existing assignment for the leader
      const assignment = await AssignmentModel.findOne({
        ministryId: doc._id,
        userId: doc.leaderId
      });

      if (assignment && assignment.role !== 'leader') {
        assignment.role = 'leader';
        await assignment.save();
        console.log(`👑 [Hook:Ministry:update] Updated ${doc.leaderId} role to leader in ministry ${doc._id}`);
      }
    } catch (err) {
      console.error('[Hook:Ministry:update] Leader role update failed:', err.message);
    }
  });

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
