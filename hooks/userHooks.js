// hooks/userHooks.js
const TopicManager = require("../common/push.helper");
let Church;
let Assignment;

function getChurchModel() {
  if (!Church) {
    Church = require("../models/church");
  }
  return Church;
}

function getAssignmentModel() {
  if (!Assignment) {
    Assignment = require("../models/assignment");
  }
  return Assignment;
}

function buildTopicsForUser(userId, churchId) {
  const AssignmentModel = getAssignmentModel();
  return AssignmentModel.find({ userId, churchId }).then(assignments => {
    const topics = new Set([TopicManager.topics.church(churchId)]);
    for (const assignment of assignments) {
      if (assignment.ministryId){ topics.add(TopicManager.topics.ministry(assignment.ministryId));}
      if (assignment.fellowshipId){ topics.add(TopicManager.topics.fellowship(assignment.fellowshipId));}
      if (assignment.role === "leader"){ topics.add(TopicManager.topics.leaders(churchId));}
    }
    return [...topics];
  });
}

function applyUserHooks(schema) {
  // ✅ Validate church references
  schema.pre("save", async function (next) {
    if (!this.isNew && !this.isModified("church")) {return next();}
    const churchId = this.church;
    if (!churchId){ return next();}

    try {
      const ChurchModel = getChurchModel();
      const churchExists = await ChurchModel.findById(churchId);
      if (!churchExists){ return next(new Error("Invalid Church reference. Church not found."));}
      next();
    } catch (err) {
      next(err);
    }
  });

  // ✅ Track previous pushToken
  schema.pre("save", function (next) {
    if (!this.isNew && this.isModified("pushToken")) {
      this._previousPushToken = this.get("pushToken");
    }
    next();
  });

  schema.pre("findOneAndUpdate", async function (next) {
    const update = this.getUpdate();
    const churchId = update.$set ? update.$set.church : null;
    if (!churchId) {return next();}

    try {
      const ChurchModel = getChurchModel();
      const churchExists = await ChurchModel.findById(churchId);
      if (!churchExists){ return next(new Error("Invalid Church reference in update. Church not found."));}
      next();
    } catch (err) {
      next(err);
    }
  });

  // ✅ Handle subscriptions/unsubscriptions
  schema.post("save", async function (doc) {
    const userId = doc._id;
    try {
      // Unsubscribe old token if changed
      if (this._previousPushToken && this._previousPushToken !== doc.pushToken) {
        const topics = await buildTopicsForUser(userId, doc.church);
        await TopicManager.unsubscribeTokenFromTopics(this._previousPushToken, topics);
        delete this._previousPushToken;
      }

      if (!doc.pushToken || doc.muteNotifications){ return;}

      const topics = await buildTopicsForUser(userId, doc.church);
      await TopicManager.subscribeTokenToTopics(doc.pushToken, topics);
      console.log(`[Hook:User:save] Subscribed user ${userId} to topics.`);
    } catch (err) {
      console.error(`[Hook:User:save] Subscription failed for user ${userId}:`, err.message);
    }
  });

  schema.post("findOneAndUpdate", async function (doc) {
    if (!doc){ return;}
    const userId = doc._id;

    try {
      const updatedDoc = await this.model.findById(userId).lean().exec();
      if (!updatedDoc){ return;}

      if (!updatedDoc.pushToken || updatedDoc.muteNotifications){ return;}

      const topics = await buildTopicsForUser(userId, updatedDoc.church);
      await TopicManager.subscribeTokenToTopics(updatedDoc.pushToken, topics);
      console.log(`[Hook:User:update] Subscribed user ${userId} to topics.`);
    } catch (err) {
      console.error(`[Hook:User:update] Subscription failed for user ${userId}:`, err.message);
    }
  });

  schema.post("findOneAndDelete", async function (doc) {
    if (!doc || !doc.pushToken){ return;}
    const userId = doc._id;

    try {
      const topics = await buildTopicsForUser(userId, doc.church);
      await TopicManager.unsubscribeTokenFromTopics(doc.pushToken, topics);
      console.log(`[Hook:User:delete] Unsubscribed user ${userId} from topics.`);
    } catch (err) {
      console.error(`[Hook:User:delete] Unsubscribe failed for user ${userId}:`, err.message);
    }
  });
}

module.exports = applyUserHooks;
