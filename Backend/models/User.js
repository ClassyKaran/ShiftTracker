import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: { type: String, enum: ["employee", "admin", "teamlead"], default: "employee" },
  isActive: { type: Boolean, default: false },
});

export default mongoose.model("User", UserSchema);
