// models/User.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const AddressSchema = require('./address')

const userSchema = new mongoose.Schema({
    church: {type: Schema.Types.ObjectId, ref: 'Church'},
    firstName: { type: String, required: [true, 'First name is required'], trim: true, minlength: [2, 'First name must be at least 2 characters long']},
    lastName: {type: String, required: [true, 'Last name is required'], trim: true, minlength: [2, 'Last name must be at least 2 characters long']},
    dateOfBirth: {type: Date, required: [true, "Date of birth is required"]},
    gender: { type: String, enum: ['Male', 'Female'] },
    isMarried: {type:Boolean, default: false},
    anniversaryDate: Date,
    emailAddress: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: [true, 'Phone number is required'], unique: true, lowercase: true, trim: true },
    address: { type: AddressSchema, required: true},
    photoUrl: {type: String},
    pushToken: {type: String},
    firebaseId: String,
    role: { type: String, enum: ['admin', 'member', 'churchAdmin'], default: 'member' }
}, { timestamps: true });


userSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('church')) {
        try {
            if (this.church) {
                const error = new Error('Invalid Church reference.');
                if (typeof church === "undefined" || typeof church === undefined) church = require('./church') 
                return await church.findById(this.church) ? next() : next(error);
              } else{
                next();
              }
        } catch (err) {
            return next(err);
        }
    } else {
        next(); // Skip validation if no change in Church reference
    }
});

userSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.church) {
            const error = new Error('Invalid Church reference.');
            if (!church)  church = require('./church')
            return  await church.findById(update.$set.church) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});
module.exports = mongoose.model('User', userSchema);
