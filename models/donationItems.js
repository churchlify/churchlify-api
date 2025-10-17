const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const donationItemSchema = new mongoose.Schema({
churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
title: { type: String, required: true },
description: String,
suggestedAmounts: [Number],
imageUrl: String,
recurringAvailable: { type: Boolean, default: false }
}, { timestamps: true });

donationItemSchema.plugin(validateRefs, {
  refs: [
    { field: 'churchId', model: 'Church' },
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('DonationItem', donationItemSchema);
