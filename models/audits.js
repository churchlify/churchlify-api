const mongoose = require('mongoose');

// Sub-document schema (nested)
const auditSchema = new mongoose.Schema({
    url: { type: String, required: true, index: true },
    activity: { type: String, required: true, index: true },
    params: { type: String, required: true },
    query: { type: String, required: true },
    payload: { type: String, required: true },
    headers: { type: String, required: true },
    response: { type: String, required: true },
} ,{ timestamps: true });

// TTL index to auto-delete old records after 90 days
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
auditSchema.index({ url: 1, createdAt: -1 });
auditSchema.index({ activity: 1, createdAt: -1 });
module.exports = mongoose.model('Audit', auditSchema);
