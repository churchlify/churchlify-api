const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const prayerSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  anonymous: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: true },
  title: { type: String, required: true, trim: true},
  prayerRequest: { type: String, required: true },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
}, { timestamps: true });

prayerSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'author', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Prayer', prayerSchema);