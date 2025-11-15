// models/VerificationRequest.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
const validateRefs = require("../common/validateRefs");

const SupportingDocSchema = new Schema(
  {
    type: { type: String, required: true },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
  },
  { _id: false }
);

const VerificationSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true },
    incorporationNumber: { type: String, required: true },
    craNumber: { type: String },
    governmentId: {
      fileUrl: { type: String, required: true },
      originalName: { type: String, required: true },
    },
    registrationProof: {
      fileUrl: { type: String, required: true },
      originalName: { type: String, required: true },
    },
    supportingDocs: [SupportingDocSchema],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String },
  },
  { timestamps: true }
);

VerificationSchema.plugin(validateRefs, {
  refs: [
    { field: "churchId", model: "Church" },
    { field: "submittedBy", model: "User" },
  ],
});

module.exports = mongoose.model("Verification", VerificationSchema);
