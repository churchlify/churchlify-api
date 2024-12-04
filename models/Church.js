const mongoose = require('mongoose');
const AddressSchema = require('./address')

const churchSchema = new mongoose.Schema({
    name: String,
    shortName: { type: String, required: true },
    emailAddress: { type: String, required: [true, 'Email Address is required'], unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: [true, 'Phone number is required'], unique: true, lowercase: true, trim: true },
    address: { type: AddressSchema, required: [true, 'Please provide a valid address object'],},
    logo: String
}, { timestamps: true });
module.exports = mongoose.model('Church', churchSchema);
