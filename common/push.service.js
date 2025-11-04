const { messaging } = require('../common/firebase');
const Assignment = require('../models/assignment');
const User = require('../models/user');

function TopicManager() {}

TopicManager.topics = {
  church: function (churchId) {
    return 'church_' + churchId;
  },
  leaders: function (churchId) {
    return 'church_' + churchId + '_leaders';
  },
  ministry: function (ministryId) {
    return 'ministry_' + ministryId;
  },
  fellowship: function (fellowshipId) {
    return 'fellowship_' + fellowshipId;
  },
};

/**
 * Subscribe a user to all topics related to their assignments and church
 */
TopicManager.subscribeUserToAssignments = function (userId, churchId) {
  return User.findById(userId)
    .then(function (user) {
      if (!user || !user.pushToken) {return;}
      var token = user.pushToken;
      return Assignment.find({ userId: userId, churchId: churchId }).then(function (assignments) {
        var topics = new Set([TopicManager.topics.church(churchId)]);

        assignments.forEach(function (assignment) {
          if (assignment.ministryId) {topics.add(TopicManager.topics.ministry(assignment.ministryId));}
          if (assignment.fellowshipId) {topics.add(TopicManager.topics.fellowship(assignment.fellowshipId));}
          if (assignment.role === 'leader') {topics.add(TopicManager.topics.leaders(churchId));}
        });

        var promises = [];
        topics.forEach(function (topic) {
          promises.push(
            messaging
              .subscribeToTopic(token, topic)
              .then(function () {
                console.log('✅ User ' + userId + ' subscribed to ' + topic);
              })
              .catch(function (err) {
                console.error('❌ Failed to subscribe ' + userId + ' to ' + topic + ':', err.message);
              })
          );
        });

        return Promise.all(promises);
      });
    })
    .catch(function (err) {
      console.error('[TopicManager.subscribeUserToAssignments] Error:', err.message);
    });
};

/**
 * Unsubscribe a user from all topics related to their assignments and church
 */
TopicManager.unsubscribeUserFromAssignments = function (userId, churchId) {
  return User.findById(userId)
    .then(function (user) {
      if (!user || !user.pushToken) {return;}
      let token = user.pushToken;
      return Assignment.find({ userId: userId, churchId: churchId }).then(function (assignments) {
        var topics = new Set([TopicManager.topics.church(churchId)]);

        assignments.forEach(function (assignment) {
          if (assignment.ministryId) {topics.add(TopicManager.topics.ministry(assignment.ministryId));}
          if (assignment.fellowshipId){ topics.add(TopicManager.topics.fellowship(assignment.fellowshipId));}
          if (assignment.role === 'leader'){ topics.add(TopicManager.topics.leaders(churchId));}
        });

        let promises = [];
        topics.forEach(function (topic) {
          promises.push(
            messaging
              .unsubscribeFromTopic(token, topic)
              .then(function () {
                console.log('🚫 User ' + userId + ' unsubscribed from ' + topic);
              })
              .catch(function (err) {
                console.error('❌ Failed to unsubscribe ' + userId + ' from ' + topic + ':', err.message);
              })
          );
        });

        return Promise.all(promises);
      });
    })
    .catch(function (err) {
      console.error('[TopicManager.unsubscribeUserFromAssignments] Error:', err.message);
    });
};

/**
 * Logically remove a group's topic (used when a ministry/fellowship is deleted)
 */
TopicManager.removeGroupTopic = function (groupType, groupId) {
  var topic =
    groupType === 'ministry' ? TopicManager.topics.ministry(groupId) : TopicManager.topics.fellowship(groupId);
  console.log('🧹 Topic logically removed: ' + topic);
};

/**
 * Subscribe/unsubscribe user from leader topic when role changes
 */
TopicManager.updateUserRole = function (userId, churchId, newRole) {
  return User.findById(userId)
    .then(function (user) {
      if (!user || !user.pushToken) {return;}
      var token = user.pushToken;
      var leaderTopic = TopicManager.topics.leaders(churchId);

      if (newRole === 'leader') {
        return messaging.subscribeToTopic(token, leaderTopic).then(function () {
          console.log('✅ User ' + userId + ' added to leader topic');
        });
      } else {
        return messaging.unsubscribeFromTopic(token, leaderTopic).then(function () {
          console.log('🚫 User ' + userId + ' removed from leader topic');
        });
      }
    })
    .catch(function (err) {
      console.error('[TopicManager.updateUserRole] Error:', err.message);
    });
};

module.exports = TopicManager;
