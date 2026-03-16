const mongoose = require('mongoose');

const { deleteFile } = require('./upload');
const { del: delCache } = require('./cache');

const User = require('../models/user');
const Assignment = require('../models/assignment');
const Schedule = require('../models/schedule');
const AvailabilityBlock = require('../models/availabilityBlock');
const Donation = require('../models/donations');
const Payment = require('../models/payment');
const Kid = require('../models/kid');
const CheckIn = require('../models/checkin');
const Prayer = require('../models/prayer');
const Devotion = require('../models/devotion');
const Testimony = require('../models/testimony');
const CallSession = require('../models/callSession');
const ChatMessage = require('../models/chatMessage');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');
const Church = require('../models/church');
const Event = require('../models/event');
const Events = require('../models/events');
const EventScheduleTemplate = require('../models/eventScheduleTemplate');
const ScheduleRole = require('../models/scheduleRole');

function buildCheckInFilter(userObjectId, kidIds) {
  const conditions = [
    { requestedBy: userObjectId },
    { 'children.droppedOffBy': userObjectId },
    { 'children.pickedUpBy': userObjectId }
  ];

  if (kidIds.length) {
    conditions.push({ 'children.child': { $in: kidIds } });
  }

  return { $or: conditions };
}

function compactObject(obj) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

