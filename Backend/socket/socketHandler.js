import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';

export default (io) => {
  const onlineMap = new Map(); // userId -> socketId

  // periodic broadcast to ensure dashboards receive updates even when heartbeats are sparse
  if (!io._shiftBroadcastInterval) {
    const broadcastLatest = async () => {
      try {
        const pipeline = [
          { $match: { status: { $in: ['online', 'disconnected', 'offline'] } } },
          { $sort: { createdAt: -1 } },
          { $group: {
            _id: '$userId',
            sessionId: { $first: '$_id' },
            loginTime: { $first: '$loginTime' },
            logoutTime: { $first: '$logoutTime' },
            status: { $first: '$status' },
            totalDuration: { $first: '$totalDuration' },
            device: { $first: '$device' },
            location: { $first: '$location' },
            locationName: { $first: '$locationName' },
            ip: { $first: '$ip' },
            lastActivity: { $first: '$lastActivity' },
            isIdle: { $first: '$isIdle' },
          } },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $project: {
            _id: '$user._id',
            name: '$user.name',
            employeeId: '$user.employeeId',
            loginTime: '$loginTime',
            logoutTime: '$logoutTime',
            status: '$status',
            totalDuration: '$totalDuration',
            device: '$device',
            location: '$location',
            locationName: '$locationName',
            ip: '$ip',
            lastActivity: '$lastActivity',
            isIdle: '$isIdle',
          } },
          { $sort: { name: 1 } },
        ];
        const docs = await Session.aggregate(pipeline);
        const usersOut = docs.map(s => ({
          _id: s._id,
          name: s.name,
          employeeId: s.employeeId,
          loginTime: s.loginTime,
          logoutTime: s.logoutTime || null,
          status: s.status,
          totalDuration: s.status === 'online' ? Math.floor(Math.max(0, (Date.now() - new Date(s.loginTime)) / 1000)) : (s.totalDuration || 0),
          device: s.device || null,
          location: s.location || null,
          locationName: s.locationName || null,
          ip: s.ip || null,
          lastActivity: s.lastActivity || null,
          isIdle: s.isIdle || false,
        }));
        // include global user counts (so admins see offline users even without recent sessions)
        const totalUsers = await User.countDocuments();
        const onlineUsers = await User.countDocuments({ isActive: true });
        const counts = {
          online: onlineUsers,
          offline: Math.max(0, totalUsers - onlineUsers),
          disconnected: usersOut.filter(u => u.status === 'disconnected').length,
          idle: usersOut.filter(u => !!u.isIdle).length,
          total: totalUsers,
        };
        io.emit('users_list_update', { users: usersOut, counts, emittedAt: new Date() });
      } catch (e) {
        console.error('broadcastLatest error', e);
      }
    };

    // expose this fn so other parts of the app can trigger an immediate broadcast
    io._shiftBroadcastInterval = setInterval(broadcastLatest, 15000); // every 15s
    // attach a named helper to io so controllers can trigger immediate broadcasts
    io._broadcastLatestNow = broadcastLatest;
  }

  io.on('connection', async (socket) => {
    try {
      console.log('[Socket] New connection attempt, socket ID:', socket.id);
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) {
        console.warn('[Socket] No token provided, disconnecting');
        return socket.disconnect(true);
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.id);
      if (!user) {
        console.warn('[Socket] User not found for token');
        return socket.disconnect(true);
      }

      console.log('[Socket] User authenticated:', user.name, '(' + user._id + ')');
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

      // notify connected clients
      io.emit('user_online', { _id: user._id, name: user.name, employeeId: user.employeeId, loginTime: session.loginTime, status: 'online' });

      // helper to build latest-per-user payload
      const buildUsersPayload = async () => {
        try {
          const pipeline = [
            { $match: { status: { $in: ['online', 'disconnected', 'offline'] } } },
            { $sort: { createdAt: -1 } },
            { $group: {
              _id: '$userId',
              sessionId: { $first: '$_id' },
              loginTime: { $first: '$loginTime' },
              logoutTime: { $first: '$logoutTime' },
              status: { $first: '$status' },
              totalDuration: { $first: '$totalDuration' },
              device: { $first: '$device' },
              location: { $first: '$location' },
              locationName: { $first: '$locationName' },
              ip: { $first: '$ip' },
              lastActivity: { $first: '$lastActivity' },
              isIdle: { $first: '$isIdle' },
            } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $project: {
              _id: '$user._id',
              name: '$user.name',
              employeeId: '$user.employeeId',
              loginTime: '$loginTime',
              logoutTime: '$logoutTime',
              status: '$status',
              totalDuration: '$totalDuration',
              device: '$device',
              location: '$location',
              locationName: '$locationName',
              ip: '$ip',
              lastActivity: '$lastActivity',
              isIdle: '$isIdle',
            } },
            { $sort: { name: 1 } },
          ];
          const docs = await Session.aggregate(pipeline);
          const usersOut = docs.map(s => ({
            _id: s._id,
            name: s.name,
            employeeId: s.employeeId,
            loginTime: s.loginTime,
            logoutTime: s.logoutTime || null,
            status: s.status,
            totalDuration: s.status === 'online' ? Math.floor(Math.max(0, (Date.now() - new Date(s.loginTime)) / 1000)) : (s.totalDuration || 0),
            device: s.device || null,
            location: s.location || null,
            locationName: s.locationName || null,
            ip: s.ip || null,
            lastActivity: s.lastActivity || null,
            isIdle: s.isIdle || false,
          }));
          const totalUsers = await User.countDocuments();
          const onlineUsers = await User.countDocuments({ isActive: true });
          const counts = {
            online: onlineUsers,
            offline: Math.max(0, totalUsers - onlineUsers),
            disconnected: usersOut.filter(u => u.status === 'disconnected').length,
            idle: usersOut.filter(u => !!u.isIdle).length,
            total: totalUsers,
          };
          return { users: usersOut, counts };
        } catch (e) {
          console.error('buildUsersPayload error', e);
          return { users: [], counts: { online: 0, offline: 0, disconnected: 0, total: 0 } };
        }
      };

      const pld = await buildUsersPayload();
      io.emit('users_list_update', { users: pld.users, counts: pld.counts, emittedAt: new Date() });

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
          const sessions2 = await Session.find({ status: { $in: ['online', 'disconnected', 'offline'] } }).populate('userId', 'name employeeId');
          const users2 = sessions2
            .filter(s => s.userId)
            .map(s => {
              const total = s.status === 'online' ? Math.max(0, (Date.now() - new Date(s.loginTime)) / 1000) : (s.totalDuration || 0);
              return { _id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId, loginTime: s.loginTime, logoutTime: s.logoutTime || null, status: s.status, totalDuration: Math.floor(total), device: s.device || null, location: s.location || null, ip: s.ip || null, lastActivity: s.lastActivity || null, isIdle: s.isIdle || false };
            });
          const totalUsers2 = await User.countDocuments();
          const onlineUsers2 = await User.countDocuments({ isActive: true });
          const counts2 = {
            online: onlineUsers2,
            offline: Math.max(0, totalUsers2 - onlineUsers2),
            disconnected: users2.filter(u => u.status === 'disconnected').length,
            idle: users2.filter(u => !!u.isIdle).length,
            total: totalUsers2,
          };
          io.emit('users_list_update', { users: users2, counts: counts2, emittedAt: new Date() });
        } catch (e) {
          console.error('socket disconnect handler error', e);
        }
      });

      // listen for heartbeat/idle events from client
      socket.on('heartbeat', async (payload) => {
        try {
          const now = new Date();
          // atomically update the latest online session for this user
          const sess = await Session.findOneAndUpdate({ userId: user._id, status: 'online' }, { $set: { lastActivity: now, isIdle: !!payload?.isIdle } }, { new: true, sort: { createdAt: -1 } });
          if (sess) {
            const p = await buildUsersPayload();
            io.emit('users_list_update', { users: p.users, counts: p.counts, emittedAt: new Date() });
          }
        } catch (e) {
          console.error('heartbeat handler error', e);
        }
      });

      // ====== SCREEN SHARING FUNCTIONALITY ======
      // Employee emits screen frame - broadcast to ALL admins/viewers
      socket.on('employee-screen-frame', (frameData) => {
        try {
          if (!frameData) {
            console.warn('[Socket] Empty frame data from', user.name);
            return;
          }

          console.log('[Socket] Broadcasting frame from', user.name, '(' + user._id + ')', 'size:', frameData.length, 'bytes');
          
          // Broadcast to ALL connected clients with employeeId so admins know who it's from
          io.emit('admin-receive-frame', {
            frame: frameData,
            employeeId: String(user._id),
            employeeName: user.name
          });
        } catch (e) {
          console.error('[Socket] Frame error:', e.message);
        }
      });

      // Handle screen sharing permission request (optional - for future enhancement)
      socket.on('request-screen-permission', (payload) => {
        try {
          const targetUserId = payload?.targetUserId;
          const adminId = user._id;
          
          // Find the target employee's socket to send notification
          const targetSocket = Array.from(io.sockets.sockets.values()).find(s => {
            const decodedToken = jwt.verify(s.handshake.auth?.token, process.env.JWT_SECRET || 'secret');
            return String(decodedToken.id) === String(targetUserId);
          });
          
          if (targetSocket) {
            targetSocket.emit('admin-screen-request', {
              adminId,
              adminName: user.name,
              message: `Admin ${user.name} is requesting to view your screen`,
            });
          }
        } catch (e) {
          console.error('request-screen-permission error', e);
        }
      });

      // Employee approves/denies screen share
      socket.on('screen-permission-response', (payload) => {
        try {
          const adminId = payload?.adminId;
          const approved = payload?.approved;
          
          // Notify the admin about the response
          io.emit('screen-permission-response', {
            adminId,
            employeeId: user._id,
            employeeName: user.name,
            approved,
          });
        } catch (e) {
          console.error('screen-permission-response error', e);
        }
      });

    } catch (e) {
      console.error('socket auth error', e);
      socket.disconnect(true);
    }
  });
};
