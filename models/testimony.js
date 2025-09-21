const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const testimonySchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  anonymous: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  title: { type: String, required: true },
  story: { type: String, required: true },
  impact: { type: String },
  gratitude: { type: String },
}, { timestamps: true });

testimonySchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'author', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Testimony', testimonySchema);