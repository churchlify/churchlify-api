const mongoose = require('mongoose');

// Sub-document schema (nested)
const auditSchema = new mongoose.Schema({
    url: { type: String, required: true },
    activity: { type: String, required: true },
    params: { type: String, required: true },
    query: { type: String, required: true },
    payload: { type: String, required: true },
    headers: { type: String, required: true },
    response: { type: String, required: true },
} ,{ timestamps: true });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 days
module.exports = mongoose.model('Audit', auditSchema);
