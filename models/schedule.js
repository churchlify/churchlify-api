const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const scheduleSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry', required: true, index: true },
  eventInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventInstance', required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventScheduleTemplate', required: true, index: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduleRole', required: true, index: true },
  slotNumber: { type: Number, required: true, min: 1 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  taskNotes: { type: String, default: '' },
  status: {
    type: String,
    enum: ['planned', 'confirmed', 'completed', 'cancelled'],
    default: 'planned'
  },
  scheduleDate: { type: Date, required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
  responseStatus: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
    index: true
  },
  responseDate: { type: Date },
  declineReason: { type: String }
}, { timestamps: true });

scheduleSchema.index({ eventInstanceId: 1, ministryId: 1, roleId: 1, slotNumber: 1 }, { unique: true });
scheduleSchema.index({ eventInstanceId: 1, ministryId: 1, roleId: 1, userId: 1 }, { unique: true });
scheduleSchema.index({ church: 1, ministryId: 1, scheduleDate: 1 });

scheduleSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'eventInstanceId', model: 'EventInstance' },
    { field: 'templateId', model: 'EventScheduleTemplate' },
    { field: 'roleId', model: 'ScheduleRole' },
    { field: 'userId', model: 'User' },
    { field: 'assignedBy', model: 'User' }
  ]
});

module.exports = mongoose.model('Schedule', scheduleSchema);
