const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub-document schema (nested)
const addressSchema = new Schema({
    state: { type: String, required: [true, 'State or Province is required'], },
    postalCode: { type: String, required: [true, 'Postal code is required'], },
    street: { type: String, required: [true, 'Street address is required'],},
    city: { type: String, required: [true, 'City is required'],},
    country: { type: String, required: [true, 'Country is required'],},
    location: { 
        type: { type: String, enum: ['Point'], required: true, default: 'Point' },
        coordinates: { 
        type: [Number], required: true, 
        validate: { validator: (val) => val.length === 2,  message: 'Coordinates must be an array of [lng, lat]'},
        },
  },
},{ timestamps: true });
addressSchema.index({ location: '2dsphere' });
module.exports = addressSchema;
