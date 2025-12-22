import 'dotenv/config.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import teamleadRoutes from './routes/teamleadRoutes.js';
import socketHandler from './socket/socketHandler.js';

const app = express();

const CORS_ORIGIN = process.env.CLIENT_URL;
app.use(cors({ 
  origin: CORS_ORIGIN,
  credentials: true, 
  methods: ['GET','POST','PUT','DELETE','OPTIONS'], 
  allowedHeaders: ['Content-Type','Authorization'] }));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/teamlead', teamleadRoutes);

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || '*' } });

socketHandler(io);
// expose io globally so controllers can trigger broadcasts when needed
try { global._io = io; } catch (e) { /* ignore */ }

try {
  await connectDB();
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
} catch (err) {
  console.error('Failed to start server', err);
}
