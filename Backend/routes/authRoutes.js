import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { auth, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password)
    return res.status(400).json({ message: "Missing credentials" });
  const user = await User.findOne({ employeeId });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: "Invalid credentials" });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", {
    expiresIn: "8h",
  });
  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      employeeId: user.employeeId,
      role: user.role,
    },
  });
});

router.post("/add-user", auth, adminOnly, async (req, res) => {
  try {
    const { name, employeeId, password, role } = req.body;
    if (!name || !employeeId || !password)
      return res.status(400).json({ message: "Missing fields" });
    const existing = await User.findOne({ employeeId });
    if (existing)
      return res.status(400).json({ message: "Employee ID exists" });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      employeeId,
      password: hashed,
      role: role || "employee",
    });
    return res
      .status(201)
      .json({
        user: {
          id: user._id,
          name: user.name,
          employeeId: user.employeeId,
          role: user.role,
        },
      });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to add user" });
  }
});

router.get("/me", auth, async (req, res) => {
  return res.json({ user: req.user });
});

export default router;
