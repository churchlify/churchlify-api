// models/User.js
const mongoose = require('mongoose');
const kid = require ('./kid');
const validateRefs = require('../common/validateRefs');

const checkInSchema = new mongoose.Schema({
    eventInstance: { type: mongoose.Schema.Types.ObjectId, ref: 'EventInstance', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pickupCode: { type: String, required: true }, // Shared PIN for all kids in this check-in
    children: [{
        child: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true },
        status: { type: String, enum: ['check_in_request', 'dropped_off', 'picked_up'], default: 'check_in_request' },
        droppedOffBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        droppedOffAt: { type: Date },
        pickedUpBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        pickedUpAt: { type: Date }
    }],
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

// Validate at least one child
checkInSchema.path('children').validate(function(children) {
    return children && children.length > 0;
}, 'At least one child is required');

// Indexes for common queries
checkInSchema.index({ 'children.child': 1 });
checkInSchema.index({ 'children.status': 1 });
checkInSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

checkInSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('children')) {
        try {
            // Validate all children exist
            for (const childEntry of this.children) {
                const childExists = await kid.findById(childEntry.child);
                if (!childExists) {
                    return next(new Error(`Invalid child reference: ${childEntry.child}`));
                }
            }
            next();
        } catch (err) {
            return next(err);
        }
    } else {
        next();
    }
});

checkInSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.children) {
            // Validate all children exist
            for (const childEntry of update.$set.children) {
                const childExists = await kid.findById(childEntry.child);
                if (!childExists) {
                    return next(new Error(`Invalid child reference: ${childEntry.child}`));
                }
            }
        }
        next();
    } catch (err) {
        return next(err);
    }
});
checkInSchema.plugin(validateRefs, {
  refs: [
    { field: 'eventInstance', model: 'EventInstance' },
    { field: 'requestedBy', model: 'User' }
    // children.child, droppedOffBy, pickedUpBy validated in pre-save hooks
  ]
});

module.exports = mongoose.model('CheckIn', checkInSchema);
