const express = require('express');
const axios = require('axios');
const fetch = require('node-fetch');
const Stripe = require('stripe');
const paypal = require('@paypal/checkout-server-sdk');
const {validateDonationItem} = require('../middlewares/validators');
const { getPaymentSettings, getOrCreatePlan, generateUniqueReference, getPayPalAccessToken, getPaypalClient, getUser, createDonation } = require('../common/shared');
const DonationItem = require('../models/donationItems');
const router = express.Router();
const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // sandbox: https://api-m.sandbox.paypal.com https://api-m.paypal.com
const PAYSTACK_API = 'https://api.paystack.co';
const braintree = require('braintree');

const gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId: 'c9k8mzpt69zfnkdh',
  publicKey: 'yqcxkc2w2wmf6mcx',
  privateKey: 'fd433d233d1461ce1b53885ad83997fe',
});



const formatResponse= ({ success, status, message, data = {} }) => {
  return {
    success,
    showReceipt: !!data.receipt_url,
    showError: !success,
    status,
    message,
    data,
  };
};

router.get('/items', async (req, res) => {
  const church = req.church;
  const churchId = church._id;
  if (!churchId) {return res.status(400).json({ error: 'Church header missing' });}
  const items = await DonationItem.find({churchId }).lean();
  res.json(items);
});

router.get('/donor', async (req, res) => {
  const userId = req.headers['x-user'];
  if (!userId) {return res.status(400).json({ error: 'User header missing' });}
  const donor = await getUser(userId);
  res.json(donor);
});


// Create donation item (admin)
router.post('/items', validateDonationItem(), async (req, res) => {
const { ...body } = req.body;
const church = req.church;
if (!church) {return res.status(404).json({ error: 'Church not found' });}
const item = await DonationItem.create({ churchId: church._id, ...body });
res.status(201).json(item);
});

// Create a Stripe Checkout session (one-time)
router.post('/stripe/pay', async (req, res) => {
  const { items, recurring, paymentMethod, total } = req.body;
  const userId = req.headers['x-user'];
  const church = req.church;
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

  if (!items || !items.length) {
    return res.status(400).json({
      success: false,
      showError: true,
      message: 'No donation items provided',
    });
  }

  const amount = Math.round(total * 100); // convert to cents
  const donation = {
    churchId: church._id,
    userId,
    lineItems: items,
    platform: 'stripe',
    status: 'processing',
    isRecurring: recurring?.interval ? true: false,
    amount: total
  };

  try {
    const decryptedData = await getPaymentSettings(church._id);
    const stripe = new Stripe(decryptedData.secretKey);

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

      const intent = subscription.latest_invoice?.payment_intent;
      const receiptUrl = intent?.charges?.data?.[0]?.receipt_url ||  subscription.latest_invoice?.hosted_invoice_url || null;
      donation.transactionReferenceId = intent.id;
      donation.customerId = intent.customer;
      donation.subscriptionId = subscription.id;
      await createDonation(donation);
      return res.json({
        success: true,
        showReceipt: true,
        showError: false,
        status: subscription.status,
        message: 'Recurring donation created successfully.',
        data: {
          type: `Recurring ${recurring.interval}ly`,
          subscription_id: subscription.id,
          next_billing_date: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          receipt_url: receiptUrl,
        },
      });
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
      return res.json({
        success: true,
        showReceipt: true,
        showError: false,
        status: paymentIntent.status,
        message: 'One-time donation processed successfully.',
        data: {
          type: 'One Time',
          payment_intent_id: paymentIntent.id,
          receipt_url: receiptUrl,
        },
      });
    }

  } catch (err) {
    console.error('Stripe payment error:', err);
    return res.status(400).json({
      success: false,
      showReceipt: false,
      showError: true,
      message: 'Stripe payment failed. Please try again later.',
      error: err.message,
    });
  }
});


// Create a stripe subscription (recurring monthly)
router.post('/stripe/create-subscription', async (req, res) => {
  try {
    const church = req.church;
    const decryptedData = await getPaymentSettings(church._id);
    const stripe = new Stripe(decryptedData.secretKey);
    const { items } = req.body;
    // Create price
    const prices = await Promise.all(
      items.map(i =>
        stripe.prices.create({
          unit_amount: Math.round(parseFloat(i.amount) * 100),
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
    const stripe = new Stripe(decryptedData.secretKey);
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
      decryptedData.secretKey
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
    const { clientId, secretKey } = decryptedData;

    // Get OAuth token
    const auth = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
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
    const { secretKey } = await getPaymentSettings(churchId);
    if (!secretKey) {return res.status(400).json({ error: 'Payment settings not configured.' });}
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
  const isRecurring = recurring?.interval ? true : false;

    const donation = {
    churchId: church._id,
    userId,
    lineItems: items,
    platform: 'paystack',
    status: 'processing',
    isRecurring,
    amount: total
  };
 
  let resultData;
  if (isRecurring) {
      const plan = await getOrCreatePlan({ churchId, name: `churchlify_${Date.now()} Plan`, amount: total, interval: `${recurring.interval.replace('year','annual')}ly`});
      const subRes = await axios.post( `${PAYSTACK_API}/subscription`,{customer: donor.emailAddress, 
        plan: plan.planCode, metadata: { donor, items, source: 'Churchlify Platform',churchId,}, },
        {
          headers: {Authorization: `Bearer ${secretKey}`,'Content-Type': 'application/json',},
        }
      );
      const subData = subRes.data.data;
      donation.subscriptionId =  subData.subscription_code;
      donation.customerId = subData.customer;
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
        { email: donor.emailAddress, amount: total * 100,reference: reference,
          metadata: { donor, items, source: 'Churchlify Platform',churchId,},
        },
        {
          headers: { Authorization: `Bearer ${secretKey}`,  'Content-Type': 'application/json' },
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
