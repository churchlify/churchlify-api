const mongoose = require('mongoose');
const { Schema } = mongoose;
const AddressSchema = require('./address');
let user;
const validateRefs = require('../common/validateRefs');

const churchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    createdBy: {type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true,},
    shortName: { type: String, required: true },
    emailAddress: { type: String, required: [true, 'Email Address is required'], unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: [true, 'Phone number is required'], unique: true, lowercase: true, trim: true },
    address: { type: AddressSchema, required: [true, 'Please provide a valid address object'],},
    timeZone: { type: String, required: true },
    logo: String
}, { timestamps: true });


churchSchema.pre('save', async function (next) {

    if (this.isNew || this.isModified('createdBy')) {
        try {
            const existError = new Error('Invalid User reference.');
            const isMemberError = new Error('User is already affiliated to a church');
            if (!user) { user = require('./user');}
            const userExist = await user.findById(this.createdBy);
            if(!userExist){ return next(existError);}
            return await userExist.church ? next(isMemberError) : next();
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
            if (!user) { user = require('./user'); }
            return  await user.findById(update.$set.createdBy) ? next() : next(error);
        }
    } catch (err) {
        return next(err);
    }
});
churchSchema.plugin(validateRefs, {
  refs: [
    { field: 'createdBy', model: 'User' }
  ]
});
module.exports = mongoose.model('Church', churchSchema);
