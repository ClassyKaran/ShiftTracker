import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  loginTime: { type: Date, default: Date.now },
  logoutTime: { type: Date },
  // human readable location (reverse-geocoded name)
  locationName: { type: String, default: "" },
  device: { type: String },
  location: { type: String },
  totalDuration: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["online", "offline", "disconnected"],
    default: "online",
  },
  ip: { type: String },
  lastActivity: { type: Date },
  isIdle: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// useful indexes for queries
SessionSchema.index({ userId: 1 });
SessionSchema.index({ status: 1, createdAt: -1 });
SessionSchema.index({ lastActivity: 1 });

export default mongoose.model("Session", SessionSchema);
