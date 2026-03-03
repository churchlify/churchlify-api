// hooks/fellowshipHooks.js
const TopicManager = require('../common/push.helper');
let Assignment;

function getAssignmentModel() {
  if (!Assignment){ Assignment = require('../models/assignment');}
  return Assignment;
}

function applyFellowshipHooks(schema) {
  // Update assignment role when leader is set
  schema.post('save', async function (doc) {
    if (!doc.leaderId) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find existing assignment for the leader
      const assignment = await AssignmentModel.findOne({
        fellowshipId: doc._id,
        userId: doc.leaderId
      });

      if (assignment && assignment.role !== 'leader') {
        assignment.role = 'leader';
        await assignment.save();
        console.log(`👑 [Hook:Fellowship:save] Updated ${doc.leaderId} role to leader in fellowship ${doc._id}`);
      }
    } catch (err) {
      console.error('[Hook:Fellowship:save] Leader role update failed:', err.message);
    }
  });

  schema.post('findOneAndUpdate', async function (doc) {
    if (!doc || !doc.leaderId) {return;}

    try {
      const AssignmentModel = getAssignmentModel();

      // Find existing assignment for the leader
      const assignment = await AssignmentModel.findOne({
        fellowshipId: doc._id,
        userId: doc.leaderId
      });

      if (assignment && assignment.role !== 'leader') {
        assignment.role = 'leader';
        await assignment.save();
        console.log(`👑 [Hook:Fellowship:update] Updated ${doc.leaderId} role to leader in fellowship ${doc._id}`);
      }
    } catch (err) {
      console.error('[Hook:Fellowship:update] Leader role update failed:', err.message);
    }
  });

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
