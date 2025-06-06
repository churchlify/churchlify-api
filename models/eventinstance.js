const mongoose = require('mongoose');

const eventInstanceSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  title: String,
  description: String,
  location: String,
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
}, {
  timestamps: true
});

eventInstanceSchema.index({ churchId: 1, date: 1 });

module.exports = mongoose.model('EventInstance', eventInstanceSchema);
