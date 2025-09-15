const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const ministrySchema = new mongoose.Schema({
  church: {type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true},
  name: { type: String,nrequired: true},
  description: String,
  leaderId: { type: mongoose.Schema.Types.ObjectId , ref: 'User'}
}, { timestamps: true });

ministrySchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'leaderId', model: 'User' }
  ]
});

module.exports = mongoose.model('Ministry', ministrySchema);