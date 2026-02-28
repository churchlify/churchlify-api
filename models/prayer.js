const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const prayerSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  anonymous: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  title: { type: String, required: true, trim: true},
  prayerRequest: { type: String, required: true },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
}, { timestamps: true });

// Compound indexes for efficient queries
prayerSchema.index({ church: 1, isPublic: 1 });
prayerSchema.index({ church: 1, author: 1 });

prayerSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'author', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Prayer', prayerSchema);