async function cleanupUserData(userId, options = {}) {
  const { previewOnly = false } = options;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user identifier provided');
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const session = await mongoose.startSession();

  let summary = null;
  let fileUrls = new Set();
  let userChurchId = null;

  try {
    session.startTransaction();

    const user = await User.findById(userObjectId)
      .select('_id church photoUrl')
      .session(session)
      .lean();

    if (!user) {
      await session.abortTransaction();
      return { deleted: false, reason: 'not_found' };
    }

    userChurchId = user.church ? user.church.toString() : null;

    const [kids, devotions] = await Promise.all([
      Kid.find({ parent: userObjectId }).select('_id').session(session).lean(),
      Devotion.find({ author: userObjectId }).select('_id image').session(session).lean()
    ]);

    const kidIds = kids.map((item) => item._id);
    const checkInFilter = buildCheckInFilter(userObjectId, kidIds);

    const [
      assignmentsCount,
      schedulesCount,
      availabilityBlocksCount,
      donationsCount,
      paymentsCount,
      checkInsCount,
      prayersCount,
      testimoniesCount,
      initiatedCallSessionsCount,
      participantCallSessionsCount,
      answeredCallSessionsCount,
      endedCallSessionsCount,
      sentChatMessagesCount,
      participantChatMessagesCount,
      readByChatMessagesCount,
      ministriesLedCount,
      fellowshipsLedCount,
      churchesOwnedCount,
      eventsCreatedCount,
      recurringEventsCreatedCount,
      scheduleTemplatesCreatedCount,
      scheduleRolesCreatedCount
    ] = await Promise.all([
      Assignment.countDocuments({ userId: userObjectId }).session(session),
      Schedule.countDocuments({
        $or: [{ userId: userObjectId }, { assignedBy: userObjectId }]
      }).session(session),
      AvailabilityBlock.countDocuments({ userId: userObjectId }).session(session),
      Donation.countDocuments({ userId: userObjectId }).session(session),
      Payment.countDocuments({ user: userObjectId }).session(session),
      CheckIn.countDocuments(checkInFilter).session(session),
      Prayer.countDocuments({ author: userObjectId }).session(session),
      Testimony.countDocuments({ author: userObjectId }).session(session),
      CallSession.countDocuments({ initiatedBy: userObjectId }).session(session),
      CallSession.countDocuments({ initiatedBy: { $ne: userObjectId }, participants: userObjectId }).session(session),
      CallSession.countDocuments({ answeredBy: userObjectId }).session(session),
      CallSession.countDocuments({ endedBy: userObjectId }).session(session),
      ChatMessage.countDocuments({ sender: userObjectId }).session(session),
      ChatMessage.countDocuments({ sender: { $ne: userObjectId }, participants: userObjectId }).session(session),
      ChatMessage.countDocuments({ readBy: userObjectId }).session(session),
      Ministry.countDocuments({ leaderId: userObjectId }).session(session),
      Fellowship.countDocuments({ leaderId: userObjectId }).session(session),
      Church.countDocuments({ createdBy: userObjectId }).session(session),
      Event.countDocuments({ createdBy: userObjectId }).session(session),
      Events.countDocuments({ createdBy: userObjectId }).session(session),
      EventScheduleTemplate.countDocuments({ createdBy: userObjectId }).session(session),
      ScheduleRole.countDocuments({ createdBy: userObjectId }).session(session)
    ]);

    fileUrls = new Set();
    if (user.photoUrl) {
      fileUrls.add(user.photoUrl);
    }
    devotions.forEach((entry) => {
      if (entry.image) {
        fileUrls.add(entry.image);
      }
    });

    const blockingReferences = compactObject({
      churchesOwned: churchesOwnedCount,
      eventsCreated: eventsCreatedCount,
      recurringEventsCreated: recurringEventsCreatedCount,
      scheduleTemplatesCreated: scheduleTemplatesCreatedCount,
      scheduleRolesCreated: scheduleRolesCreatedCount
    });

    summary = {
      users: 1,
      assignments: assignmentsCount,
      schedules: schedulesCount,
      availabilityBlocks: availabilityBlocksCount,
      donations: donationsCount,
      payments: paymentsCount,
      kids: kidIds.length,
      checkIns: checkInsCount,
      prayers: prayersCount,
      devotions: devotions.length,
      testimonies: testimoniesCount,
      callSessionsInitiated: initiatedCallSessionsCount,
      callSessionsParticipantRefsRemoved: participantCallSessionsCount,
      callSessionsAnsweredRefsCleared: answeredCallSessionsCount,
      callSessionsEndedRefsCleared: endedCallSessionsCount,
      chatMessagesSent: sentChatMessagesCount,
      chatParticipantsRefsRemoved: participantChatMessagesCount,
      chatReadByRefsRemoved: readByChatMessagesCount,
      ministriesLedReassignedToNull: ministriesLedCount,
      fellowshipsLedReassignedToNull: fellowshipsLedCount,
      cacheInvalidations: userChurchId ? 1 : 0,
      deletedFilesAttempted: fileUrls.size,
      blockingReferences,
      hasBlockingReferences: Object.keys(blockingReferences).length > 0
    };

    if (previewOnly) {
      await session.abortTransaction();
      return {
        deleted: false,
        preview: true,
        summary
      };
    }

    if (summary.hasBlockingReferences) {
      await session.abortTransaction();
      return {
        deleted: false,
        preview: false,
        blocked: true,
        summary
      };
    }

    const deleteTasks = [
      assignmentsCount ? Assignment.deleteMany({ userId: userObjectId }, { session }) : Promise.resolve(),
      schedulesCount ? Schedule.deleteMany({ $or: [{ userId: userObjectId }, { assignedBy: userObjectId }] }, { session }) : Promise.resolve(),
      availabilityBlocksCount ? AvailabilityBlock.deleteMany({ userId: userObjectId }, { session }) : Promise.resolve(),
      donationsCount ? Donation.deleteMany({ userId: userObjectId }, { session }) : Promise.resolve(),
      paymentsCount ? Payment.deleteMany({ user: userObjectId }, { session }) : Promise.resolve(),
      checkInsCount ? CheckIn.deleteMany(checkInFilter, { session }) : Promise.resolve(),
      kidIds.length ? Kid.deleteMany({ _id: { $in: kidIds } }, { session }) : Promise.resolve(),
      prayersCount ? Prayer.deleteMany({ author: userObjectId }, { session }) : Promise.resolve(),
      devotions.length ? Devotion.deleteMany({ author: userObjectId }, { session }) : Promise.resolve(),
      testimoniesCount ? Testimony.deleteMany({ author: userObjectId }, { session }) : Promise.resolve(),
      initiatedCallSessionsCount ? CallSession.deleteMany({ initiatedBy: userObjectId }, { session }) : Promise.resolve(),
      participantCallSessionsCount ? CallSession.updateMany({ initiatedBy: { $ne: userObjectId }, participants: userObjectId }, { $pull: { participants: userObjectId } }, { session }) : Promise.resolve(),
      answeredCallSessionsCount ? CallSession.updateMany({ answeredBy: userObjectId }, { $unset: { answeredBy: 1, answeredAt: 1 } }, { session }) : Promise.resolve(),
      endedCallSessionsCount ? CallSession.updateMany({ endedBy: userObjectId }, { $unset: { endedBy: 1, endedAt: 1, endReason: 1 } }, { session }) : Promise.resolve(),
      sentChatMessagesCount ? ChatMessage.deleteMany({ sender: userObjectId }, { session }) : Promise.resolve(),
      participantChatMessagesCount ? ChatMessage.updateMany({ sender: { $ne: userObjectId }, participants: userObjectId }, { $pull: { participants: userObjectId } }, { session }) : Promise.resolve(),
      readByChatMessagesCount ? ChatMessage.updateMany({ readBy: userObjectId }, { $pull: { readBy: userObjectId } }, { session }) : Promise.resolve(),
      ministriesLedCount ? Ministry.updateMany({ leaderId: userObjectId }, { $unset: { leaderId: 1 } }, { session }) : Promise.resolve(),
      fellowshipsLedCount ? Fellowship.updateMany({ leaderId: userObjectId }, { $unset: { leaderId: 1 } }, { session }) : Promise.resolve()
    ];

    await Promise.all(deleteTasks);
    await User.findByIdAndDelete(userObjectId, { session });

    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const fileDeleteResults = await Promise.allSettled(
    Array.from(fileUrls).map((url) => deleteFile(url))
  );
  const fileDeleteFailures = fileDeleteResults.filter((item) => item.status === 'rejected').length;

  let cacheInvalidationFailures = 0;
  if (userChurchId) {
    try {
      await delCache(userChurchId, 'users:list');
    } catch (cacheError) {
      cacheInvalidationFailures = 1;
      console.error('Failed to invalidate users:list cache after user cleanup:', cacheError);
    }
  }

  return {
    deleted: true,
    preview: false,
    summary: {
      ...summary,
      fileDeleteFailures,
      cacheInvalidationFailures
    }
  };
}

module.exports = {
  cleanupUserData
};
