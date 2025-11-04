const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');
const applyMinistryHooks = require('../hooks/ministryHooks');

const ministrySchema = new mongoose.Schema({
  church: {type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  name: { type: String,nrequired: true},
  description: String,
  leaderId: { type: mongoose.Schema.Types.ObjectId , ref: 'User'},
}, { timestamps: true });

ministrySchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'leaderId', model: 'User' }
  ]
});

applyMinistryHooks(ministrySchema);

module.exports = mongoose.model('Ministry', ministrySchema);