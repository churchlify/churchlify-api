const mongoose = require('mongoose');

const TimezoneSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true },
  continent: { type: String, required: true }
});

module.exports = mongoose.model('Timezone', TimezoneSchema);