const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const chatMessageSchema = new mongoose.Schema(
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
    sender: {
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
    messageType: {
      type: String,
      enum: ['text', 'system', 'announcement'],
      default: 'text',
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

chatMessageSchema.index({ church: 1, roomId: 1, createdAt: -1 });
chatMessageSchema.index({ church: 1, participants: 1, createdAt: -1 });

chatMessageSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'sender', model: 'User' },
  ],
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
