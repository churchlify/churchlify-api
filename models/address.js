const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub-document schema (nested)
const addressSchema = new Schema({
    state: { type: String, required: [true, 'State or Province is required'], },
    postalCode: { type: String, required: [true, 'Postal code is required'], },
    street: { type: String, required: [true, 'Street address is required'],},
    city: { type: String, required: [true, 'City is required'],},
    country: { type: String, required: [true, 'Country is required'],},
    lat: { type: String, required: [true, 'Lat Coordinate is required'],},
    lng: { type: String, required: [true, ' Long Coordinate is required'],},
},{ timestamps: true });

module.exports = addressSchema;
