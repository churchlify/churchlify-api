const express = require('express');
const router = express.Router();
const rawParser = require('../middlewares/rawParser');
const Stripe = require('stripe');

router.post('/stripe', rawParser, (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET);
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Stripe webhook received:', event.type);
        switch (event.type) {
    case 'checkout.session.completed':
      console.log('💰 Payment completed:', event.data.object.id);
      break;
    default:
      console.log('Unhandled Stripe event:', event.type);
        }
   // res.sendStatus(200);
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
   return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  res.json({ received: true });
});

router.post('/paypal', async (req, res) => {
  console.log('PayPal webhook event:', req.body.event_type);
  res.sendStatus(200);
});

module.exports = router;