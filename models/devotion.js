const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const devotionSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  title: { type: String, required: true, trim: true},
  scripture: { type: String, required: true,trim: true},
  content: { type: String, required: true},
  date: { type: Date, required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  tags: [{ type: String, trim: true}],
  image: { type: String, trim: true},
  isPublished: { type: Boolean, default: false},
}, { timestamps: true });

// Compound indexes for common queries
devotionSchema.index({ church: 1, date: -1 });
devotionSchema.index({ church: 1, isPublished: 1 });

devotionSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'author', model: 'User' }
  ]
});
module.exports = mongoose.model('Devotion', devotionSchema);