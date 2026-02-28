const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const donationItemSchema = new mongoose.Schema({
churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
title: { type: String, required: true },
description: String,
suggestedAmounts: [Number],
imageUrl: String,
recurringAvailable: { type: Boolean, default: false }
}, { timestamps: true });

// Ensure churchId is indexed for queries
donationItemSchema.index({ churchId: 1, title: 1 });

donationItemSchema.plugin(validateRefs, {
  refs: [
    { field: 'churchId', model: 'Church' },
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('DonationItem', donationItemSchema);
