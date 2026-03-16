const mongoose = require('mongoose');

const userDeletionRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  retainDays: { type: Number, required: true, default: 30 },
  executeAfter: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'blocked', 'failed'],
    default: 'pending',
    index: true
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  summarySnapshot: { type: mongoose.Schema.Types.Mixed },
  requestedAt: { type: Date, default: Date.now }
}, { timestamps: true });

userDeletionRequestSchema.index({ status: 1, executeAfter: 1 });

module.exports = mongoose.model('UserDeletionRequest', userDeletionRequestSchema);
