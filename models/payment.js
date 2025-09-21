const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true,index: true,},
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true,},
  paymentId: { type: String, required: true, unique: true, },
  amount: { type: Number, required: true,},
  status: { type: String, enum: ['pending', 'succeeded', 'failed', 'refunded'], required: true,  default: 'pending', },
  metadata: { type: Object, default: {}},
}, { timestamps: true });
paymentSchema.index({ user: 1, church: 1 });

paymentSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'user', model: 'User' },
    { field: 'subscription', model: 'Subscription' }
  ]
});

module.exports = mongoose.model('Payment', paymentSchema);