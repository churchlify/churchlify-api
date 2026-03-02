const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');

const eventScheduleTemplateSchema = new mongoose.Schema({
  church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry', required: true, index: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduleRole', required: true, index: true },
  requiredCount: { type: Number, required: true, min: 1, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

eventScheduleTemplateSchema.index({ eventId: 1, ministryId: 1, roleId: 1 }, { unique: true });
eventScheduleTemplateSchema.index({ church: 1, eventId: 1, ministryId: 1 });

eventScheduleTemplateSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'eventId', model: 'Event' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'roleId', model: 'ScheduleRole' },
    { field: 'createdBy', model: 'User' }
  ]
});

module.exports = mongoose.model('EventScheduleTemplate', eventScheduleTemplateSchema);
