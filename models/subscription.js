const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const subscriptionSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  modules: [{type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true,}],
  startDate: { type: Date, default: Date.now,},
  expiryDate: { type: Date, required: true,},
  status: { type: String, enum: ['active', 'expired', 'cancelled', 'pending'], default: 'pending',},
  payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }],
},{ timestamps: true });

subscriptionSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'payments', model: 'Payment' },
    { field: 'modules', model: 'Module' },
  ]
});

module.exports = mongoose.model('Subscription', subscriptionSchema);