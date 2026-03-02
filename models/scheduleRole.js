const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const scheduleRoleSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry', required: true, index: true },
  name: { type: String, required: true, trim: true },
  roleKey: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

scheduleRoleSchema.pre('validate', function (next) {
  if (this.name) {
    this.name = this.name.trim();
    this.roleKey = this.name.toLowerCase();
  }
  next();
});

scheduleRoleSchema.index({ ministryId: 1, roleKey: 1 }, { unique: true });
scheduleRoleSchema.index({ church: 1, ministryId: 1, isActive: 1 });

scheduleRoleSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'createdBy', model: 'User' }
  ]
});

module.exports = mongoose.model('ScheduleRole', scheduleRoleSchema);
