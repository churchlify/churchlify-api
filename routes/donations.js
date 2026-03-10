const express = require('express');
const axios = require('axios');
const fetch = require('node-fetch');
const Stripe = require('stripe');
const paypal = require('@paypal/checkout-server-sdk');
const mongoose = require('mongoose');
const {validateDonationItem} = require('../middlewares/validators');
const { requireSuperOrAdmin } = require('../middlewares/permissions');
const { getPaymentSettings, getOrCreatePlan, generateUniqueReference, getPayPalAccessToken, getPaypalClient, getUser, createDonation, toMinorUnitAmount } = require('../common/payment');
const DonationItem = require('../models/donationItems');
const Donation = require('../models/donations');
const router = express.Router();
router.use(express.json());
const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // sandbox: https://api-m.sandbox.paypal.com https://api-m.paypal.com
const PAYSTACK_API = 'https://api.paystack.co';
const braintree = require('braintree');

const gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId: 'c9k8mzpt69zfnkdh',
  publicKey: 'yqcxkc2w2wmf6mcx',
  privateKey: 'fd433d233d1461ce1b53885ad83997fe',
});

const getStatusColor = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'processing' || normalizedStatus === 'succeeded') {
    return 'green';
  }
  return 'red';
};



const formatResponse= ({ success, status, message, data = {} }) => {
  return {
    success,
    showReceipt: !!data.receipt_url,
    showError: !success,
    status,
    statusColor: getStatusColor(status),
    message,
    data,
  };
};

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function sanitizeDonationItemUpdate(payload = {}) {
  const allowedFields = ['title', 'description', 'suggestedAmounts', 'imageUrl', 'recurringAvailable'];
  const updateObject = {};

  allowedFields.forEach((field) => {
    if (payload[field] !== undefined) {
      updateObject[field] = payload[field];
    }
  });

  return updateObject;
}

