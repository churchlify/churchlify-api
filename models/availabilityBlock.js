const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const availabilityBlockSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry', index: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  reason: { type: String, required: true },
  isRecurring: { type: Boolean, default: false },
  recurrencePattern: {
    frequency: { type: String, enum: ['weekly', 'monthly', 'yearly'] },
    interval: { type: Number, min: 1 },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0=Sunday, 6=Saturday
    endRecurrence: { type: Date }
  }
}, { timestamps: true });

availabilityBlockSchema.index({ church: 1, userId: 1, startDate: 1, endDate: 1 });
availabilityBlockSchema.index({ church: 1, ministryId: 1, startDate: 1, endDate: 1 });

availabilityBlockSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'userId', model: 'User' },
    { field: 'ministryId', model: 'Ministry', required: false }
  ]
});

// Validation: endDate must be after startDate
availabilityBlockSchema.pre('validate', function(next) {
  if (this.endDate <= this.startDate) {
    next(new Error('End date must be after start date'));
  } else {
    next();
  }
});

module.exports = mongoose.model('AvailabilityBlock', availabilityBlockSchema);
