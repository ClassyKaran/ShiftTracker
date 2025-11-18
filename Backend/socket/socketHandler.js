import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';

export default (io) => {
  const onlineMap = new Map(); // userId -> socketId

  io.on('connection', async (socket) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return socket.disconnect(true);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.id);
      if (!user) return socket.disconnect(true);

      onlineMap.set(String(user._id), socket.id);
      user.isActive = true;
      await user.save();

      // Create session if none active
      let session = await Session.findOne({ userId: user._id, status: 'online' });
      if (!session) {
        session = await Session.create({ userId: user._id, status: 'online', ip: socket.handshake.address });
      } else {
        session.status = 'online';
        await session.save();
      }

      // notify all clients (admins will show list)
      io.emit('user_online', { _id: user._id, name: user.name, employeeId: user.employeeId, loginTime: session.loginTime, status: 'online' });
      const sessions = await Session.find({ status: { $in: ['online', 'disconnected'] } }).populate('userId', 'name employeeId');
      const users = sessions.map(s => ({ _id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId, loginTime: s.loginTime, status: s.status }));
      io.emit('users_list_update', { users });

      socket.on('disconnect', async (reason) => {
        try {
          // mark disconnected
          onlineMap.delete(String(user._id));
          user.isActive = false;
          await user.save();
          // update session status to disconnected
          const sess = await Session.findOne({ userId: user._id, status: 'online' }).sort({ createdAt: -1 });
          if (sess) {
            sess.status = 'disconnected';
            await sess.save();
          }
          io.emit('user_disconnected', { _id: user._id, name: user.name, employeeId: user.employeeId, status: 'disconnected' });
          const sessions2 = await Session.find({ status: { $in: ['online', 'disconnected'] } }).populate('userId', 'name employeeId');
          const users2 = sessions2.map(s => ({ _id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId, loginTime: s.loginTime, status: s.status }));
          io.emit('users_list_update', { users: users2 });
        } catch (e) {
          console.error('socket disconnect handler error', e);
        }
      });

    } catch (e) {
      console.error('socket auth error', e);
      socket.disconnect(true);
    }
  });
};
