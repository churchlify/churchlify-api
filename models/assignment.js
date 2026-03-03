const mongoose = require('mongoose');
const validateRefs = require('../common/validateRefs');
const applyAssignmentHooks = require('../hooks/assignmentHooks');
const ScheduleRole = require('./scheduleRole');

const AssignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  fellowshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fellowship', index: true },
  ministryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ministry', index: true },
  scheduleRoleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduleRole', index: true },
  role: { type: String, required: true, default: 'member'},
  // @deprecated Use AvailabilityBlock model instead for structured time-based availability management
  availability: { type: Object, deprecated: true },
  skills: [String],
  status: { type: String,required: true, enum: ['pending', 'approved'], default: 'pending' },
  dateAssigned: { type: Date, required: true }
});

// Compound indexes for common queries
AssignmentSchema.index({ userId: 1, status: 1 });
AssignmentSchema.index({ ministryId: 1, scheduleRoleId: 1, status: 1 });

// Unique compound indexes to prevent duplicate assignments
// A user can only have one role per ministry
AssignmentSchema.index(
  { userId: 1, ministryId: 1 },
  { 
    unique: true, 
    partialFilterExpression: { ministryId: { $exists: true, $ne: null } },
    name: 'unique_user_ministry'
  }
);

// A user can only have one role per fellowship
AssignmentSchema.index(
  { userId: 1, fellowshipId: 1 },
  { 
    unique: true, 
    partialFilterExpression: { fellowshipId: { $exists: true, $ne: null } },
    name: 'unique_user_fellowship'
  }
);

AssignmentSchema.pre('validate', async function (next) {
  if (!this.ministryId && !this.fellowshipId) {
    return next(new Error('Assignment must have either a ministryId or fellowshipId.'));
  }
  if (this.ministryId && this.fellowshipId) {
    return next(new Error('Assignment cannot have both ministryId and fellowshipId.'));
  }

  if (this.ministryId) {
    const status = this.status || 'pending';

    if (status === 'approved' && !this.scheduleRoleId) {
      return next(new Error('Approved ministry assignment must include scheduleRoleId.'));
    }

    if (this.scheduleRoleId) {
      try {
        const scheduleRole = await ScheduleRole.findById(this.scheduleRoleId).lean();
        if (!scheduleRole) {
          return next(new Error('Invalid scheduleRoleId.'));
        }

        if (String(scheduleRole.ministryId) !== String(this.ministryId)) {
          return next(new Error('scheduleRoleId does not belong to the provided ministryId.'));
        }

        this.role = scheduleRole.name;
      } catch (error) {
        return next(error);
      }
    }
  }

  if (this.fellowshipId && this.scheduleRoleId) {
    return next(new Error('scheduleRoleId is only supported for ministry assignments.'));
  }

  next();
});

AssignmentSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const updateSet = update.$set || {};
    const existing = await this.model.findOne(this.getQuery()).lean();

    if (!existing) {
      return next();
    }

    const ministryId = updateSet.ministryId ?? update.ministryId ?? existing.ministryId;
    const fellowshipId = updateSet.fellowshipId ?? update.fellowshipId ?? existing.fellowshipId;
    const scheduleRoleId = updateSet.scheduleRoleId ?? update.scheduleRoleId ?? existing.scheduleRoleId;
    const status = updateSet.status ?? update.status ?? existing.status ?? 'pending';

    if (!ministryId && !fellowshipId) {
      return next(new Error('Assignment must have either a ministryId or fellowshipId.'));
    }

    if (ministryId && fellowshipId) {
      return next(new Error('Assignment cannot have both ministryId and fellowshipId.'));
    }

    if (ministryId) {
      if (status === 'approved' && !scheduleRoleId) {
        return next(new Error('Approved ministry assignment must include scheduleRoleId.'));
      }

      if (scheduleRoleId) {
        const scheduleRole = await ScheduleRole.findById(scheduleRoleId).lean();
        if (!scheduleRole) {
          return next(new Error('Invalid scheduleRoleId.'));
        }

        if (String(scheduleRole.ministryId) !== String(ministryId)) {
          return next(new Error('scheduleRoleId does not belong to the provided ministryId.'));
        }

        if (!update.$set) {
          update.$set = {};
        }
        update.$set.role = scheduleRole.name;
        this.setUpdate(update);
      }
    }

    if (fellowshipId && scheduleRoleId) {
      return next(new Error('scheduleRoleId is only supported for ministry assignments.'));
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

AssignmentSchema.plugin(validateRefs, {
  refs: [
    { field: 'userId', model: 'User' },
    { field: 'ministryId', model: 'Ministry' },
    { field: 'fellowshipId', model: 'Fellowship' },
    { field: 'scheduleRoleId', model: 'ScheduleRole' }
  ]
});
applyAssignmentHooks(AssignmentSchema);
module.exports = mongoose.model('Assignment', AssignmentSchema);