router.get('/items', async (req, res) => {
  try {
    const church = req.church;
    const churchId = church && church._id;
    if (!churchId) {return res.status(400).json({ error: 'Church header missing' });}
    const items = await DonationItem.find({ churchId }).select('title description suggestedAmounts imageUrl recurringAvailable').lean();
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/donor', async (req, res) => {
  try {
    const userId = req.headers['x-user'];
    if (!userId) {return res.status(400).json({ error: 'User header missing' });}
    const donor = await getUser(userId);
    return res.json(donor);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// Create donation item (admin)
router.post('/items', requireSuperOrAdmin, validateDonationItem(), async (req, res) => {
  try {
    const { ...body } = req.body;
    const church = req.church;
    if (!church) {return res.status(404).json({ error: 'Church not found' });}
    const item = await DonationItem.create({ churchId: church._id, ...body });
    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Update donation item (admin)
router.patch('/items/update/:id', requireSuperOrAdmin, async (req, res) => {
  try {
    const church = req.church;
    const { id } = req.params;

    if (!church?._id) {
      return res.status(400).json({ error: 'Church context required' });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid donation item ID' });
    }

    const updates = sanitizeDonationItemUpdate(req.body);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid donation item fields provided for update' });
    }

    if (updates.suggestedAmounts !== undefined && !Array.isArray(updates.suggestedAmounts)) {
      return res.status(400).json({ error: 'suggestedAmounts must be an array of numbers' });
    }

    if (Array.isArray(updates.suggestedAmounts)) {
      const hasInvalidAmount = updates.suggestedAmounts.some((amount) => typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0);
      if (hasInvalidAmount) {
        return res.status(400).json({ error: 'suggestedAmounts must only contain numbers greater than 0' });
      }
    }

    if (updates.recurringAvailable !== undefined && typeof updates.recurringAvailable !== 'boolean') {
      return res.status(400).json({ error: 'recurringAvailable must be a boolean' });
    }

    const updatedItem = await DonationItem.findOneAndUpdate(
      { _id: id, churchId: church._id },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedItem) {
      return res.status(404).json({ error: 'Donation item not found for this church' });
    }

    return res.status(200).json({ message: 'Donation item updated successfully', item: updatedItem });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Delete donation item (admin)
router.delete('/items/delete/:id', requireSuperOrAdmin, async (req, res) => {
  try {
    const church = req.church;
    const { id } = req.params;

    if (!church?._id) {
      return res.status(400).json({ error: 'Church context required' });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid donation item ID' });
    }

    const deletedItem = await DonationItem.findOneAndDelete({ _id: id, churchId: church._id }).lean();

    if (!deletedItem) {
      return res.status(404).json({ error: 'Donation item not found for this church' });
    }

    return res.status(200).json({ message: 'Donation item deleted successfully', item: deletedItem });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// List donations (admin)
router.get('/list', requireSuperOrAdmin, async (req, res) => {
  try {
    const church = req.church;

    if (!church?._id) {
      return res.status(400).json({ error: 'Church context required' });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { churchId: church._id };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.platform) {
      filter.platform = req.query.platform;
    }

    if (req.query.isRecurring !== undefined) {
      filter.isRecurring = String(req.query.isRecurring).toLowerCase() === 'true';
    }

    if (req.query.userId) {
      if (!isValidObjectId(req.query.userId)) {
        return res.status(400).json({ error: 'Invalid userId query parameter' });
      }
      filter.userId = req.query.userId;
    }

    const [donations, total] = await Promise.all([
      Donation.find(filter)
        .populate('userId', 'firstName lastName emailAddress phoneNumber')
        .select('userId lineItems amount currency isRecurring platform status transactionReferenceId subscriptionId completedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Donation.countDocuments(filter)
    ]);

    const donationsWithStatusColor = donations.map((donation) => ({
      ...donation,
      statusColor: getStatusColor(donation.status)
    }));

    return res.status(200).json({
      donations: donationsWithStatusColor,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Create a Stripe Checkout session (one-time)
router.post('/stripe/pay', async (req, res) => {
  const { items, recurring, paymentMethod, total } = req.body;
  const userId = req.headers['x-user'];
  const church = req.church;
   if (!userId) {
    return res.status(400).json(
      formatResponse({
        success: false,
        status: 'failed',
        message: 'Missing required donor information'
      })
    );
  }

  if (!paymentMethod?.token) {
    return res.status(400).json(
      formatResponse({
        success: false,
        status: 'failed',
        message: 'Missing required payment token'
      })
    );
  }
  const donor = await getUser(userId);

  if (!items || !items.length) {
    return res.status(400).json(
      formatResponse({
        success: false,
        status: 'failed',
        message: 'No donation items provided'
      })
    );
  }

  const majorAmount = Number(total);
  if (!Number.isFinite(majorAmount) || majorAmount <= 0) {
    return res.status(400).json(
      formatResponse({
        success: false,
        status: 'failed',
        message: 'Total amount must be a number greater than zero'
      })
    );
  }

  const amount = toMinorUnitAmount(majorAmount, 'USD'); // convert to cents
  const donation = {
    churchId: church._id,
    userId,
    lineItems: items,
    platform: 'stripe',
    currency: 'USD',
    status: 'processing',
    isRecurring: recurring?.interval ? true: false,
    amount: majorAmount
  };

  try {
    const decryptedData = await getPaymentSettings(church._id);
    const stripe = new Stripe(decryptedData.secretkey);

    // Step 1️⃣ Create Payment Method
    const stripePaymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: paymentMethod.token },
      billing_details: {
        name: `${donor.firstName} ${donor.lastName}`,
        email: donor.emailAddress,
        phone: donor.phoneNumber,
      },
    });

    // Step 2️⃣ Create Customer
    const customer = await stripe.customers.create({
      name: `${donor.firstName} ${donor.lastName}`,
      email: donor.emailAddress,
      phone: donor.phoneNumber,
      payment_method: stripePaymentMethod.id,
    });

    // Step 3️⃣ Handle recurring vs one-time
    if (recurring?.interval) {
      // 🔁 Recurring donation
      const product = await stripe.products.create({ name: 'Recurring Donation' });

      const price = await stripe.prices.create({
        unit_amount: amount,
        currency: 'usd',
        recurring: { interval: recurring.interval },
        product: product.id,
      });

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        default_payment_method: stripePaymentMethod.id,
        expand: ['latest_invoice.payment_intent.latest_charge'],
      });
      console.log('Stripe subscription created:', subscription.id, 'Status:', {subscription});
      // Stripe can return payment_intent as null/string/object depending on invoice lifecycle.
      let latestInvoice = null;
      if (subscription.latest_invoice && typeof subscription.latest_invoice === 'object') {
        latestInvoice = subscription.latest_invoice;
      }
      const intent = latestInvoice?.payment_intent;
      const paymentIntentId = typeof intent === 'string' ? intent : intent?.id || null;
      let paymentIntentCustomer = null;
      if (typeof intent === 'object' && typeof intent?.customer === 'string') {
        paymentIntentCustomer = intent.customer;
      }
      const latestCharge = typeof intent === 'object' && intent ? intent.latest_charge : null;
      const receiptUrl =
        (latestCharge && typeof latestCharge === 'object' ? latestCharge.receipt_url : null) ||
        intent?.charges?.data?.[0]?.receipt_url ||
        latestInvoice?.hosted_invoice_url ||
        null;

      donation.transactionReferenceId = paymentIntentId || latestInvoice?.id || subscription.id;
      donation.customerId =
        paymentIntentCustomer ||
        (typeof subscription.customer === 'string' ? subscription.customer : null) ||
        customer.id;
      donation.subscriptionId = subscription.id;
      await createDonation(donation);
      return res.json(
        formatResponse({
          success: true,
          status: subscription.status,
          message: 'Recurring donation created successfully.',
          data: {
            type: `Recurring ${recurring.interval}ly`,
            subscription_id: subscription.id,
            next_billing_date: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            receipt_url: receiptUrl,
          },
        })
      );
    } else {
      // 💳 One-time donation
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: customer.id,
        payment_method: stripePaymentMethod.id,
        confirm: true,
        description: items.map((i) => i.title).join(', '),
        receipt_email: donor.emailAddress,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
         expand: ['latest_charge'],
      });
      donation.transactionReferenceId = paymentIntent.id;
      donation.customerId = paymentIntent.customer;
      await createDonation(donation);
      const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || paymentIntent.latest_charge?.receipt_url || null;
      return res.json(
        formatResponse({
          success: true,
          status: paymentIntent.status,
          message: 'One-time donation processed successfully.',
          data: {
            type: 'One Time',
            payment_intent_id: paymentIntent.id,
            receipt_url: receiptUrl,
          },
        })
      );
    }

  } catch (err) {
    console.error('Stripe payment error:', err);
    const errorResponse = formatResponse({
      success: false,
      status: 'failed',
      message: 'Stripe payment failed. Please try again later.'
    });
    errorResponse.error = err.message;
    return res.status(400).json(errorResponse);
  }
});


// Create a stripe subscription (recurring monthly)
router.post('/stripe/create-subscription', async (req, res) => {
  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const stripe = new Stripe(decryptedData.secretkey);
    const { items } = req.body;
    // Create price
    const prices = await Promise.all(
      items.map(i =>
        stripe.prices.create({
          unit_amount: toMinorUnitAmount(i.amount, 'USD'),
          currency: 'usd',
          recurring: { interval: 'month' }, // must be the same interval for all
          product_data: { name: i.title },
        })
      )
    );
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: prices.map(price => ({ price: price.id, quantity: 1 })),
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//return details for stripe successful payment
router.get('/stripe/session/:id', async (req, res) => {
  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const stripe = new Stripe(decryptedData.secretkey);
    const session = await stripe.checkout.sessions.retrieve(req.params.id, {
      expand: [
        'line_items.data.price.product',
        'subscription.latest_invoice.payment_intent',
      ],
    });
    const isSubscription = !!session.subscription;
    let subscriptionInfo = null;

    if (isSubscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription.id);
      subscriptionInfo = {
        id: sub.id,
        status: sub.status,
        start_date: new Date(sub.start_date * 1000),
        current_period_end: new Date(sub.current_period_end * 1000) || new Date(sub.billing_cycle_anchor * 1000),
        cancel_at_period_end: sub.cancel_at_period_end,
      };
    }

    res.json({
      id: session.id,
      customer_email: session.customer_details?.email,
      amount_total: (session.amount_total / 100).toFixed(2),
      currency: session.currency.toUpperCase(),
      payment_status: session.payment_status,
      items: session.line_items?.data.map((i) => ({
        name: i.description,
        quantity: i.quantity,
        amount: (i.amount_total / 100).toFixed(2),
      })),
      created: session.created * 1000,
      isSubscription,
      subscriptionInfo,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * 🟢 Create PayPal Order (One-time or Recurring)
 */
router.post('/paypal/create-order', async (req, res) => {
  const { items, recurring, total } = req.body;
  const userId = req.headers['x-user'];
   if (!userId) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required donor information',
    });
  }
  const donor = await getUser(userId);

  if (!donor?.emailAddress) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required donor information',
    });
  }

  if (!items?.length) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'No donation items provided',
    });
  }

  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const accessToken = await getPayPalAccessToken(
      decryptedData.clientId,
      decryptedData.secret
    );

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // 🧩 If recurring donation — create a subscription
    if (recurring?.interval) {
      // 1️⃣ Create Product
      const productRes = await axios.post(
        'https://api-m.paypal.com/v1/catalogs/products',
        { name: 'Recurring Donation' },
        { headers }
      );
      const productId = productRes.data.id;

      // 2️⃣ Create Plan
      const planRes = await axios.post(
        'https://api-m.paypal.com/v1/billing/plans',
        {
          product_id: productId,
          name: `Donation Plan (${recurring.interval})`,
          billing_cycles: [
            {
              frequency: { interval_unit: recurring.interval.toUpperCase(), interval_count: 1 },
              tenure_type: 'REGULAR',
              sequence: 1,
              total_cycles: 0, // infinite
              pricing_scheme: {
                fixed_price: { value: total.toFixed(2), currency_code: 'USD' },
              },
            },
          ],
          payment_preferences: { auto_bill_outstanding: true },
        },
        { headers }
      );
      const planId = planRes.data.id;

      // 3️⃣ Create Subscription
      const subscriptionRes = await axios.post(
        `${PAYPAL_API}/billing/subscriptions`,
        {
          plan_id: planId,
          subscriber: {
            name: { given_name: donor.name },
            email_address: donor.emailAddress,
          },
          application_context: {
            brand_name: church.name,
            user_action: 'SUBSCRIBE_NOW',
            return_url: 'https://yourapp.com/donation/success',
            cancel_url: 'https://yourapp.com/donation/cancel',
          },
        },
        { headers }
      );

      return res.json({
        success: true,
        showReceipt: true,
        showError: false,
        status: subscriptionRes.data.status,
        message: 'Recurring PayPal subscription created successfully.',
        data: {
          type: `Recurring ${recurring.interval}`,
          subscription_id: subscriptionRes.data.id,
          next_billing_date: subscriptionRes.data.billing_info?.next_billing_time || null,
          receipt_url: subscriptionRes.data.links?.find(l => l.rel === 'self')?.href || null,
        },
      });
    }
    console.log(req.body);
    // 💳 Otherwise, One-time donation
    const orderRes = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            description: items.map(i => i.title).join(', '),
            amount: { value: parseFloat(total).toFixed(2), currency_code: 'USD' },
          },
        ],
        payer: {
          name: { given_name: donor.name },
          email_address: donor.emailAddress,
        },
      },
      { headers }
    );

    return res.json({
      success: true,
      showReceipt: false, // Will be captured in /capture-order
      showError: false,
      status: 'CREATED',
      message: 'PayPal order created successfully.',
      data: {
        type: 'One Time',
        order_id: orderRes.data.id,
      },
    });
  } catch (err) {
    console.error('PayPal create-order error:', err.response?.data || err.message);
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Failed to create PayPal order',
      error: err.message,
    });
  }
});

