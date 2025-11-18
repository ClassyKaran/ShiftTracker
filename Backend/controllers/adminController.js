import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import connectDB from '../config/db.js';

// load .env located at project root (Backend/.env) regardless of CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const run = async () => {
  // use central DB connector which reads process.env.MONGO_URI
  await connectDB();

  const employeeId = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  const name = process.argv[4] || 'Administrator';
  const existing = await User.findOne({ employeeId });
  if (existing) {
    console.log('Admin already exists');
    process.exit(0);
  }
  const hashed = await bcrypt.hash(password, 10);
  await User.create({ name, employeeId, password: hashed, role: 'admin' });
  console.log('Admin created:', employeeId);
  process.exit(0);
};

run().catch(e => { console.error(e); process.exit(1); });
