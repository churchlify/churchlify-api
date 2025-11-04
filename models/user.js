// models/User.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const AddressSchema = require('./address');
const validateRefs = require('../common/validateRefs');
const applyUserHooks = require('../hooks/userHooks');

const userSchema = new mongoose.Schema({
    church: {type: Schema.Types.ObjectId, ref: 'Church', index: true },
    firstName: { type: String, required: [true, 'First name is required'], trim: true, minlength: [2, 'First name must be at least 2 characters long']},
    lastName: {type: String, required: [true, 'Last name is required'], trim: true, minlength: [2, 'Last name must be at least 2 characters long']},
    dateOfBirth: {type: Date, required: [true, 'Date of birth is required']},
    gender: { type: String, enum: ['Male', 'Female'] },
    isMarried: {type:Boolean, default: false},
    anniversaryDate: Date,
    emailAddress: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: [true, 'Phone number is required'], unique: true, lowercase: true, trim: true },
    address: { type: AddressSchema, required: true},
    photoUrl: {type: String},
    pushToken: {type: String},
    muteNotifications: { type: Boolean, default: false },
    lastUsedToken: { type: String },
    adminAt: {type: Schema.Types.ObjectId, ref: 'Church'},
    firebaseId: { type: String, required: [true, 'firebaseId is required'], unique: true, trim: true },
    role: { type: String, enum: ['super', 'member', 'admin'], default: 'member' }
}, { timestamps: true });

userSchema.plugin(validateRefs, {
  refs: [
    { field: 'church', model: 'Church' },
    { field: 'adminAt', model: 'Church' }
  ]
});
applyUserHooks(userSchema);

module.exports = mongoose.model('User', userSchema);
