const mongoose = require('mongoose');

const { deleteFile } = require('./upload');

const Church = require('../models/church');
const User = require('../models/user');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');
const Assignment = require('../models/assignment');
const Kid = require('../models/kid');
const CheckIn = require('../models/checkin');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const EventScheduleTemplate = require('../models/eventScheduleTemplate');
const Schedule = require('../models/schedule');
const ScheduleRole = require('../models/scheduleRole');
const Venue = require('../models/venue');
const Devotion = require('../models/devotion');
const Prayer = require('../models/prayer');
const Testimony = require('../models/testimony');
const Subscription = require('../models/subscription');
const Settings = require('../models/settings');
const Payment = require('../models/payment');
const Notifications = require('../models/notifications');
const NotificationStatus = require('../models/notificationStatus');
const Verification = require('../models/verification');
const Donation = require('../models/donations');
const DonationItem = require('../models/donationItems');
const DonationPlan = require('../models/donationPlans');

function collectVerificationUrls(verificationDocs = []) {
  const urls = [];
  for (const entry of verificationDocs) {
    if (entry?.governmentId?.fileUrl) {
      urls.push(entry.governmentId.fileUrl);
    }
    if (entry?.registrationProof?.fileUrl) {
      urls.push(entry.registrationProof.fileUrl);
    }
    if (Array.isArray(entry?.supportingDocs)) {
      entry.supportingDocs.forEach((doc) => {
        if (doc?.fileUrl) {
          urls.push(doc.fileUrl);
        }
      });
    }
  }
  return urls;
}

async function cleanupChurchData(churchId, options = {}) {
  const { previewOnly = false } = options;
  if (!mongoose.Types.ObjectId.isValid(churchId)) {
    throw new Error('Invalid church identifier provided');
  }

  const churchObjectId = new mongoose.Types.ObjectId(churchId);

  const session = await mongoose.startSession();
  let summary = null;
  let fileUrls = new Set();

  try {
    session.startTransaction();

    const church = await Church.findById(churchObjectId).session(session).lean();
    if (!church) {
      await session.abortTransaction();
      return { deleted: false, reason: 'not_found' };
    }

    const [
      users,
      ministries,
      fellowships,
      events,
      eventInstances,
      devotions,
      donationItems,
      verifications,
      notifications
    ] = await Promise.all([
      User.find({ church: churchObjectId }).select('_id photoUrl').session(session).lean(),
      Ministry.find({ church: churchObjectId }).select('_id').session(session).lean(),
      Fellowship.find({ church: churchObjectId }).select('_id').session(session).lean(),
      Event.find({ church: churchObjectId }).select('_id flier').session(session).lean(),
      EventInstance.find({ church: churchObjectId }).select('_id flier').session(session).lean(),
      Devotion.find({ church: churchObjectId }).select('_id image').session(session).lean(),
      DonationItem.find({ churchId: churchObjectId }).select('_id imageUrl').session(session).lean(),
      Verification.find({ churchId: churchObjectId }).session(session).lean(),
      Notifications.find({ church: churchObjectId }).select('_id').session(session).lean()
    ]);

    const userIds = users.map((item) => item._id);
    const ministryIds = ministries.map((item) => item._id);
    const fellowshipIds = fellowships.map((item) => item._id);
    const eventInstanceIds = eventInstances.map((item) => item._id);
    const notificationIds = notifications.map((item) => item._id);

    const assignmentOrConditions = [
      ministryIds.length ? { ministryId: { $in: ministryIds } } : null,
      fellowshipIds.length ? { fellowshipId: { $in: fellowshipIds } } : null,
      userIds.length ? { userId: { $in: userIds } } : null
    ].filter(Boolean);

    const kids = userIds.length
      ? await Kid.find({ parent: { $in: userIds } }).select('_id').session(session).lean()
      : [];
    const kidIds = kids.map((item) => item._id);

    fileUrls = new Set();
    if (church.logo) {
      fileUrls.add(church.logo);
    }

    users.forEach((item) => {
      if (item.photoUrl) {
        fileUrls.add(item.photoUrl);
      }
    });

    events.forEach((item) => {
      if (item.flier) {
        fileUrls.add(item.flier);
      }
    });

    eventInstances.forEach((item) => {
      if (item.flier) {
        fileUrls.add(item.flier);
      }
    });

    devotions.forEach((item) => {
      if (item.image) {
        fileUrls.add(item.image);
      }
    });

    donationItems.forEach((item) => {
      if (item.imageUrl) {
        fileUrls.add(item.imageUrl);
      }
    });

    collectVerificationUrls(verifications).forEach((url) => fileUrls.add(url));

    summary = {
      users: userIds.length,
      ministries: ministryIds.length,
      fellowships: fellowshipIds.length,
      events: events.length,
      eventInstances: eventInstanceIds.length,
      deletedFilesAttempted: fileUrls.size
    };

    if (previewOnly) {
      await session.abortTransaction();
      return {
        deleted: false,
        preview: true,
        summary
      };
    }

    const deleteTasks = [
      assignmentOrConditions.length ? Assignment.deleteMany({ $or: assignmentOrConditions }, { session }) : Promise.resolve(),
      kidIds.length ? CheckIn.deleteMany({ child: { $in: kidIds } }, { session }) : Promise.resolve(),
      kidIds.length ? Kid.deleteMany({ _id: { $in: kidIds } }, { session }) : Promise.resolve(),
      notificationIds.length ? NotificationStatus.deleteMany({ batchId: { $in: notificationIds } }, { session }) : Promise.resolve(),
      Notifications.deleteMany({ church: churchObjectId }, { session }),
      Schedule.deleteMany({ church: churchObjectId }, { session }),
      EventScheduleTemplate.deleteMany({ church: churchObjectId }, { session }),
      ScheduleRole.deleteMany({ church: churchObjectId }, { session }),
      Prayer.deleteMany({ church: churchObjectId }, { session }),
      Testimony.deleteMany({ church: churchObjectId }, { session }),
      Devotion.deleteMany({ church: churchObjectId }, { session }),
      Subscription.deleteMany({ church: churchObjectId }, { session }),
      Settings.deleteMany({ church: churchObjectId }, { session }),
      Payment.deleteMany({ church: churchObjectId }, { session }),
      Donation.deleteMany({ churchId: churchObjectId }, { session }),
      DonationItem.deleteMany({ churchId: churchObjectId }, { session }),
      DonationPlan.deleteMany({ churchId: churchObjectId }, { session }),
      Verification.deleteMany({ churchId: churchObjectId }, { session }),
      userIds.length ? User.deleteMany({ _id: { $in: userIds } }, { session }) : Promise.resolve(),
      EventInstance.deleteMany({ church: churchObjectId }, { session }),
      Event.deleteMany({ church: churchObjectId }, { session }),
      Ministry.deleteMany({ church: churchObjectId }, { session }),
      Fellowship.deleteMany({ church: churchObjectId }, { session }),
      Venue.deleteMany({ church: churchObjectId }, { session })
    ];

    await Promise.all(deleteTasks);
    await Church.findByIdAndDelete(churchObjectId, { session });

    await session.commitTransaction();
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const fileDeleteResults = await Promise.allSettled(Array.from(fileUrls).map((url) => deleteFile(url)));
  const fileDeleteFailures = fileDeleteResults.filter((item) => item.status === 'rejected').length;

  return {
    deleted: true,
    preview: false,
    summary: {
      ...summary,
      fileDeleteFailures
    }
  };
}

module.exports = {
  cleanupChurchData
};