/**
 * 🟢 Capture PayPal Order (for One-time)
 */
router.post('/paypal/capture-order', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing PayPal order ID',
    });
  }

  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const accessToken = await getPayPalAccessToken(
      decryptedData.clientId,
      decryptedData.secretkey
    );

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const captureRes = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      {},
      { headers }
    );

    const capture = captureRes.data.purchase_units?.[0]?.payments?.captures?.[0];

    return res.json({
      success: true,
      showReceipt: true,
      showError: false,
      status: capture?.status || 'COMPLETED',
      message: 'PayPal payment captured successfully.',
      data: {
        id: capture?.id,
        amount: capture?.amount,
        receipt_url: capture?.links?.find(l => l.rel === 'self')?.href || null,
      },
    });
  } catch (err) {
    console.error('PayPal capture-order error:', err.response?.data || err.message);
    return res.status(400).json({
      success: false,
      showReceipt: false,
      showError: true,
      message: 'Failed to capture PayPal order',
      error: err.message,
    });
  }
});

/**
 * Create a subscription flow (recurring):
 * - creates a Product (Catalogs API),
 * - creates a Plan (Plans API) with billing_cycle = monthly (or configured),
 * - creates a Subscription and returns an approval URL for the user to approve the subscription.
 *
 * Note: Creating a product + plan per subscription is simple but may clutter PayPal merchant account
 * in production you should reuse products/plans or store created plan ids and reuse them.
 */
