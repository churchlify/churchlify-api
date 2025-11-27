const TopicManager = require('../common/push.helper');
let User;

function getUserModel() {
  if (!User) {
    User = require('../models/user');
  }
  return User;
}

function applyAssignmentHooks(schema) {
  schema.post('save', async function(doc) {
    try {
      const UserModel = getUserModel();
      const user = await UserModel.findById(doc.userId);
      if (!user?.pushToken || user.muteNotifications) {return;}

      await TopicManager.subscribeUserToAssignments(doc.userId, doc.churchId);
      console.log(`[Hook:Assignment:save] User ${doc.userId} subscribed to topics.`);
    } catch (err) {
      console.error('[Hook:Assignment:save] Topic subscription failed:', err.message);
    }
  });

  schema.post('findOneAndUpdate', async function(doc) {
    if (!doc) {return;}
    try {
      const updatedDoc = await this.model.findById(doc._id);
      const UserModel = getUserModel();
      const user = await UserModel.findById(updatedDoc.userId);
      if (!user?.pushToken || user.muteNotifications) {return;}

      await TopicManager.subscribeUserToAssignments(updatedDoc.userId, updatedDoc.churchId);
      console.log(`[Hook:Assignment:findOneAndUpdate] User ${updatedDoc.userId} updated subscriptions.`);
    } catch (err) {
      console.error('[Hook:Assignment:findOneAndUpdate] Topic subscription failed:', err.message);
    }
  });

  schema.post('findOneAndDelete', async function(doc) {
    if (!doc){ return;}
    try {
      const UserModel = getUserModel();
      const user = await UserModel.findById(doc.userId);
      if (!user?.pushToken){ return;}

      await TopicManager.unsubscribeUserFromAssignments(doc.userId, doc.churchId);
      console.log(`[Hook:Assignment:delete] User ${doc.userId} unsubscribed from topics.`);
    } catch (err) {
      console.error('[Hook:Assignment:delete] Topic unsubscribe failed:', err.message);
    }
  });
}

module.exports = applyAssignmentHooks;