const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const donationLineItemSchema = new mongoose.Schema({
  fund: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01 }
}, { _id: false });

const donationSchema = new mongoose.Schema({
  churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lineItems: { type: [donationLineItemSchema], required: true,
    validate: { validator: function(v) {return v.length > 0; },
      message: 'A donation must specify at least one fund line item.'
    }
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  isRecurring: { type: Boolean, default: false },
  isTestMode: { type: Boolean, default: false },
  platform: { type: String, enum: ['stripe', 'paystack'], required: true },
  transactionReferenceId: { type: String, required: false, unique: true, sparse: true }, 
  subscriptionId: { type: String,  required: false },
  customerId: { type: String, required: false},
  status: { type: String, enum: ['initiated', 'processing', 'succeeded', 'failed', 'refunded', 'requires_action'], default: 'initiated' },
  platformDetails: { type: mongoose.Schema.Types.Mixed },
  webhookEventId: { type: String, unique: true, sparse: true},
  completedAt: { type: Date },
  webhookReceivedAt: { type: Date }
}, { timestamps: true });

donationSchema.pre('save', function(next) {
  if (this.isModified('lineItems') || this.isNew) {
    const totalAmount = this.lineItems.reduce((sum, item) => sum + item.amount, 0);
    this.amount = totalAmount;
  }
  next();
});

donationSchema.plugin(validateRefs, {
  refs: [
    { field: 'churchId', model: 'Church' },
    { field: 'userId', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Donation', donationSchema);
