const mongoose = require('mongoose');
const { Schema } = mongoose;
const Church = require ('./Church')
const church = require("./Church");
const {checkExistById} = require('../common/shared')
const recurrenceSchema = new Schema({
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: null },
    interval: { type: Number, default: 1 }, // e.g., every 2 days, every 3 weeks
    daysOfWeek: [Number], // For weekly recurrence, specify days (0=Sunday, 6=Saturday)
    endRecurrence: Date, // When recurrence ends
});

const eventSchema = new mongoose.Schema({
    church: {type: Schema.Types.ObjectId, ref: 'church', required: true},
    title: { type: String, required: true },
    description: String,
    startDate: { type: Date, required: true }, // Date of the first occurrence
    endDate: { type: Date, required: true },   // Date of the last occurrence
    startTime: { type: String, required: true }, // e.g., "09:00" for 9:00 AM
    endTime: { type: String, required: true },   // e.g., "10:30" for 10:30 AM
    userId: { type: String, required: true },
    location: String,
    reminder: Date,
    recurrence: { type: recurrenceSchema}
}, { timestamps: true });
module.exports = mongoose.model('Events', eventSchema);

eventSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('church')) {
        try {
            const error = new Error('Invalid Church reference.');
            return await checkExistById('church',this.church) ? next() : next(error);
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
            const error = new Error('Invalid Church reference.');
            return  await checkExistById('church',update.$set.church) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});
