const mongoose = require("mongoose");
const validateRefs = require("../common/validateRefs");

const NotificationsSchema = new mongoose.Schema(
  {
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Church",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, enum: ["push", "email", "voice"], required: true },
    provider: {
      type: String,
      enum: ["firebase", "sendpulse", "twilio"],
      required: true,
    },
    status: { type: String, default: "pending", required: true },
    totalRecipients: { type: Number, required: true },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    content: {
      subject: { type: String, trim: true },
      body: { type: String, required: true },
    },
    jobQueueId: { type: String },
  },
  { timestamps: true }
);

NotificationsSchema.plugin(validateRefs, {
  refs: [
    { field: "church", model: "Church" },
    { field: "author", model: "User" },
  ],
});

module.exports = mongoose.model("Notifications", NotificationsSchema);
