const mongoose = require('mongoose');

const NotificationStatusSchema = new mongoose.Schema({
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notifications', required: true }, 
    recipient: { type: String, required: true }, 
    status: { type: String, default: 'sent', required: true }, 
    details: { type: mongoose.Schema.Types.Mixed }, 
    deliveryTime: { type: Date }, 
    providerMessageId: { type: String }, 
},{timestamps: true});


NotificationStatusSchema.index({ batchId: 1, recipient: 1 });
NotificationStatusSchema.index({ deliveryTime: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });


module.exports = mongoose.model('NotificationStatus', NotificationStatusSchema);