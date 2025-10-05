const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const AssignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  ministryId: { type: String, ref: 'Ministry'},
  FellowshipId: { type: String, ref: 'Fellowship'},
  role: { type: String, required: true},
  availability: Object, // Can be used to store a map of data
  skills: [String],
  status: { type: String,required: true, enum: ['pending', 'approved'], default: 'pending' },
  dateAssigned: { type: Date, required: true }
});
AssignmentSchema.plugin(validateRefs, {
  refs: [
    { field: 'userId', model: 'User' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'FellowshipId', model: 'Fellowship' }
  ]
});
module.exports =

mongoose.model('Assignment', AssignmentSchema);