// models/auth.js
//This is created for documentation purpose only
const mongoose = require('mongoose');
const { Schema } = mongoose;

const authSchema = new Schema({
  email: String,
  password: String
});

module.exports = mongoose.model('Auth', authSchema);
