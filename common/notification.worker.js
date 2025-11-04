// notification.worker.js (Revised for Start-up Integration)
const { Worker } = require("bullmq");
const User = require("../models/user");
const connection = require("./redis.connection");
const Notifications = require("../models/notifications");
const NotificationStatus = require("../models/notificationStatus");
const {
  sendPushNotification,
  sendEmailBatch,
} = require("./notification.service");

// The core worker logic function (kept separate for clarity)
const startNotificationWorker = () => {
  // Define the Worker instance here
  const worker = new Worker(
    "notificationBatchQueue",
    async (job) => {
      const {
        batchId,
        recipients,
        content,
        provider,
        targetType,
        recipientType,
      } = job.data;

      await Notifications.findByIdAndUpdate(batchId, { status: "processing" });

      let successCount = 0;
      let failedCount = 0;
      const updates = [];

      if (provider === "firebase") {
        const firebaseResponse = await sendPushNotification(
          recipients,
          content,
          targetType === "tokens"
        );

        if (targetType === "tokens") {
          const users = await User.find({ _id: { $in: recipients } })
            .select("pushToken muteNotifications")
            .lean();
          const userMap = {};
          users.forEach((u) => {
            userMap[u._id.toString()] = u;
          });

          firebaseResponse.responses.forEach((response, index) => {
            const recipientId = recipients[index].toString();
            const user = userMap[recipientId];

            if (!user || user.muteNotifications) {
              updates.push({
                recipient: recipientId,
                status: "muted",
                details: { message: "User has muted notifications" },
                providerMessageId: null,
              });
              return;
            }

            const status = response.success ? "success" : "failed";
            const details = response.success ? { message: "FCM sent successfully" } : { error: response.error.message };
            const providerMessageId = response.messageId || null;

            updates.push({
              recipient: recipientId,
              status,
              details,
              providerMessageId,
            });
            if (status === "success") {
              successCount++;
            } else {
              failedCount++;
            }
          });
        } else if (targetType === "topic") {
          if (Array.isArray(firebaseResponse)) {
            firebaseResponse.forEach((response) => {
              if (response.success) {
                successCount++;
                updates.push({
                  recipient: response.topic,
                  status: "success",
                  details: {
                    message: "FCM Topic broadcast initiated successfully.",
                  },
                  providerMessageId: response.messageId,
                });
              } else {
                failedCount++;
                updates.push({
                  recipient: response.topic,
                  status: "failed",
                  details: { error: response.error },
                  providerMessageId: null,
                });
                console.log("Topic send failed for:", response.topic, {
                  error: response.error,
                });
              }
            });
          } else {
            if (firebaseResponse.success) {
              successCount = 1;
              updates.push({
                recipient: recipients,
                status: "success",
                details: {
                  message: "FCM Topic broadcast initiated successfully.",
                },
                providerMessageId: firebaseResponse.messageId,
              });
            } else {
              failedCount = 1;
              updates.push({
                recipient: recipients,
                status: "failed",
                details: { error: firebaseResponse.error },
                providerMessageId: null,
              });
              console.log({ firebaseResponse });
            }
          }
        }
      } else if (provider === "sendpulse") {
        // ... (SendPulse logic remains the same)
        const sendpulseResponses = await sendEmailBatch(
          recipients,
          content,
          recipientType
        );

        sendpulseResponses.forEach((res) => {
          const status = res.success ? "sent" : "failed";
          const details = res.success ? null : { error: res.error };
          const providerMessageId = res.success ? res.messageId : null;
          const recipientId = res.email;

          updates.push({
            recipient: recipientId,
            status,
            details,
            providerMessageId,
          });
          if (status !== "failed") {
            successCount++;
          } else {
            failedCount++;
          }
        });
      }

      const bulkOps = updates.map((u) => ({
        updateOne: {
          filter: { batchId, recipient: u.recipient },
          update: {
            $set: {
              status: u.status,
              details: u.details,
              providerMessageId: u.providerMessageId,
              deliveryTime: new Date(),
            },
            upsert: true,
          },
        },
      }));
      await NotificationStatus.bulkWrite(bulkOps);

      // Final status update (completed or completed_with_errors)
      await Notifications.findByIdAndUpdate(batchId, {
        $set: {
          status: failedCount > 0 ? "completed_with_errors" : "completed",
        },
        $inc: { successCount, failedCount },
      });
    },
    { connection }
  );

  // Add logging and error handling
  worker.on("ready", () =>
    console.log(
      "✅ Notification Worker connected to Redis and waiting for jobs."
    )
  );
  worker.on("failed", (job, err) =>
    console.error(`❌ Job ${job.id} failed in worker:`, err.message)
  );

  console.log("Notification Worker started, waiting for jobs...");
  return worker;
};

// --- Export the function ---
module.exports = {
  start: startNotificationWorker,
};
