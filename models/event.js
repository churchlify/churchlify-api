const mongoose = require('mongoose');
const { Schema } = mongoose;
const church = require ('./church');
const user = require('./user');
// const {checkUserById, checkChurchById} = require('../common/shared')
// const recurrenceSchema = new Schema({
//     frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: null },
//     interval: { type: Number, default: 1 }, // e.g., every 2 days, every 3 weeks
// });

// const eventSchema = new mongoose.Schema({
//     church: {type: Schema.Types.ObjectId, ref: 'Church', required: true},
//     createdBy: {type: Schema.Types.ObjectId, ref: 'User', required: true},
//     title: { type: String, required: true },
//     description: { type: String, required: false },
//     startDate: { type: Date, required: true }, // Date of the first occurrence
//     endDate: { type: Date, required: true },   // Date of the last occurrence
//     startTime: { type: String, required: true }, // e.g., "09:00" for 9:00 AM
//     endTime: { type: String, required: true },   // e.g., "10:30" for 10:30 AM
//     location: { type: String, required: false },
//     flier: { type: String, required: false },
//     allowKidsCheckin: { type: Boolean, required: true , default: false}, 
//     rsvp: { type: Boolean, required: true , default: false}, 
//     checkinStartTime: { type: String, required: true },
//     recurrence: { type: recurrenceSchema}
// }, { timestamps: true });

const eventSchema = new mongoose.Schema({
    church: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
    createdBy: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    title: { type: String, required: true },
    description: String,
    startDate: { type: Date, required: true }, // base/first occurrence
    endDate: { type: Date, required: true },
    startTime: { type: String, required: true }, // 'HH:mm' (local time)
    endTime: { type: String, required: true },
    location: String,
    flier: { type: String, required: false },
    allowKidsCheckin: { type: Boolean, required: true , default: false}, 
    rsvp: { type: Boolean, required: true , default: false}, 
    checkinStartTime: { type: String, required: true },
    isRecurring: { type: Boolean, default: false },
    recurrence: {
        frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], required: function() { return this.isRecurring; } },
        interval: { type: Number, default: 1 }, // e.g. every 1 week
        daysOfWeek: [Number], // For weekly recurrence (0 = Sun, 1 = Mon, etc.)
        endDate: Date, // Until when recurrence continues
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
module.exports = mongoose.model('Event', eventSchema);
