// common/push.helper.js
const { messaging } = require('./firebase');
const Assignment = require('../models/assignment');
const User = require('../models/user');

const TopicManager = {
  topics: {
    church: (churchId) => `church_${churchId}`,
    leaders: (churchId) => `church_${churchId}_leaders`,
    ministry: (ministryId) => `ministry_${ministryId}`,
    fellowship: (fellowshipId) => `fellowship_${fellowshipId}`,
  },

  /**
   * Subscribe a user to all topics based on assignments
   * Respects global mute
   */
  subscribeUserToAssignments: async function(userId, churchId) {
    const user = await User.findById(userId);
    if (!user?.pushToken){ return;}
    if (user.muteNotifications) {return; }// skip muted users

    const token = user.pushToken;
    const assignments = await Assignment.find({ userId, churchId });

    const topics = new Set([this.topics.church(churchId)]);
    for (const assignment of assignments) {
      if (assignment.ministryId) {topics.add(this.topics.ministry(assignment.ministryId));}
      if (assignment.fellowshipId) {topics.add(this.topics.fellowship(assignment.fellowshipId));}
      if (assignment.role === 'leader') {topics.add(this.topics.leaders(churchId));}
    }

    for (const topic of topics) {
      try {
        await messaging.subscribeToTopic(token, topic);
        console.log(`✅ User ${userId} subscribed to ${topic}`);
      } catch (err) {
        console.error(`❌ Failed to subscribe ${userId} to ${topic}:`, err.message);
      }
    }
  },

  /**
   * Unsubscribe a user from all topics based on assignments
   */
  unsubscribeUserFromAssignments: async function(userId, churchId) {
    const user = await User.findById(userId);
    if (!user?.pushToken) {return;}

    const token = user.pushToken;
    const assignments = await Assignment.find({ userId, churchId });

    const topics = new Set([this.topics.church(churchId)]);
    for (const assignment of assignments) {
      if (assignment.ministryId) {topics.add(this.topics.ministry(assignment.ministryId));}
      if (assignment.fellowshipId) {topics.add(this.topics.fellowship(assignment.fellowshipId));}
      if (assignment.role === 'leader') {topics.add(this.topics.leaders(churchId));}
    }

    for (const topic of topics) {
      try {
        await messaging.unsubscribeFromTopic(token, topic);
        console.log(`🚫 User ${userId} unsubscribed from ${topic}`);
      } catch (err) {
        console.error(`❌ Failed to unsubscribe ${userId} from ${topic}:`, err.message);
      }
    }
  },

  /**
   * Unsubscribe a **specific token** (used when pushToken changes)
   */
  unsubscribeUserFromAssignmentsByToken: async function(token, churchId) {
    if (!token) {return;}
    const assignments = await Assignment.find({ churchId });
    const topics = new Set([this.topics.church(churchId)]);
    for (const assignment of assignments) {
      if (assignment.ministryId) {topics.add(this.topics.ministry(assignment.ministryId));}
      if (assignment.fellowshipId) {topics.add(this.topics.fellowship(assignment.fellowshipId));}
      if (assignment.role === 'leader') {topics.add(this.topics.leaders(churchId));}
    }

    for (const topic of topics) {
      try {
        await messaging.unsubscribeFromTopic(token, topic);
        console.log(`🚫 Token unsubscribed from ${topic}`);
      } catch (err) {
        console.error(`❌ Failed unsubscribing token from ${topic}:`, err.message);
      }
    }
  },

  /**
   * Remove a group topic (logical removal only)
   */
  removeGroupTopic: async function(groupType, groupId) {
    const topic = groupType === 'ministry' ? this.topics.ministry(groupId) : this.topics.fellowship(groupId);
    const query = groupType === 'ministry' ? { ministryId: groupId } : { fellowshipId: groupId };

    const assignments = await Assignment.find(query).populate('userId');
    for (const assignment of assignments) {
      const user = assignment.userId;
      if (user?.pushToken) {
        try {
          await messaging.unsubscribeFromTopic(user.pushToken, topic);
          console.log(`🚫 Unsubscribed user ${user._id} from deleted topic ${topic}`);
        } catch (err) {
          console.error(`❌ Failed to unsubscribe user ${user._id}:`, err.message);
        }
      }
    }

    console.log(`🧹 Topic logically removed: ${topic}`);
  },

  /**
   * Update leader role for a user
   */
  updateUserRole: async function(userId, churchId, newRole) {
    const user = await User.findById(userId);
    if (!user?.pushToken) {return;}

    const token = user.pushToken;
    const leaderTopic = this.topics.leaders(churchId);

    try {
      if (newRole === 'leader') {
        await messaging.subscribeToTopic(token, leaderTopic);
      } else {
        await messaging.unsubscribeFromTopic(token, leaderTopic);
      }
    } catch (err) {
      console.error(`❌ Failed to update leader topic for user ${userId}:`, err.message);
    }
  }
};

module.exports = TopicManager;