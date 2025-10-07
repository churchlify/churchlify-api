// models/User.js
const mongoose = require('mongoose');
const kid = require ('./kid');
const validateRefs = require('../common/validateRefs');

const checkInSchema = new mongoose.Schema({
    child: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    validate: [array => array.length > 0, 'At least one child is required'], required: true},
    status: { type: String, enum: ['check_in_request', 'dropped_off', 'pickup_request', 'picked_up'], default: 'check_in_request' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

checkInSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('child')) {
        try {
            const error = new Error('Invalid child reference.');
            return await kid.findById(this.child) ? next() : next(error);
        } catch (err) {
            return next(err);
        }
    } else {
        next(); // Skip validation if no change in Church reference
    }
});

checkInSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.child) {
            const error = new Error('Invalid Child reference.');
            return  await kid.findById(update.$set.child) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});
checkInSchema.plugin(validateRefs, {
  refs: [
    { field: 'child', model: 'Kid' }
  ]
});

module.exports = mongoose.model('CheckIn', checkInSchema);
