const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const AssignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  fellowshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fellowship' },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry' },
  role: { type: String, required: true, default: 'member'},
  availability: Object, // Can be used to store a map of data
  skills: [String],
  status: { type: String,required: true, enum: ['pending', 'approved'], default: 'pending' },
  dateAssigned: { type: Date, required: true }
});

AssignmentSchema.pre('validate', function (next) {
  if (!this.ministryId && !this.fellowshipId) {
    return next(new Error('Assignment must have either a ministryId or fellowshipId.'));
  }
  if (this.ministryId && this.fellowshipId) {
    return next(new Error('Assignment cannot have both ministryId and fellowshipId.'));
  }
  next();
});

AssignmentSchema.plugin(validateRefs, {
  refs: [
    { field: 'userId', model: 'User' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'fellowshipId', model: 'Fellowship' }
  ]
});
module.exports = mongoose.model('Assignment', AssignmentSchema);