router.post('/paypal/create-subscription', async (req, res) => {
  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const client = getPaypalClient(decryptedData);

    const { amount, currency = 'USD', frequency = 'MONTH', interval_count = 1, name = 'Monthly Donation' } = req.body;

    // 1) Create product
    const prodReq = new paypal.catalogs.products.ProductCreateRequest();
    prodReq.requestBody({ name: `${name} Product`, description: `${name} recurring donation` });
    const prodResp = await client.execute(prodReq);
    const productId = prodResp.result.id;

    // 2) Create plan
    const planReq = new paypal.subscriptions.plans.PlanCreateRequest();
    planReq.requestBody({
      product_id: productId,
      name: `${name} Plan`,
      billing_cycles: [
        {
          frequency: { interval_unit: frequency, interval_count },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // 0 means infinite
          pricing_scheme: { fixed_price: { value: String(amount), currency_code: currency } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0', currency_code: currency },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    });

    const planResp = await client.execute(planReq);
    const planId = planResp.result.id;

    // 3) Create subscription
    const subReq = new paypal.subscriptions.SubscriptionCreateRequest();
    subReq.requestBody({
      plan_id: planId,
      application_context: {
        brand_name: church.shortName || church.name,
        return_url: process.env.PAYPAL_RETURN_URL,
        cancel_url: process.env.PAYPAL_CANCEL_URL,
      },
    });

    const subResp = await client.execute(subReq);
    const approve = (subResp.result.links || []).find(l => l.rel === 'approve');

    res.json({ subscriptionID: subResp.result.id, approvalUrl: approve ? approve.href : null, raw: subResp.result });
  } catch (err) {
    console.error('PayPal create-subscription error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/paypal/client-token', async (req, res) => {
  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    //const client = getPaypalClient(decryptedData);
    const accessToken = await getPayPalAccessToken(
      decryptedData.clientId,
      decryptedData.secret
    );

  //    // 2. Use the Access Token to generate the Client Token with required scopes
  // const response = await fetch(`${PAYPAL_API}/v1/identity/generate-token`, {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Bearer ${accessToken}`,
  //     "Accept-Language": "en_US",
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //       "scopes": [
  //           "https://uri.paypal.com/services/payments/futurepayments",
  //           "https://uri.paypal.com/services/payments/tokenization"
  //       ]
  //   })
  // });
  // const data = await response.json();
  // if (!response.ok) throw new Error(data.error_description || "Failed to get PayPal Client Token");

    res.json({ token: accessToken});
  } catch (err) {
    console.error('PayPal create-token error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/paypal/bt-token', async (req, res) => {
  try {
  const response = await gateway.clientToken.generate({});
  res.json({ token: response.clientToken });
  //res.json({ token: data.client_token});
  } catch (err) {
    console.error('PayPal create-token error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/paypal/pay', async (req, res) => {
  const { items, recurring, paymentMethod, total } = req.body;
  const userId = req.headers['x-user'];
   if (!userId) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required donor information',
    });
  }

  if (!paymentMethod?.token) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required payment token',
    });
  }
  const donor = await getUser(userId);

  if (!donor?.emailAddress) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required donor info',
    });
  }

  if (!items?.length) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'No donation items provided',
    });
  }

  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const { clientId, secretkey } = decryptedData;

    // Get OAuth token
    const auth = Buffer.from(`${clientId}:${secretkey}`).toString('base64');
    const tokenResponse = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {throw new Error('Failed to authenticate PayPal API');}

    // 💳 Handle one-time vs recurring
    if (!recurring?.interval) {
      // ----- ONE-TIME (checkout order verify) -----
      if (!paymentMethod?.reference)
        {return res.status(400).json({ success: false, showError: true, message: 'Missing order reference' });}

      const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${paymentMethod.reference}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const orderData = await orderRes.json();

      if (orderData.status !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          showError: true,
          message: 'PayPal order not completed.',
        });
      }

      const capture = orderData.purchase_units?.[0]?.payments?.captures?.[0];
      const receiptUrl = capture?.links?.find((l) => l.rel === 'self')?.href || null;

      return res.json({
        success: true,
        showReceipt: true,
        showError: false,
        status: 'succeeded',
        message: 'One-time PayPal donation processed successfully.',
        data: {
          type: 'One Time',
          transaction_id: capture?.id,
          receipt_url: receiptUrl,
        },
      });
    } else {
      // ----- RECURRING (subscription-based) -----

      // Step 1️⃣ Create Product (if needed)
      const productRes = await fetch(`${PAYPAL_API}/v1/catalogs/products`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Recurring Donation',
          description: 'Automatic recurring donation',
          type: 'SERVICE',
          category: 'DONATIONS',
        }),
      });
      const product = await productRes.json();

      // Step 2️⃣ Create Plan
      const planRes = await fetch(`${PAYPAL_API}/v1/billing/plans`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: product.id,
          name: `Recurring Donation (${recurring.interval})`,
          description: `Donation billed ${recurring.interval}`,
          billing_cycles: [
            {
              frequency: {
                interval_unit: recurring.interval.toUpperCase(), // e.g. MONTH, YEAR
                interval_count: 1,
              },
              tenure_type: 'REGULAR',
              sequence: 1,
              total_cycles: 0,
              pricing_scheme: {
                fixed_price: {
                  value: total.toFixed(2),
                  currency_code: 'USD',
                },
              },
            },
          ],
          payment_preferences: {
            auto_bill_outstanding: true,
            setup_fee_failure_action: 'CONTINUE',
            payment_failure_threshold: 3,
          },
        }),
      });
      const plan = await planRes.json();

      // Step 3️⃣ Create Subscription
      const subscriptionRes = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: plan.id,
          subscriber: {
            name: { given_name: `${donor.firstName} ${donor.lastName}` || 'Donor' },
            email_address: donor.emailAddress,
          },
          application_context: {
            brand_name: 'Church Donations',
            user_action: 'SUBSCRIBE_NOW',
            return_url: 'https://yourapp.com/success',
            cancel_url: 'https://yourapp.com/cancel',
          },
        }),
      });
      const subscription = await subscriptionRes.json();

      return res.json({
        success: true,
        showReceipt: true,
        showError: false,
        status: subscription.status || 'active',
        message: 'Recurring PayPal donation created successfully.',
        data: {
          type: `Recurring ${recurring.interval}ly`,
          subscription_id: subscription.id,
          next_billing_date: subscription.billing_info?.next_billing_time || null,
          receipt_url: subscription.links?.find((l) => l.rel === 'self')?.href || null,
        },
      });
    }
  } catch (err) {
    console.error('PayPal payment error:', err);
    return res.status(400).json({
      success: false,
      showReceipt: false,
      showError: true,
      message: 'PayPal payment failed. Please try again later.',
      error: err.message,
    });
  }
});

