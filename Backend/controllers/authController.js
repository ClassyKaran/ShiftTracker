import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const login = async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password)
    return res.status(400).json({ message: 'Missing credentials' });
  try {
    const user = await User.findOne({ employeeId });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (e) {
    console.error('Login error', e);
    return res.status(500).json({ message: 'Login failed' });
  }
};

export const addUser = async (req, res) => {
  try {
    const { name, employeeId, password, role } = req.body;
    if (!name || !employeeId || !password)
      return res.status(400).json({ message: 'Missing fields' });
    const existing = await User.findOne({ employeeId });
    if (existing) return res.status(400).json({ message: 'Employee ID exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      employeeId,
      password: hashed,
      role: role || 'employee',
    });
    return res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (e) {
    console.error('Add user error', e);
    return res.status(500).json({ message: 'Failed to add user' });
  }
};

export const me = async (req, res) => {
  return res.json({ user: req.user });
};

export const listUsers = async (req, res) => {
  try {
    const users = await User.find().select('_id name employeeId role isActive');
    return res.json({ users });
  } catch (e) {
    console.error('List users error', e);
    return res.status(500).json({ message: 'Failed to list users' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, employeeId, role, password } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (employeeId && employeeId !== user.employeeId) {
      const exists = await User.findOne({ employeeId });
      if (exists) return res.status(400).json({ message: 'Employee ID exists' });
      user.employeeId = employeeId;
    }
    if (name) user.name = name;
    if (role) user.role = role;
    if (password) user.password = await bcrypt.hash(password, 10);
    await user.save();
    return res.json({ user: { id: user._id, name: user.name, employeeId: user.employeeId, role: user.role } });
  } catch (e) {
    console.error('Update user error', e);
    return res.status(500).json({ message: 'Failed to update user' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await User.findByIdAndDelete(id);
    return res.json({ message: 'User deleted' });
  } catch (e) {
    console.error('Delete user error', e);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
};

export const findByEmployeeId = async (req, res) => {
  try {
    const employeeId = req.query.employeeId || req.body.employeeId;
    if (!employeeId) return res.status(400).json({ message: 'employeeId required' });
    const user = await User.findOne({ employeeId }).select('_id name employeeId role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (e) {
    console.error('Find by employeeId error', e);
    return res.status(500).json({ message: 'Failed to find user' });
  }
};
