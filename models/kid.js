// models/User.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const user = require ('./user')
const kidSchema = new mongoose.Schema({
    parent: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    firstName: { type: String, required: [true, 'First name is required'], trim: true, minlength: [2, 'First name must be at least 2 characters long']},
    lastName: {type: String, required: [true, 'Last name is required'], trim: true, minlength: [2, 'Last name must be at least 2 characters long']},
    middleName: {type: String, trim:true, },
    dateOfBirth: {type: Date, required: [true, "Date of birth is required"]},
    gender: { type: String, enum: ['Male', 'Female'] },
    allergies: {type: [String]},
    color: {type: String}
}, { timestamps: true });

kidSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('parent')) {
        try {
            const error = new Error('Invalid parent reference.');
            return await user.findById(this.parent) ? next() : next(error);
        } catch (err) {
            return next(err);
        }
    } else {
        next(); // Skip validation if no change in Church reference
    }
});

kidSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.parent) {
            const error = new Error('Invalid Parent reference.');
            return  await user.findById(update.$set.church) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});

module.exports = mongoose.model('Kid', kidSchema);
