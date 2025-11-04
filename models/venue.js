// venueSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const addressSchema = require('./address');
const validateRefs = require('../common/validateRefs');

const venueSchema = new Schema({
    name: { type: String, required: true },
    address: { type: addressSchema, required: true },
    church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
});

venueSchema.index({ church: 1, name: 1 }, { unique: true });
venueSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' }
  ]
});

module.exports = mongoose.model('Venue', venueSchema);