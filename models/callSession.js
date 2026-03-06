const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const callSessionSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Church',
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    mediaType: {
      type: String,
      enum: ['voice', 'video'],
      default: 'voice',
      index: true,
    },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'rejected', 'missed', 'cancelled'],
      default: 'ringing',
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    answeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    answeredAt: {
      type: Date,
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    endedAt: {
      type: Date,
    },
    endReason: {
      type: String,
      trim: true,
      maxlength: 128,
    },
  },
  { timestamps: true }
);

callSessionSchema.index({ church: 1, roomId: 1, createdAt: -1 });
callSessionSchema.index({ church: 1, participants: 1, createdAt: -1 });

callSessionSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'initiatedBy', model: 'User' },
  ],
});

module.exports = mongoose.model('CallSession', callSessionSchema);
