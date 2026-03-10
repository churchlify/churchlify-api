const express = require("express");
const router = express.Router();
router.use(express.json());
const mongoose = require("mongoose");
const Donation = require("../models/donations");
const { getPaymentSettings } = require("../common/payment");
const Stripe = require("stripe");
const crypto = require("crypto");
let currentOtp = null;
let otpExpiry = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMetadataChurchId = (event) => {
  const metadata = event && event.data && event.data.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  if (metadata.churchId) {
    return String(metadata.churchId);
  }

  // Some providers can send metadata fields as custom_fields arrays.
  const customFields = metadata.custom_fields;
  if (Array.isArray(customFields)) {
    const match = customFields.find((field) =>
      field && (field.variable_name === "churchId" || field.display_name === "churchId")
    );
    if (match && match.value) {
      return String(match.value);
    }
  }

  return null;
};

const getSubscriptionCode = (data) => {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.subscription_code) {
    return String(data.subscription_code);
  }

  if (data.subscription && data.subscription.subscription_code) {
    return String(data.subscription.subscription_code);
  }

  return null;
};

const mapPaystackStatus = (eventType) => {
  switch (eventType) {
    case "charge.success":
      return "succeeded";
    case "charge.failed":
    case "subscription.not_renewed":
    case "subscription.disable":
      return "failed";
    case "subscription.create":
      return "processing";
    default:
      return null;
  }
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getExpectedMajorAmount = (data) => {
  const minorAmount = Number(data && data.amount);
  if (!Number.isFinite(minorAmount) || minorAmount <= 0) {
    return null;
  }
  return minorAmount / 100;
};

const updateDonationFromPaystackEventOnce = async (event, churchId) => {
  const data = event && event.data ? event.data : {};
  const reference = data.reference ? String(data.reference) : null;
  const subscriptionCode = getSubscriptionCode(data);
  const mappedStatus = mapPaystackStatus(event && event.event);
  const expectedMajorAmount = getExpectedMajorAmount(data);

  if (!reference && !subscriptionCode) {
    return null;
  }

  const updateSet = {
    webhookReceivedAt: new Date(),
    "platformDetails.paystack.lastEvent": event && event.event,
    "platformDetails.paystack.reference": reference,
    "platformDetails.paystack.subscriptionCode": subscriptionCode,
    "platformDetails.paystack.gatewayResponse": data.gateway_response || null,
    "platformDetails.paystack.paidAt": data.paid_at || data.paidAt || null,
  };

  if (mappedStatus) {
    updateSet.status = mappedStatus;
  }

  if (event && event.event === "charge.success") {
    const paidAt = data.paid_at || data.paidAt;
    updateSet.completedAt = paidAt ? new Date(paidAt) : new Date();
  }

  const update = { $set: updateSet };

  let donation = null;
  if (reference) {
    const exactFilter = { platform: "paystack", transactionReferenceId: reference };
    if (churchId) {
      exactFilter.churchId = churchId;
    }
    donation = await Donation.findOneAndUpdate(
      exactFilter,
      update,
      { new: true, sort: { createdAt: -1 } }
    ).select("_id status transactionReferenceId subscriptionId");

    if (!donation && churchId) {
      donation = await Donation.findOneAndUpdate(
        { platform: "paystack", transactionReferenceId: reference },
        update,
        { new: true, sort: { createdAt: -1 } }
      ).select("_id status transactionReferenceId subscriptionId");
    }
  }

  if (!donation && reference) {
    const prefixedPattern = new RegExp(`^churchlify_${escapeRegExp(reference)}(_|$)`, "i");
    const fallbackFilter = {
      platform: "paystack",
      status: { $in: ["processing", "initiated"] },
      transactionReferenceId: prefixedPattern
    };
    if (churchId) {
      fallbackFilter.churchId = churchId;
    }
    if (expectedMajorAmount !== null) {
      fallbackFilter.amount = expectedMajorAmount;
    }

    donation = await Donation.findOneAndUpdate(
      fallbackFilter,
      update,
      { new: true, sort: { createdAt: -1 } }
    ).select("_id status transactionReferenceId subscriptionId");

    if (!donation && churchId) {
      const fallbackNoChurchFilter = {
        platform: "paystack",
        status: { $in: ["processing", "initiated"] },
        transactionReferenceId: prefixedPattern
      };
      if (expectedMajorAmount !== null) {
        fallbackNoChurchFilter.amount = expectedMajorAmount;
      }
      donation = await Donation.findOneAndUpdate(
        fallbackNoChurchFilter,
        update,
        { new: true, sort: { createdAt: -1 } }
      ).select("_id status transactionReferenceId subscriptionId");
    }
  }

  if (!donation && reference && reference.startsWith("churchlify_")) {
    const parts = reference.split("_");
    const rawReference = parts.length >= 2 ? parts[1] : null;
    if (rawReference) {
      const rawFilter = {
        platform: "paystack",
        status: { $in: ["processing", "initiated"] },
        transactionReferenceId: rawReference
      };
      if (churchId) {
        rawFilter.churchId = churchId;
      }
      if (expectedMajorAmount !== null) {
        rawFilter.amount = expectedMajorAmount;
      }

      donation = await Donation.findOneAndUpdate(
        rawFilter,
        update,
        { new: true, sort: { createdAt: -1 } }
      ).select("_id status transactionReferenceId subscriptionId");

        if (!donation && churchId) {
          const rawNoChurchFilter = {
            platform: "paystack",
            status: { $in: ["processing", "initiated"] },
            transactionReferenceId: rawReference
          };
          if (expectedMajorAmount !== null) {
            rawNoChurchFilter.amount = expectedMajorAmount;
          }

          donation = await Donation.findOneAndUpdate(
            rawNoChurchFilter,
            update,
            { new: true, sort: { createdAt: -1 } }
          ).select("_id status transactionReferenceId subscriptionId");
        }
    }
  }

  if (!donation && subscriptionCode) {
    const subFilter = { platform: "paystack", subscriptionId: subscriptionCode };
    if (churchId) {
      subFilter.churchId = churchId;
    }
    donation = await Donation.findOneAndUpdate(
      subFilter,
      update,
      { new: true, sort: { createdAt: -1 } }
    ).select("_id status transactionReferenceId subscriptionId");

    if (!donation && churchId) {
      donation = await Donation.findOneAndUpdate(
        { platform: "paystack", subscriptionId: subscriptionCode },
        update,
        { new: true, sort: { createdAt: -1 } }
      ).select("_id status transactionReferenceId subscriptionId");
    }
  }

  return donation;
};

const updateDonationFromPaystackEvent = async (event, churchId) => {
  const shouldRetry = event && event.event === "charge.success";
  const maxAttempts = shouldRetry ? 6 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const donation = await updateDonationFromPaystackEventOnce(event, churchId);
    if (donation) {
      if (attempt > 1) {
        console.log("Paystack webhook donation update matched on retry", { attempt });
      }
      return donation;
    }

    if (attempt < maxAttempts) {
      await sleep(500);
    }
  }

  return null;
};

