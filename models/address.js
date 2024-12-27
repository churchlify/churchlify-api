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
});

// Example of validation middleware for the sub-document
// addressSchema.pre('save', function(next) {
//     // Custom validation or manipulation before saving
//     if (!this.country) {
//         return next(new Error('Country is required.'));
//     }
//     if (!this.street) {
//         return next(new Error('Street address is required.'));
//     }
//     if (!this.city) {
//         return next(new Error('City is required.'));
//     }
//     if (!this.state) {
//         return next(new Error('State or Province is required.'));
//     }
//     if (!this.postalCode) {
//         return next(new Error('Postal code is required.'));
//     }
//     next();
// });

module.exports = addressSchema;
