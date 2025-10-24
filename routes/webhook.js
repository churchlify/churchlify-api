const express = require('express');
const router = express.Router();
router.use(express.json());
const { getPaymentSettings } = require('../common/payment');
const Stripe = require('stripe');
const crypto = require('crypto');

// The actual webhook endpoint
router.post('/stripe', (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
        event = Stripe.webhooks.constructEvent( req.rawBody, signature, webhookSecret );
    } catch (err) {
        console.log(`⚠️ Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    const dataObject = event.data.object;
    console.log({dataObject});
    switch (event.type) {
        case 'payment_intent.succeeded':
            console.log(`PaymentIntent successful: ${dataObject.id}`);
            break;

        case 'payment_intent.payment_failed':
            console.log(`PaymentIntent failed: ${dataObject.id}`);
            break;
        case 'customer.subscription.created':
            console.log(`Subscription created: ${dataObject.id}`);
            break;
        case 'invoice.paid':
            console.log(`Invoice paid: ${dataObject.id}`);
            break;
        case 'invoice.payment_failed':
            console.log(`Invoice payment failed: ${dataObject.id}`);
            break;
        case 'customer.subscription.deleted':
            console.log(`Subscription deleted: ${dataObject.id}`);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    res.json({ received: true });
});

router.post('/paystack', express.raw({ type: '*/*' }), async (req, res) => {
    try {
    if (!(req.body instanceof Buffer)) {
      console.error('Expected Buffer in req.body, got:', typeof req.body);
      return res.status(400).send('Invalid body format');
    }
    const hash = req.headers['x-paystack-signature'];
    const rawBody = req.body.toString('utf8');
    const event = JSON.parse(rawBody); 
    const decryptedData = await getPaymentSettings(event.data.metadata.churchId);
    const paystackSecret = decryptedData.secretKey;
    console.log({decryptedData}, paystackSecret);

    if (!hash) {
        console.error('Paystack Webhook Error: Missing signature header.');
        return res.status(400).send('Signature missing');
    }
    const calculatedHash = crypto.createHmac('sha512', paystackSecret).update(rawBody).digest('hex');
    if (calculatedHash !== hash) {
        console.error('⚠️ Paystack Webhook Error: Signature mismatch!');
        return res.status(400).send('Signature verification failed');
    }   
    console.log('✅ Paystack Webhook Verified. Event:', {event});
    switch (event.event) {
        case 'charge.success':
            console.log(`Paystack Charge Success: ${event.data.reference}`);
            break;
        case 'subscription.create':
            console.log(`Paystack Subscription Created: ${event.data.subscription_code}`);
            break;
        case 'subscription.not_renewed':
            console.log(`Paystack Subscription Not Renewed: ${event.data.subscription_code}`);
            break;
        case 'subscription.disable':
            console.log(`Paystack Subscription Disabled: ${event.data.subscription_code}`);
            break;
        default:
            console.log(`Unhandled Paystack event type: ${event.event}`);
    }

    res.sendStatus(200); 
      } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Internal error');
  }
});

module.exports = router;