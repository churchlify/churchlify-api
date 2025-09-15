const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const eventInstanceSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  title: String,
  description: String,
  location: String,
  flier: String,
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  isCheckinOpen: { type: Boolean, default: false }
}, {
  timestamps: true
});

eventInstanceSchema.index({ churchId: 1, date: 1 });
eventInstanceSchema.plugin(validateRefs, {
  refs: [
    { field: 'eventId', model: 'Event' },
    { field: 'church', model: 'Church' }
  ]
});

module.exports = mongoose.model('EventInstance', eventInstanceSchema);
