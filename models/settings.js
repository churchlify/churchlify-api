const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const settingsSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  key: { type: String, trim: true, required: true, unique: false},
  value: { type: String, required: true, trim: true },
  keyVersion: { type: String, required: true, default: 'v1' },
  audit: {
  encryptedBy: { type: String }, // e.g., userId or system
  decryptedBy: { type: String }, // last accessor
  lastDecryptedAt: { type: Date },
  lastEncryptedAt: { type: Date },
}
}, { timestamps: true });

settingsSchema.index({ church: 1, key: 1 }, { unique: true });
settingsSchema.set('toJSON', { virtuals: true });
settingsSchema.set('toObject', { virtuals: true });


settingsSchema.plugin(validateRefs, {
  refs: [ { field: 'church', model: 'Church' }]
});

module.exports = mongoose.model('Settings', settingsSchema);