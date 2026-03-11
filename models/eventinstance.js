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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

eventInstanceSchema.virtual('startDateTime').get(function () {
  const d = new Date(this.date);
  const [h, m] = this.startTime.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
});

eventInstanceSchema.virtual('endDateTime').get(function () {
  const d = new Date(this.date);
  const [h, m] = this.endTime.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
});
eventInstanceSchema.virtual('autoCheckinOpen').get(function () {
  const now = new Date();

  const eventDate = new Date(this.date);
  const [startHour, startMinute] = this.startTime.split(':').map(Number);

  const eventStart = new Date(eventDate);
  eventStart.setHours(startHour, startMinute, 0, 0);

  const twoHoursFromNow = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  const sameDay = eventStart.toDateString() === now.toDateString();

  return sameDay && eventStart >= now && eventStart <= twoHoursFromNow;
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
