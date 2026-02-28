const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const eventInstanceSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  title: String,
  description: String,
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: false },
  flier: String,
  date: { type: Date, required: true, index: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  isCheckinOpen: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
eventInstanceSchema.index({ church: 1, date: -1 });
eventInstanceSchema.index({ eventId: 1, date: 1 });
eventInstanceSchema.index({ isCheckinOpen: 1, date: 1 });
eventInstanceSchema.plugin(validateRefs, {
  refs: [
    { field: 'eventId', model: 'Event' },
    { field: 'church', model: 'Church' }
  ]
});

module.exports = mongoose.model('EventInstance', eventInstanceSchema);
