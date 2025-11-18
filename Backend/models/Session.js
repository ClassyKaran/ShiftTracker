import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  loginTime: { type: Date, default: Date.now },
  logoutTime: { type: Date },
  totalDuration: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["online", "offline", "disconnected"],
    default: "online",
  },
  ip: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Session", SessionSchema);
