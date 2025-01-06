const mongoose = require('mongoose');
const { Schema } = mongoose;
const AddressSchema = require('./address')
let user

const churchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    createdBy: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    shortName: { type: String, required: true },
    emailAddress: { type: String, required: [true, 'Email Address is required'], unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: [true, 'Phone number is required'], unique: true, lowercase: true, trim: true },
    address: { type: AddressSchema, required: [true, 'Please provide a valid address object'],},
    logo: String
}, { timestamps: true });


churchSchema.pre('save', async function (next) {
    if (this.isNew || this.isModified('createdBy')) {
        try {
            const error = new Error('Invalid User reference.');
            if (!user)  user = require('./user')
            return await user.findById(this.createdBy) ? next() : next(error);
        } catch (err) {
            return next(err);
        }
    } else {
        next(); // Skip validation if no change in Church reference
    }
});

churchSchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (update.$set && update.$set.createdBy) {
            const error = new Error('Invalid User reference.');
            if (!user)  user = require('./user')
            return  await Uuer.findById(update.$set.createdBy) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});
module.exports = mongoose.model('Church', churchSchema);
