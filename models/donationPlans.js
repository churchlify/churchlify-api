const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const donationPlanSchema = new mongoose.Schema({
  churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  planCode: { type: String, required: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  interval: { type: String, enum: ['daily', 'weekly', 'monthly', 'annually'], required: true },
  provider: { type: String, enum: ['paystack', 'stripe'], required: true, default: 'paystack' },
  providerId: { type: String },
},{ timestamps: true });

donationPlanSchema.index(
  { churchId: 1, amount: 1, interval: 1, provider: 1 },
  { unique: true }
);

donationPlanSchema.plugin(validateRefs, {
  refs: [
    { field: 'churchId', model: 'Church' }
  ]
});

module.exports = mongoose.model('DonationPlan', donationPlanSchema);