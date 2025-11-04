const axios = require('axios');
const { messaging } = require('../common/firebase');
const Assignments = require('../models/assignment');
const Users = require('../models/user');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');

const getAccessToken = async () => {
  const response = await axios.post(
    `${process.env.EMAIL_API_URL}/oauth/access_token`,
    {
      grant_type: 'client_credentials',
      client_id: process.env.EMAIL_CLIENT_ID,
      client_secret: process.env.EMAIL_CLIENT_SECRET,
    }
  );
  return response.data.access_token;
};

const fetchEmails = async (recipients, type) => {
  const parts = type.split('_');
  let church = null;
  let recipientType = type;
  if (parts.length === 2) {
    church = parts[0];
    recipientType = parts[1];
  }

  let emails;

  switch (recipientType) {
    case 'all':
      if (!church) {
        throw new Error('Church ID is required for all recipient type.');
      }
      emails = await Users.find(
        { church: church },
        { emailAddress: 1, _id: 0 }
      );
      break;
    case 'ministries':
      emails = await Users.aggregate([
        {
          $match: {
            _id: {
              $in: await Assignments.find({
                ministryId: { $in: recipients },
              }).distinct('userId'),
            },
          },
        },
        { $project: { emailAddress: 1, _id: 0 } },
      ]);
      break;
    case 'fellowships':
      emails = await Users.aggregate([
        {
          $match: {
            _id: {
              $in: await Assignments.find({
                fellowshipId: { $in: recipients },
              }).distinct('userId'),
            },
          },
        },
        { $project: { emailAddress: 1, _id: 0 } },
      ]);
      break;

    case 'leaders':
      if (!church) {
        throw new Error('Church ID is required for leaders recipient type.');
      }
      const allChurchMinistryIds = await Ministry.find({ church }).distinct(
        '_id'
      );
      const allChurchFellowshipIds = await Fellowship.find({ church }).distinct(
        '_id'
      );
      const leaderUserIds = await Assignments.find({
        role: 'leader',
        $or: [
          { ministryId: { $in: allChurchMinistryIds } },
          { fellowshipId: { $in: allChurchFellowshipIds } },
        ],
      }).distinct('userId');

      emails = await Users.find(
        {
          $or: [{ _id: { $in: leaderUserIds } }, { role: 'admin', church }],
        },
        { emailAddress: 1, _id: 0 }
      );
      break;

    default:
      emails = await Users.find(
        { church: church },
        { emailAddress: 1, _id: 0 }
      );
  }
  return emails;
};

/**
 * Sends push notifications to either:
 * - multiple FCM tokens (batched automatically, max 500 per request)
 * - one or more topics (each topic gets its own message)
 *
 * @param {string|string[]} target - Array of tokens or topic(s)
 * @param {object} content - Notification { title, body, data }
 * @param {boolean} useTokens - Whether `target` is tokens (true) or topic(s) (false)
 */
const sendPushNotification = async (target, content, useTokens = false) => {
  if (!messaging) {
    console.error('❌ Firebase Messaging not initialized.');

    const failResponse = function () {
      return {
        success: false,
        error: { message: 'FCM not initialized' },
      };
    };

    return useTokens ? {
          successCount: 0,
          failureCount: Array.isArray(target) ? target.length : 0,
          responses: (Array.isArray(target) ? target : []).map(failResponse),
        } : { success: false, error: 'FCM not initialized' };
  }

  try {
    if (useTokens) {
      if (!Array.isArray(target) || target.length === 0) {
        throw new Error('No valid FCM tokens provided.');
      }

      const chunkSize = 500;
      const tokenChunks = [];
      for (let i = 0; i < target.length; i += chunkSize) {
        tokenChunks.push(target.slice(i, i + chunkSize));
      }

      const allResponses = [];

      for (const chunk of tokenChunks) {
        const { subject, body, data = {} } = content;
        const messages = chunk.map(function (token) {
          return {
            token: token,
            notification: { title: subject, body: body },
            data: data,
          };
        });

        const response = await messaging.sendEach(messages);
        console.log(
          `✅ Batch sent to ${chunk.length} tokens — Success: ${response.successCount}, Failed: ${response.failureCount}`
        );
        allResponses.push(response);
      }

      // Merge results
      const totalSuccess = allResponses.reduce(
        (acc, r) => acc + r.successCount,
        0
      );
      const totalFailure = allResponses.reduce(
        (acc, r) => acc + r.failureCount,
        0
      );

      return {
        successCount: totalSuccess,
        failureCount: totalFailure,
        responses: allResponses.flatMap((r) => r.responses),
      };
    }

    const topics = Array.isArray(target) ? target : [target];
    const results = [];

    for (const topic of topics) {
      if (typeof topic !== 'string' || !topic.trim()) {
        console.warn(`⚠️ Invalid topic name skipped: ${topic}`);
        continue;
      }

      const message = {
        topic: topic.trim(),
        notification: {
          title: content.subject,
          body: content.body,
        },
        data: content.data || {},
      };

      try {
        const messageId = await messaging.send(message);
        console.log(`✅ Sent message to topic '${topic}' — ID: ${messageId}`);
        results.push({ topic, success: true, messageId });
      } catch (err) {
        console.error(`❌ Failed to send to topic '${topic}': ${err.message}`);
        results.push({ topic, success: false, error: err.message });
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Unexpected error sending FCM:', error);
    return {
      success: false,
      error: `Unexpected error: ${error.message}`,
    };
  }
};

/**
 * Sends a batch of emails via SendPulse.
 * @param {string[]} emails - Array of recipient email addresses.
 * @param {object} content - Email content (subject, body/html).
 * @returns {Promise<object[]>} - Array of simplified results for each email.
 */
const sendEmailBatch = async (to, content, type) => {
  const emails = await fetchEmails(to, type);
  const recipients = emails.map((email) => ({ email: email.emailAddress }));
  const requestPayload = {
    email: {
      html: content.htmlBody || `<p>${content.body}</p>`,
      subject: content.subject,
      from: { name: 'Churchlify', email: 'info@7thcolonnade.com' },
      to: recipients,
      track_opens: 1,
      track_links: 1,
    },
  };

  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${process.env.EMAIL_API_URL}/smtp/emails`,
      requestPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const apiResponse = response.data;

    const results = emails.map((email, index) => ({
      email: email,
      success: true,
      status: 'sent',
      messageId: apiResponse.emails?.[index]?.id || `SP-${Date.now()}-${index}`, // Get the provider's message ID
    }));

    return results;
  } catch (error) {
    console.error('Payload:', JSON.stringify(requestPayload, null, 2));
    console.error('Response:', error.response?.data || error.message);
    return emails.map((email) => ({
      email: email,
      success: false,
      error: error.response?.data || { message: 'API error' },
      status: 'failed',
      messageId: null,
    }));
  }
};

module.exports = {
  sendPushNotification,
  sendEmailBatch,
};
