const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub-document schema (nested)
const auditSchema = new mongoose.Schema({
    url: { type: String, required: true },
    activity: { type: String, required: true },
    params: { type: String, required: true },
    query: { type: String, required: true },
    payload: { type: String, required: true },
    response: { type: String, required: true },
} ,{ timestamps: true });
module.exports = mongoose.model('Audit', auditSchema);
