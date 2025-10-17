const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const donationSchema = new mongoose.Schema({
  churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  donationId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  fund: { type: String }, // e.g., 'general', 'building'
  platform: { type: String, enum: ['stripe', 'paypal'], required: true },
  status: { type: String, enum: ['initiated', 'pending', 'completed', 'failed'], default: 'initiated' },
  stripeSessionId: { type: String },
  stripeEventId: { type: String },
  stripeMetadata: { type: mongoose.Schema.Types.Mixed },
  paypalOrderId: { type: String },
  paypalCaptureId: { type: String },
  paypalWebhookId: { type: String },
  paypalPayload: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  completedAt: { type: Date },
  webhookReceivedAt: { type: Date },
  isRecurring: { type: Boolean, default: false },
  isTestMode: { type: Boolean, default: false },
}, { timestamps: true });

donationSchema.plugin(validateRefs, {
  refs: [
    { field: 'churchId', model: 'Church' },
    { field: 'userId', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Donation', donationSchema);
