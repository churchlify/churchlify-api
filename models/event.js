const mongoose = require('mongoose');
const { Schema } = mongoose;
const church = require ('./church');
const user = require('./user');
const validateRefs = require('../common/validateRefs');

const eventSchema = new mongoose.Schema({
    church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    createdBy: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    title: { type: String, required: true },
    description: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTime: { type: String, required: true }, 
    endTime: { type: String, required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: false },
    flier: { type: String, required: false },
    allowKidsCheckin: { type: Boolean, required: true , default: false},
    rsvp: { type: Boolean, required: true , default: false},
    checkinStartTime: { type: String, required: false },
    isRecurring: { type: Boolean, default: false },
    recurrence: {
        frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], required: function() { return this.isRecurring; } },
        interval: { type: Number, default: 1 }, // e.g. every 1 week
        daysOfWeek: [Number], // For weekly recurrence (0 = Sun, 1 = Mon, etc.)
        endDate: Date, 
    },
}, { timestamps: true });

eventSchema.pre('save', async function (next) {
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

eventSchema.pre('findOneAndUpdate', async function (next) {
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
eventSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'createdBy', model: 'User' }
  ]
});
module.exports = mongoose.model('Event', eventSchema);