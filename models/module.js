const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true,},
  description: { type: String, trim: true,},
  baseCost: { type: Number, required: true, min: 0,},
  features: [String],  // You can add an array of menu items or features available in this module
},{ timestamps: true });

module.exports = mongoose.model('Module', moduleSchema);