const resolveChurchIdFromPaystackEvent = async (event) => {
  const metadataChurchId = getMetadataChurchId(event);
  if (metadataChurchId) {
    return metadataChurchId;
  }

  const data = event && event.data ? event.data : {};
  const reference = data.reference;
  if (reference) {
    const byReference = await Donation.findOne({ transactionReferenceId: reference })
      .select("churchId")
      .lean();
    if (byReference && byReference.churchId) {
      return String(byReference.churchId);
    }
  }

  const subscriptionCode = data.subscription_code || (data.subscription && data.subscription.subscription_code);
  if (subscriptionCode) {
    const bySubscription = await Donation.findOne({ subscriptionId: subscriptionCode })
      .select("churchId")
      .lean();
    if (bySubscription && bySubscription.churchId) {
      return String(bySubscription.churchId);
    }
  }

  return null;
};

// The actual webhook endpoint
router.post("/stripe", (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = Stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.log(`⚠️ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  const dataObject = event.data.object;
  console.log({ dataObject });
  switch (event.type) {
    case "payment_intent.succeeded":
      console.log(`PaymentIntent successful: ${dataObject.id}`);
      break;

    case "payment_intent.payment_failed":
      console.log(`PaymentIntent failed: ${dataObject.id}`);
      break;
    case "customer.subscription.created":
      console.log(`Subscription created: ${dataObject.id}`);
      break;
    case "invoice.paid":
      console.log(`Invoice paid: ${dataObject.id}`);
      break;
    case "invoice.payment_failed":
      console.log(`Invoice payment failed: ${dataObject.id}`);
      break;
    case "customer.subscription.deleted":
      console.log(`Subscription deleted: ${dataObject.id}`);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  res.json({ received: true });
});

router.post("/paystack", async (req, res) => {
  try {
    let rawPayload = null;
    if (Buffer.isBuffer(req.rawBody)) {
      rawPayload = req.rawBody;
    } else if (Buffer.isBuffer(req.body)) {
      rawPayload = req.body;
    }

    if (!rawPayload) {
      console.error("Expected raw webhook payload, got:", typeof req.body);
      return res.status(400).send("Invalid body format");
    }

    const hash = req.headers["x-paystack-signature"];
    const rawBody = rawPayload.toString("utf8");
    const event = JSON.parse(rawBody);

    if (!hash) {
      console.error("Paystack Webhook Error: Missing signature header.");
      return res.status(400).send("Signature missing");
    }

    const churchId = await resolveChurchIdFromPaystackEvent(event);
    if (!churchId) {
      console.warn("Paystack Webhook: churchId missing; acknowledging without processing", {
        eventType: event && event.event,
        reference: event && event.data && event.data.reference
      });
      return res.sendStatus(200);
    }

    const decryptedData = await getPaymentSettings(churchId);
    const paystackSecret = decryptedData && decryptedData.secretKey;
    if (!paystackSecret) {
      console.error("Paystack Webhook Error: Missing paystack secret for church", churchId);
      return res.sendStatus(200);
    }

    const calculatedHash = crypto
      .createHmac("sha512", paystackSecret)
      .update(rawBody)
      .digest("hex");
    if (calculatedHash !== hash) {
      console.error("⚠️ Paystack Webhook Error: Signature mismatch!");
      return res.status(400).send("Signature verification failed");
    }
    console.log("✅ Paystack Webhook Verified. Event:", { event });

    const updatedDonation = await updateDonationFromPaystackEvent(event, churchId);
    if (updatedDonation) {
      console.log("✅ Donation status updated from Paystack webhook", {
        donationId: updatedDonation._id,
        status: updatedDonation.status,
        reference: updatedDonation.transactionReferenceId,
        subscriptionId: updatedDonation.subscriptionId,
      });
    } else {
      console.warn("Paystack webhook matched no donation", {
        eventType: event && event.event,
        reference: event && event.data && event.data.reference,
        subscriptionCode: getSubscriptionCode(event && event.data),
      });
    }

    switch (event.event) {
      case "charge.success":
        console.log(`Paystack Charge Success: ${event.data.reference}`);
        break;
      case "subscription.create":
        console.log(
          `Paystack Subscription Created: ${event.data.subscription_code}`
        );
        break;
      case "subscription.not_renewed":
        console.log(
          `Paystack Subscription Not Renewed: ${event.data.subscription_code}`
        );
        break;
      case "subscription.disable":
        console.log(
          `Paystack Subscription Disabled: ${event.data.subscription_code}`
        );
        break;
      default:
        console.log(`Unhandled Paystack event type: ${event.event}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Internal error");
  }
});

router.post("/generate-otp", (req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  currentOtp = otp;
  otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes validity
  // TODO: send OTP securely (email/SMS). For dev, just log it:
  console.log("Generated OTP:", otp);

  res.json({ message: "OTP generated and sent to admin" });
});

router.delete("/clear-database", async (req, res) => {
  const { otp } = req.body;

  if (!otp || parseInt(otp) !== parseInt(currentOtp) || Date.now() > otpExpiry) {
    console.log("Invalid or expired OTP attempt:", !otp);
    console.log("Invalid or expired OTP attempt:", otp !== currentOtp);
    console.log("Invalid or expired OTP attempt:", Date.now() > otpExpiry);
    return res
      .status(403)
      .json({
        error: `Invalid or expired OTP: ${otp} ${currentOtp} ${Date.now()} ${otpExpiry}`,
      });
  }
  try {
    const modelNames = mongoose.modelNames();

    for (const name of modelNames) {
      const Model = mongoose.model(name);
      await Model.deleteMany({});
      console.log(`Cleared collection: ${name}`);
    }

    res.json({ message: "All collections cleared successfully" });
  } catch (err) {
    console.error("Error clearing database:", err);
    res.status(500).json({ error: "Failed to clear database" });
  }
});

module.exports = router;
