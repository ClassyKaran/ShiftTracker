import 'dotenv/config.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import socketHandler from './socket/socketHandler.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || '*' } });

// socket handling
socketHandler(io);

try {
  await connectDB();
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
} catch (err) {
  console.error('Failed to start server', err);
}
