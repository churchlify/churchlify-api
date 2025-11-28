// hooks/assignmentHooks.js
const TopicManager = require("../common/push.helper");
let User;

function getUserModel() {
  if (!User) {
    User = require("../models/user");
  }
  return User;
}

function buildTopicsFromAssignment(doc, churchId) {
  const topics = new Set([TopicManager.topics.church(churchId)]);
  if (doc.ministryId) {
    topics.add(TopicManager.topics.ministry(doc.ministryId));
  }
  if (doc.fellowshipId) {
    topics.add(TopicManager.topics.fellowship(doc.fellowshipId));
  }
  if (doc.role === "leader") {
    topics.add(TopicManager.topics.leaders(doc.churchId));
  }
  return [...topics];
}

function applyAssignmentHooks(schema) {
  schema.post("save", async function (doc) {
    try {
      const UserModel = getUserModel();
      const user = await UserModel.findById(doc.userId);
      if (!user?.pushToken || user.muteNotifications) {
        return;
      }

      const churchId = user.church;
      const topics = buildTopicsFromAssignment(doc, churchId);
      if (doc.status === "approved") {
        console.log("Subscribing user to topics after assignment save:", topics );
        await TopicManager.subscribeTokenToTopics(user.pushToken, topics);
        console.log(`[Hook:Assignment:save] User ${doc.userId} subscribed to topics.`);
      } else {
        console.log( "Unsubscribing user to topics after assignment save:", topics);
        await TopicManager.unsubscribeTokenFromTopics(user.pushToken, topics);
        console.log(`[Hook:Assignment:save] User ${doc.userId} unsubscribed to topics.`);
      }
    } catch (err) {
      console.error(
        "[Hook:Assignment:save] Topic subscription failed:",
        err.message
      );
    }
  });

  schema.post("findOneAndUpdate", async function (doc) {
    if (!doc) {
      return;
    }
    try {
      const updatedDoc = await this.model.findById(doc._id);
      const UserModel = getUserModel();
      const user = await UserModel.findById(updatedDoc.userId);
      if (!user?.pushToken || user.muteNotifications) {
        return;
      }

      const churchId = user.church;
      const topics = buildTopicsFromAssignment(doc, churchId);
      if (doc.status === "approved") {
        console.log("Subscribing user to topics after assignment update:", topics );
        await TopicManager.subscribeTokenToTopics(user.pushToken, topics);
        console.log(`[Hook:Assignment:update] User  ${updatedDoc.userId} subscribed to topics.`);
      } else {
        console.log( "Unsubscribing user to topics after assignment update:", topics);
        await TopicManager.unsubscribeTokenFromTopics(user.pushToken, topics);
        console.log(`[Hook:Assignment:update] User  ${updatedDoc.userId} unsubscribed to topics.`);
      }
    } catch (err) {
      console.error(
        "[Hook:Assignment:update] Topic subscription failed:",
        err.message
      );
    }
  });

  schema.post("findOneAndDelete", async function (doc) {
    if (!doc) {
      return;
    }
    try {
      const UserModel = getUserModel();
      const user = await UserModel.findById(doc.userId);
      if (!user?.pushToken) {
        return;
      }

      const churchId = user.church;
      const topics = buildTopicsFromAssignment(doc, churchId);
      await TopicManager.unsubscribeTokenFromTopics(user.pushToken, topics);
      console.log(
        `[Hook:Assignment:delete] User ${doc.userId} unsubscribed from topics.`
      );
    } catch (err) {
      console.error(
        "[Hook:Assignment:delete] Topic unsubscribe failed:",
        err.message
      );
    }
  });
}

module.exports = applyAssignmentHooks;
