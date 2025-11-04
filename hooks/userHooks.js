// hooks/userHooks.js
const TopicManager = require("../common/push.helper");
let Church;

function getChurchModel() {
  if (!Church) {
    Church = require("../models/church");
  }
  return Church;
}

function applyUserHooks(schema) {

  schema.pre("save", async function (next) {
    if (!this.isNew && !this.isModified("church")) {
      return next();
    }

    const churchId = this.church;

    if (!churchId) {
      return next();
    }

    try {
      const ChurchModel = getChurchModel();
      const churchExists = await ChurchModel.findById(churchId);

      if (!churchExists) {
        return next(new Error("Invalid Church reference. Church not found."));
      }
      next();
    } catch (err) {
      return next(err);
    }
  });


  schema.pre("save", function (next) {
    if (!this.isNew && this.isModified("pushToken")) {
      this._previousPushToken = this.get("pushToken");
    }
    next();
  });

  schema.pre("findOneAndUpdate", async function (next) {

    const update = this.getUpdate();
    const churchId = update.$set ? update.$set.church : null;

    if (!churchId) {
      return next();
    }

    try {
      const ChurchModel = getChurchModel();
      const churchExists = await ChurchModel.findById(churchId);

      if (!churchExists) {
        return next(new Error("Invalid Church reference in update. Church not found."));
      }
      next();
    } catch (err) {
      return next(err);
    }
  });


  schema.post("save", async function (doc) {
    const userId = doc._id;

    try {
      if (this._previousPushToken) {
        if (this._previousPushToken !== doc.pushToken) {
            await TopicManager.unsubscribeUserFromAssignmentsByToken(
                this._previousPushToken,
                doc.church
            );
            delete this._previousPushToken;
        }
      }

      if (!doc.pushToken || doc.muteNotifications) {
        return; 
      }

      await TopicManager.subscribeUserToAssignments(userId, doc.church);
      console.log(`[Hook:User:save] Subscribed user ${userId} to topics.`);
    } catch (err) {
      console.error(`[Hook:User:save] Topic subscription/unsubscription failed for user ${userId}:`, err.message);
    }
  });

  schema.post("findOneAndUpdate", async function (doc) {
    if (!doc) {return;}

    const userId = doc._id;

    try {
      const updatedDoc = await this.model.findById(userId).lean().exec();

      if (!updatedDoc){ return;}

      const currentToken = updatedDoc.pushToken;
      const notificationsMuted = updatedDoc.muteNotifications;

      if (!currentToken || notificationsMuted) {
        return;
      }

      await TopicManager.subscribeUserToAssignments(userId, updatedDoc.church);
      console.log(`[Hook:User:findOneAndUpdate] Subscribed user ${userId} to topics.`);
    } catch (err) {
      console.error(`[Hook:User:findOneAndUpdate] Topic subscription failed for user ${userId}:`, err.message);
    }
  });

  schema.post("findOneAndDelete", async function (doc) {
    if (!doc || !doc.pushToken) {return;}

    const userId = doc._id;

    try {
      await TopicManager.unsubscribeUserFromAssignments(userId, doc.church);
      console.log(`[Hook:User:delete] Unsubscribed user ${userId} from topics.`);
    } catch (err) {
      console.error(`[Hook:User:delete] Topic unsubscribe failed for user ${userId}:`, err.message);
    }
  });
}

module.exports = applyUserHooks;