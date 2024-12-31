const mongoose = require('mongoose');
const { Schema } = mongoose;
const church = require ('./Church')
const user = require("./user");
// const {checkUserById, checkChurchById} = require('../common/shared')
const recurrenceSchema = new Schema({
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], default: null },
    interval: { type: Number, default: 1 }, // e.g., every 2 days, every 3 weeks
});

const eventSchema = new mongoose.Schema({
    church: {type: Schema.Types.ObjectId, ref: 'Church', required: true},
    createdBy: {type: Schema.Types.ObjectId, ref: 'user', required: true},
    title: { type: String, required: true },
    description: { type: String, required: false },
    startDate: { type: Date, required: true }, // Date of the first occurrence
    endDate: { type: Date, required: true },   // Date of the last occurrence
    startTime: { type: String, required: true }, // e.g., "09:00" for 9:00 AM
    endTime: { type: String, required: true },   // e.g., "10:30" for 10:30 AM
    location: { type: String, required: false },
    recurrence: { type: recurrenceSchema}
}, { timestamps: true });

eventSchema.pre('save', async function (next) {
    console.log(this)
    if (this.isNew || this.isModified('church') || this.isModified('createdBy')) {
        try {
            let error = '';
            const userExist = await user.findById(this.createdBy)
            const churchExist = await church.findById(this.church)
            if(!churchExist) error += 'Invalid Church reference.'
            if(!userExist) error = error.length > 1 ?  error + ' / Invalid User or User does not exist' : error + 'Invalid User or User does not exist'
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
        let error = '';
        const userExist = await user.findById(update.$set.createdBy)
        const churchExist = await church.findById(update.$set.church)
        if(!churchExist) error += 'Invalid Church reference.'
        if(!userExist) error = error.length > 1 ?  error + ' / Invalid User or User does not exist' : error + 'Invalid User or User does not exist'
        const errorResponse = new Error(error);
        return userExist && churchExist ? next() : next(errorResponse);
    } catch (err) {
        return next(err);
    }
});
module.exports = mongoose.model('Events', eventSchema);
