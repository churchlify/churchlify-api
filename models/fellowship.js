const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');
const AddressSchema = require('./address');

const fellowshipSchema = new mongoose.Schema({
  name: { type: String, required: true  },
  address: { type: AddressSchema, required: true},
  dayOfWeek: String,
  meetingTime: String,
  leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  church: {type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  description: String
}, { timestamps: true });

fellowshipSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'leaderId', model: 'User' }
  ]
});

// Export the Mongoose model and the Joi validation schema
module.exports = mongoose.model('Fellowship', fellowshipSchema);