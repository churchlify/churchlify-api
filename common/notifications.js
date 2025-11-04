const admin = require('firebase-admin');


/**
 * Sends a batch of push notifications via Firebase Cloud Messaging (FCM).
 * @param {string[]} fcmTokens - Array of device registration tokens.
 * @param {object} content - Notification content (title, body, data).
 * @returns {Promise<object>} - FCM batch response object.
 */
async function sendPushNotification(fcmTokens, content) {
    if (!admin.apps.length) {
        console.error('Firebase Admin SDK not initialized.');
        return { responses: fcmTokens.map(() => ({ success: false, error: { message: 'FCM not initialized' } })) };
    }
    
    // The message payload, targeting multiple tokens
    const message = {
        notification: {
            title: content.title,
            body: content.body,
        },
        data: content.data || {}, // Custom data payload
        tokens: fcmTokens,
    };

    try {
        // sendMulticast handles batching up to 500 tokens at once 
        // and returns a detailed status for each token.
        const response = await admin.messaging().sendMulticast(message);
        
        console.log(`FCM Batch Sent. Success: ${response.successCount}, Failed: ${response.failureCount}`);
        
        // The response.responses array contains per-token results, 
        // perfect for updating your NotificationRecipient table.
        return response; 
        
    } catch (error) {
        console.error('Error sending FCM batch:', error);
        // Map the single batch error to a "failed" status for all recipients in the batch
        return { 
            responses: fcmTokens.map(() => ({ 
                success: false, 
                error: { message: error.message } 
            })) 
        };
    }
}

module.exports = { sendPushNotification };