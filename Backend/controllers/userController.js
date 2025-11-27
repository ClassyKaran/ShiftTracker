import Session from "../models/Session.js";
import User from "../models/User.js";
import { reverseGeocode } from "../utils/geocode.js";

// -------------------- STATS / ALERTS --------------------
export const stats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = Math.max(0, totalUsers - onlineUsers);
    const offlineUsersArr = await Session.find({ status: "offline" }).distinct(
      "userId"
    );
    const offlineUsers = offlineUsersArr.length;

    return res.json({ totalUsers, onlineUsers, inactiveUsers, offlineUsers });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
};

export const alerts = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );

    // late join: loginTime after 09:30 today
    const lateJoin = await Session.find({
      loginTime: { $gte: todayStart },
      status: { $in: ["online", "offline", "disconnected"] },
    })
      .populate("userId", "name employeeId")
      .then((arr) =>
        arr
          .filter((s) => {
            const hour = s.loginTime.getHours() + s.loginTime.getMinutes() / 60;
            return hour >= 9.5; // 9:30 AM or later
          })
          .map((s) => ({
            sessionId: s._id,
            user: s.userId
              ? {
                  id: s.userId._id,
                  name: s.userId.name,
                  employeeId: s.userId.employeeId,
                }
              : null,
            loginTime: s.loginTime,
          }))
      );

    // extended shift: sessions whose totalDuration > 9 hours (32400s)
    const extended = await Session.find({ totalDuration: { $gt: 32400 } })
      .populate("userId", "name employeeId")
      .limit(50)
      .sort({ createdAt: -1 });
    const extendedShift = extended.map((s) => ({
      sessionId: s._id,
      user: s.userId
        ? {
            id: s.userId._id,
            name: s.userId.name,
            employeeId: s.userId.employeeId,
          }
        : null,
      totalDuration: s.totalDuration,
    }));

    // unexpected disconnect: sessions with status disconnected in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const disconnects = await Session.find({
      status: "disconnected",
      createdAt: { $gte: since },
    })
      .populate("userId", "name employeeId")
      .limit(50)
      .sort({ createdAt: -1 });
    const unexpectedDisconnect = disconnects.map((s) => ({
      sessionId: s._id,
      user: s.userId
        ? {
            id: s.userId._id,
            name: s.userId.name,
            employeeId: s.userId.employeeId,
          }
        : null,
      createdAt: s.createdAt,
    }));

    return res.json({ lateJoin, extendedShift, unexpectedDisconnect });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to compute alerts" });
  }
};

// -------------------- START SESSION --------------------
export const start = async (req, res) => {
  try {
    const user = req.user;
    const ip = req.ip || req.headers["x-forwarded-for"] || "";

    const { device, location } = req.body || {};

    // Prevent double-login: if there is an active online or disconnected session, resume it
    let existing = await Session.findOne({
      userId: user._id,
      status: { $in: ["online", "disconnected"] },
    }).sort({ createdAt: -1 });
    if (existing) {
      // update ip/device/location if provided
      existing.ip = ip || existing.ip;
      existing.device = device || existing.device;
      existing.location = location || existing.location;
      existing.lastActivity = new Date();
      // if previously disconnected, mark back to online
      existing.status = "online";
      await existing.save();
      user.isActive = true;
      await user.save();
      return res.json({ session: existing, message: "resumed" });
    }

    const sessionData = {
      userId: user._id,
      ip,
      device: device || req.headers["user-agent"] || "",
      location: location || "",
      lastActivity: new Date(),
      status: "online",
    };

    // If location looks like coordinates, attempt server-side reverse geocode
    try {
      if (location) {
        // accept { lat, lng } or string "lat,lng"
        let lat = null,
          lng = null;
        if (typeof location === "object" && location.lat && location.lng) {
          lat = location.lat;
          lng = location.lng;
        }
        if (typeof location === "string" && location.indexOf(",") !== -1) {
          const parts = location.split(",").map((p) => p.trim());
          const a = parseFloat(parts[0]);
          const b = parseFloat(parts[1]);
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            lat = a;
            lng = b;
          }
        }
        if (lat != null && lng != null) {
          const geo = await reverseGeocode(lat, lng);
          if (geo && geo.name) sessionData.locationName = geo.name;
        }
      }
    } catch (e) {
      console.warn("geocode on start failed", e.message || e);
    }

    const session = await Session.create(sessionData);

    user.isActive = true;
    await user.save();

    return res.json({ session });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to start session" });
  }
};

// -------------------- END SESSION --------------------
export const end = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const user = req.user;

    let session;

    if (sessionId) {
      session = await Session.findById(sessionId);
    } else {
      session = await Session.findOne({
        userId: user._id,
        status: "online",
      }).sort({ createdAt: -1 });
    }

    if (!session) return res.status(400).json({ message: "No active session" });

    session.logoutTime = new Date();
    session.totalDuration = Math.max(
      0,
      (session.logoutTime - session.loginTime) / 1000
    );
    session.status = "offline";

    await session.save();

    user.isActive = false;
    await user.save();

    return res.json({ session });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to end session" });
  }
};

