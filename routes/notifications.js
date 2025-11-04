const express = require('express');
const Notifications = require('../models/notifications');
const NotificationRecipient = require('../models/notificationStatus');
const { validateNotification } = require('../middlewares/validators');
const mongoose = require('mongoose');

const router = express.Router();
router.use(express.json());

router.post('/batch', validateNotification(),  async (req, res) => {
  try {
    const {notificationQueue} = require('../common/job.queue');
    const church = req.church;
    const { author, recipientType, type, provider, recipients, content, useToken } = req.body;

    let targetType;
    let recipientList = [];
    let totalRecipients = 0;

    if (provider === 'firebase') {
      targetType = useToken ? 'tokens' : 'topic';
      recipientList = Array.isArray(recipients)  ? recipients : [recipients];
      totalRecipients = Array.isArray(recipients) ? recipients.length : 1;
    } else if (provider === 'sendpulse') {
      if (!Array.isArray(recipients)) {
        return res
          .status(400)
          .json({ error: 'SendPulse recipients must be an array of emails.' });
      }
      /**lets create a method to get email  base on recipientType
       * All will search the user table directly
       * leaders, ministry and fallowhips will get ids from assignment and ge emails from user collection
      */
      targetType = 'emails';
      recipientList = recipients;
      totalRecipients = recipients.length;
    } else {
      return res.status(400).json({ error: 'Invalid provider specified.' });
    }

    const batchJob = await Notifications.create({
      church: church._id,
      author,
      type,
      provider,
      totalRecipients,
      content,
      status: 'queued',
    });

    await notificationQueue.add('sendBatch', {
      batchId: batchJob._id,
      recipients: recipients,
      content,
      provider,
      targetType,
      recipientType
    });

    const recipientDocs = recipientList.map((r) => ({
      batchId: batchJob._id,
      recipient: r,
      status: 'sent',
    }));
    await NotificationRecipient.insertMany(recipientDocs);

    res.status(202).json({
      message: 'Notifications scheduled successfully',
      batchId: batchJob._id,
    });
  } catch (error) {
    console.error('Batch job initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate notification job' });
  }
});

router.get('/status/:batchId', async (req, res) => {
  const { batchId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    return res.status(400).json({ error: 'Invalid job identifier provided' });
  }
  const batchStatus = await Notifications.findById(batchId).select('-content');
  if (!batchStatus) {
    return res.status(404).json({ message: 'Batch not found' });
  }
  const failedRecipients = await NotificationRecipient.find({
    batchId,
    status: 'failed',
  }).select('recipient status details providerMessageId -_id');

  res.json({
    ...batchStatus.toObject(),
    failedRecipients: failedRecipients,
  });
});
module.exports = router;
