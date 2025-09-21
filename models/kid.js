// models/kid.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const validateRefs = require('../common/validateRefs');
const User = require ('./user');
const kidSchema = new mongoose.Schema({
    parent: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, required: [true, 'First name is required'], trim: true, minlength: [2, 'First name must be at least 2 characters long']},
    lastName: {type: String, required: [true, 'Last name is required'], trim: true, minlength: [2, 'Last name must be at least 2 characters long']},
    middleName: {type: String, trim:true, },
    dateOfBirth: {type: Date, required: [true, 'Date of birth is required']},
    gender: { type: String, enum: ['Male', 'Female'] },
    allergies: {type: [String]},
    color: {type: String}
}, { timestamps: true });

kidSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('parent')) {
        try {
            const parentExists = await User.findById(this.parent);
            if (!parentExists) { return next(new Error('Invalid parent reference.'));}
        } catch (err) {
            return next(err);
        }
    }
    next();
});

kidSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.parent) {
            const parentExists = await User.findById(update.$set.parent);
            if (!parentExists){ return next(new Error('Invalid parent reference.'));}
        }
    } catch (err) {
        return next(err);
    }
    next();
});

kidSchema.plugin(validateRefs, {
  refs: [
    { field: 'parent', model: 'User' }
  ]
});

module.exports = mongoose.model('Kid', kidSchema);