// POST /donations
router.post('/paystack/pay', async (req, res) => {
    const { items, recurring, paymentMethod,  total} = req.body;

  try {

    const church = req.church;
    const churchId = church._id;
    const { secretkey } = await getPaymentSettings(churchId);
    if (!secretkey) {return res.status(400).json({ error: 'Payment settings not configured.' });}
    //const { items, recurring, paymentMethod, total } = req.body;
  const userId = req.headers['x-user'];
   if (!userId) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Missing required donor information',
    });
  }
  const donor = await getUser(userId);

  if (!items || !items.length) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'No donation items provided',
    });
  }

  //const amount = Math.round(total * 100); // convert to kobo
  const totalAmount = Number(total);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Total amount must be a number greater than zero',
    });
  }

  const paystackAmount = toMinorUnitAmount(totalAmount, 'NGN');
  if (paystackAmount < 10000) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'Amount is invalid. Minimum charge for NGN is 100',
    });
  }

  const isRecurring = recurring?.interval ? true : false;

    const donation = {
    churchId: church._id,
    userId,
    lineItems: items,
    platform: 'paystack',
    currency: 'NGN',
    status: 'processing',
    isRecurring,
    amount: totalAmount
  };
 
  let resultData;
  if (isRecurring) {
      const plan = await getOrCreatePlan({ churchId, name: `churchlify_${Date.now()} Plan`, amount: totalAmount, interval: `${recurring.interval.replace('year','annual')}ly`, currency: 'NGN'});
      const subRes = await axios.post( `${PAYSTACK_API}/subscription`,{customer: donor.emailAddress, 
        plan: plan.planCode, metadata: { donor, items, source: 'Churchlify Platform',churchId,}, },
        {
          headers: {Authorization: `Bearer ${secretkey}`,'Content-Type': 'application/json',},
        }
      );
      const subData = subRes.data.data;
      donation.subscriptionId = subData.subscription_code;
      donation.transactionReferenceId = subData.subscription_code;
      const normalizedPaystackCustomerId =
        (subData.customer && typeof subData.customer === 'object'
          ? subData.customer.customer_code || subData.customer.id || subData.customer.email
          : subData.customer) ||
        donor.emailAddress;
      donation.customerId = String(normalizedPaystackCustomerId);
      resultData = formatResponse({
        success: true,
        status: 'created',
        message: 'Recurring donation subscription initialized successfully.',
        data: {
          type: 'Recurring',
          payment_intent_id: subData.subscription_code,
          receipt_url: subData.authorization_url,
          next_billing_date: subData.next_payment_date || null,
        },
      });
  } else {
      // 💳 One-time donation
      const reference = generateUniqueReference(paymentMethod?.reference);
      const trxRes = await axios.post(`${PAYSTACK_API}/transaction/initialize`,
        { email: donor.emailAddress, amount: paystackAmount,reference: reference,
          metadata: { donor, items, source: 'Churchlify Platform',churchId,},
        },
        {
          headers: { Authorization: `Bearer ${secretkey}`,  'Content-Type': 'application/json' },
        }
      );

      const trxData = trxRes.data.data;
       donation.transactionReferenceId =  trxData.reference;
       //donation.customerId = trxRes.data.customer.customer_code;
      resultData = formatResponse({
        success: true,
        status: 'created',
        message: 'One-time donation processed successfully.',
        data: {
          type: 'One Time',
          payment_intent_id: trxData.reference,
          receipt_url: trxData.authorization_url,
        },
      });
    }
    await createDonation(donation);
    return res.json(resultData);
  } catch (error) {
    console.error('❌ Paystack payment error:', error.response?.data || error.message);
    return res.status(500).json(
      formatResponse({
        success: false,
        status: 'failed',
        message:
          error.response?.data?.message ||
          'Failed to process Paystack payment. Please try again.',
      })
    );
  }



});

module.exports = router;
