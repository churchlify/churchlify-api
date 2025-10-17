const mongoose = require('mongoose');
const { Schema } = mongoose;
const church = require ('./church');
const user = require('./user');
const validateRefs = require('../common/validateRefs');

const recurrenceSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
    required: true
  },
  interval: { type: Number, default: 1 },
  endDate: { type: Date },
  endAfterOccurrences: { type: Number },
  byWeekDay: [{ type: Number }], // 0=Sunday, 1=Monday, etc.
  byMonthDay: [{ type: Number }], // 1-31
  exceptions: [{ type: Date }] // Dates to exclude from recurrence
}, { _id: false });

const eventsSchema = new mongoose.Schema({
  church: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: false },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  location: { type: String, required: false },
  flier: { type: String, required: false },
  allowKidsCheckin: { type: Boolean, required: true, default: false },
  rsvp: { type: Boolean, required: true, default: false },
  checkinStartTime: { type: String, required: true },

  // Recurrence fields
  isRecurring: { type: Boolean, default: false },
  recurrence: { type: recurrenceSchema },
  isInstance: { type: Boolean, default: false },
  masterEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
  originalStartDate: { type: Date }, // For instances, tracks original occurrence date

  // System fields
  nextCheckDate: { type: Date } // For background job to know when to generate more
}, { timestamps: true });

// Indexes for performance
eventsSchema.index({ isRecurring: 1, nextCheckDate: 1 });
eventsSchema.index({ masterEventId: 1 });
eventsSchema.index({ startDate: 1 });
eventsSchema.index({ isInstance: 1, startDate: 1 });

eventsSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('church') || this.isModified('createdBy')) {
        try {
            let error = '';
            const userExist = await user.findById(this.createdBy);
            const churchExist = await church.findById(this.church);
            if(!churchExist){ error += 'Invalid Church reference.';}
            if(!userExist) {
                error = error.length > 1 ?  error + ' / Invalid User or User does not exist' : error + 'Invalid User or User does not exist';
            }
            const errorResponse = new Error(error);
            return userExist && churchExist ? next() : next(errorResponse);
        } catch (err) {
            return next(err);
        }
    } else {
        next(); // Skip validation if no change in Church reference
    }
});

eventsSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.church) {
            const churchExist = await church.findById(update.$set.church);
            if(!churchExist) { return next(new Error('Invalid Church reference.')); }
        }
        if (update.$set && update.$set.createdBy) {
            const userExist = await user.findById(update.$set.createdBy);
            if(!userExist){ return next(new Error(' Invalid User or User does not exist')); }
        }
            return next()  ;
    } catch (err) {
        return next(err);
    }
});
eventsSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'createdBy', model: 'User' },
    { field: 'masterEventId', model: 'Events' }
  ]
});
module.exports = mongoose.model('Events', eventsSchema);