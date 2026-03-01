const express = require("express");
const Notifications = require("../models/notifications");
const Assignment = require("../models/assignment");
const NotificationRecipient = require("../models/notificationStatus");
const { validateNotification } = require("../middlewares/validators");
const { cacheRoute } = require("../middlewares/tenantCache");
const { del: delCache } = require("../common/cache");
const mongoose = require("mongoose");

const router = express.Router();
router.use(express.json());

/**
 * GET /list
 * Retrieve all notifications with their delivery status
 * Query params: limit (default 20), skip (default 0)
 */
router.get("/list", cacheRoute("notifications:list", 60), async (req, res) => {
  try {
    const church = req.church;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = parseInt(req.query.skip) || 0;

    // Get all notifications for this church, sorted by newest first
    const notifications = await Notifications.find({ church: church._id })
      .select({
        church: 1,
        author: 1,
        type: 1,
        provider: 1,
        status: 1,
        totalRecipients: 1,
        successCount: 1,
        failedCount: 1,
        "content.subject": 1,
        "content.body": 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Get status breakdown for each notification using aggregation
    const statusBreakdown = await NotificationRecipient.aggregate([
      {
        $match: {
          batchId: {
            $in: notifications.map((n) => n._id),
          },
        },
      },
      {
        $group: {
          _id: "$batchId",
          sent: {
            $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
          },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    // Create a map for quick lookup
    const statusMap = statusBreakdown.reduce((acc, item) => {
      acc[item._id.toString()] = {
        sent: item.sent || 0,
        delivered: item.delivered || 0,
        failed: item.failed || 0,
        pending: item.pending || 0,
      };
      return acc;
    }, {});

    // Enrich notifications with status breakdown
    const enrichedNotifications = notifications.map((notification) => ({
      ...notification,
      statusBreakdown: statusMap[notification._id.toString()] || {
        sent: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
      },
    }));

    const total = await Notifications.countDocuments({ church: church._id });

    res.json({
      notifications: enrichedNotifications,
      pagination: {
        limit,
        skip,
        total,
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications list:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});


async function getUserTopicIds(userId, churchId) {
  const assignments = await Assignment.find({
    userId,
    status: "approved",
  }).lean();

  const topicIds = [`church_${churchId.toString()}`];
  assignments.forEach((a) => {
    if (a.ministryId) {
      topicIds.push(`ministry_${a.ministryId.toString()}`);
    }
    if (a.fellowshipId) {
      topicIds.push(`fellowship_${a.fellowshipId.toString()}`);
    }
  });

  return Array.from(new Set(topicIds));
}

router.post("/batch", validateNotification(), async (req, res) => {
  try {
    const { notificationQueue } = require("../common/job.queue");
    const church = req.church;
    const {
      author,
      recipientType,
      type,
      provider,
      recipients,
      content,
      useToken,
    } = req.body;

    let targetType;
    let recipientList = [];
    let totalRecipients = 0;

    if (provider === "firebase") {
      targetType = useToken ? "tokens" : "topic";
      recipientList = Array.isArray(recipients) ? recipients : [recipients];
      totalRecipients = Array.isArray(recipients) ? recipients.length : 1;
    } else if (provider === "sendpulse") {
      if (!Array.isArray(recipients)) {
        return res
          .status(400)
          .json({ error: "SendPulse recipients must be an array of emails." });
      }
      /**lets create a method to get email  base on recipientType
       * All will search the user table directly
       * leaders, ministry and fallowhips will get ids from assignment and ge emails from user collection
       */
      targetType = "emails";
      recipientList = recipients;
      totalRecipients = recipients.length;
    } else {
      return res.status(400).json({ error: "Invalid provider specified." });
    }

    const batchJob = await Notifications.create({
      church: church._id,
      author,
      type,
      provider,
      totalRecipients,
      content,
      status: "queued",
    });

    await notificationQueue.add("sendBatch", {
      batchId: batchJob._id,
      recipients: recipients,
      content,
      provider,
      targetType,
      recipientType,
    });

    const recipientDocs = recipientList.map((r) => ({
      batchId: batchJob._id,
      recipient: r,
      status: "sent",
    }));
    await NotificationRecipient.insertMany(recipientDocs);

    // Invalidate notifications list cache
    await delCache(req, `notifications:list`);

    res.status(202).json({
      message: "Notifications scheduled successfully",
      batchId: batchJob._id,
    });
  } catch (error) {
    console.error("Batch job initiation error:", error);
    res.status(500).json({ error: "Failed to initiate notification job" });
  }
});

router.get("/status/:batchId", async (req, res) => {
  const { batchId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    return res.status(400).json({ error: "Invalid job identifier provided" });
  }
  const batchStatus = await Notifications.findById(batchId).select("-content").lean();
  if (!batchStatus) {
    return res.status(404).json({ message: "Batch not found" });
  }
  const failedRecipients = await NotificationRecipient.find({
    batchId,
    status: "failed",
  }).select("recipient status details providerMessageId -_id").lean();

  res.json({
    ...batchStatus.toObject(),
    failedRecipients: failedRecipients,
  });
});

router.get("/missed", async (req, res) => {
  try {
    const { userId, since } = req.query;
    const church = req.church;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId provided" });
    }

    // Normalize sinceDate
    const sinceDate = since && !isNaN(Date.parse(since)) ? new Date(since)  : new Date(0);
    const userTopicIds = await getUserTopicIds(userId, church._id);

    if (!userTopicIds.length) {
      return res.status(200).json([]); // return empty array for FE compatibility
    }

    const notifications = await Notifications.find({
      createdAt: { $gt: sinceDate },
      "content.data.topicIds": { $in: userTopicIds },
    })
      .sort({ createdAt: -1 })
      .select({
        "content.data.id": 1,
        "content.data.topicIds": 1,
        "content.data.topicNames": 1,
        "content.data.notification.title": 1,
        "content.data.notification.body": 1,
        createdAt: 1,
      })
      .lean();

    // Deduplicate based on message ID
    const unique = [];
    const seen = new Set();

    for (const n of notifications) {
      const id = n?.content?.data?.id;
      if (!id || seen.has(id)) {continue;}
      seen.add(id);

      unique.push({
        id,
        title: n.content.data.notification.title,
        body: n.content.data.notification.body,
        topicIds: n.content.data.topicIds,
        topicNames: n.content.data.topicNames,
        date: n.createdAt,
      });
    }

    return res.status(200).json(unique);

  } catch (err) {
    console.error("Error fetching missed notifications:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/topics/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const church = req.church;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ error: "Invalid user identifier provided" });
    }

    const topicIds = [`church_${church._id.toString()}`];
    const assignments = await Assignment.find({
      userId,
      status: "approved",
    }).lean();

    assignments.forEach((a) => {
      if (a.ministryId) {
        topicIds.push(`ministry_${a.ministryId.toString()}`);
      }
      if (a.fellowshipId) {
        topicIds.push(`fellowship_${a.fellowshipId.toString()}`);
      }
    });

    const topicSet = Array.from(new Set(topicIds));

    res.status(200).json({ topicIds: topicSet });
  } catch (err) {
    console.error("Error fetching user topics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