// support beacon-style end where token may be provided in body
export const endBeacon = async (req, res) => {
  try {
    const { sessionId, token } = req.body || {};
    let user = null;
    if (token) {
      const jwt = await import("jsonwebtoken");
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        user = await User.findById(decoded.id);
      } catch (e) {
        // ignore - will try sessionId path
      }
    }

    let session;
    if (sessionId) {
      session = await Session.findById(sessionId);
    } else if (user) {
      session = await Session.findOne({
        userId: user._id,
        status: "online",
      }).sort({ createdAt: -1 });
    }

    if (!session) return res.status(400).json({ message: "No active session" });

    // mark session as disconnected rather than ending it — don't set logoutTime or totalDuration
    session.status = "disconnected";
    session.lastActivity = new Date();
    await session.save();

    // keep user.isActive true so the shift remains active until explicit end
    return res.json({ session });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to end session (beacon)" });
  }
};

// -------------------- ACTIVE USERS (FIXED) --------------------
export const active = async (req, res) => {
  try {
    // Use aggregation to pick the latest session per user, including admin and teamlead
    const pipeline = [
      { $match: { status: { $in: ["online", "disconnected", "offline"] } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          sessionId: { $first: "$_id" },
          loginTime: { $first: "$loginTime" },
          logoutTime: { $first: "$logoutTime" },
          status: { $first: "$status" },
          totalDuration: { $first: "$totalDuration" },
          device: { $first: "$device" },
          location: { $first: "$location" },
          locationName: { $first: "$locationName" },
          ip: { $first: "$ip" },
          createdAt: { $first: "$createdAt" },
          lastActivity: { $first: "$lastActivity" },
          isIdle: { $first: "$isIdle" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: "$user._id",
          name: "$user.name",
          employeeId: "$user.employeeId",
          role: "$user.role",
          loginTime: "$loginTime",
          logoutTime: "$logoutTime",
          status: "$status",
          totalDuration: "$totalDuration",
          device: "$device",
          location: "$location",
          locationName: "$locationName",
          ip: "$ip",
          lastActivity: "$lastActivity",
          isIdle: "$isIdle",
        },
      },
      { $sort: { name: 1 } },
    ];

    const users = await Session.aggregate(pipeline);
    // compute live totalDuration for online users
    const usersWithTotal = users.map((s) => {
      const total =
        s.status === "online"
          ? Math.max(0, (Date.now() - new Date(s.loginTime)) / 1000)
          : s.totalDuration || 0;
      return { ...s, totalDuration: Math.floor(total) };
    });

    return res.json({ users: usersWithTotal });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch active users" });
  }
};

// -------------------- LOGS --------------------
export const logs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      from,
      to,
      userId,
      status,
      employeeId,
    } = req.query || {};
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));

    const filter = {};
    if (from)
      filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to)
      filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    // if employeeId provided, resolve matching user(s)
    if (employeeId) {
      const users = await User.find({ employeeId: String(employeeId) }).select(
        "_id"
      );
      const ids = users.map((u) => u._id);
      filter.userId = { $in: ids };
    }

    const sessions = await Session.find(filter)
      .populate("userId", "name employeeId")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l);

    // map to include device/location
    const mapped = sessions.map((s) => ({
      sessionId: s._id,
      user: s.userId
        ? {
            id: s.userId._id,
            name: s.userId.name,
            employeeId: s.userId.employeeId,
          }
        : null,
      loginTime: s.loginTime,
      logoutTime: s.logoutTime || null,
      totalDuration: s.totalDuration || 0,
      status: s.status,
      device: s.device || null,
      location: s.location || null,
      locationName: s.locationName || null,
      ip: s.ip || null,
      createdAt: s.createdAt,
    }));

    // also return paging info
    const total = await Session.countDocuments(filter);
    return res.json({ sessions: mapped, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
};

// -------------------- EXPORT CSV --------------------
export const exportLogs = async (req, res) => {
  try {
    const {
      from,
      to,
      userId,
      status,
      employeeId,
      limit = 10000,
    } = req.query || {};
    const filter = {};
    if (from)
      filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to)
      filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (employeeId) {
      const users = await User.find({ employeeId: String(employeeId) }).select(
        "_id"
      );
      const ids = users.map((u) => u._id);
      filter.userId = { $in: ids };
    }

    const lim = Math.min(50000, parseInt(limit, 10) || 10000);
    const sessions = await Session.find(filter)
      .populate("userId", "name employeeId")
      .sort({ createdAt: -1 })
      .limit(lim);
    const rows = sessions.map((s) => ({
      sessionId: s._id,
      name: s.userId ? s.userId.name : "",
      employeeId: s.userId ? s.userId.employeeId : "",
      loginTime: s.loginTime ? s.loginTime.toISOString() : "",
      logoutTime: s.logoutTime ? s.logoutTime.toISOString() : "",
      totalDuration: s.totalDuration || 0,
      status: s.status,
      device: s.device || "",
      location: s.location || "",
      locationName: s.locationName || "",
      ip: s.ip || "",
    }));
    const header = [
      "sessionId",
      "name",
      "employeeId",
      "loginTime",
      "logoutTime",
      "totalDuration",
      "status",
      "device",
      "location",
      "locationName",
      "ip",
    ];
    const csv = [header.join(",")]
      .concat(
        rows.map((r) => header.map((h) => `"${String(r[h] || "")}"`).join(","))
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sessions-${Date.now()}.csv"`
    );
    return res.send(csv);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to export logs" });
  }
};

// -------------------- CLEANUP --------------------
export const cleanup = async (req, res) => {
  try {
    // remove sessions with null userId older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await Session.deleteMany({
      userId: null,
      createdAt: { $lt: cutoff },
    });
    return res.json({ deleted: result.deletedCount });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Cleanup failed" });
  }
};
