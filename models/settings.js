const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const settingsSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  key: { type: String, trim: true, required: true, unique: false},
  value: { type: String, required: true, trim: true },
}, { timestamps: true });

settingsSchema.index({ church: 1, key: 1 }, { unique: true });

settingsSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' }
  ]
});

module.exports = mongoose.model('Settings', settingsSchema);