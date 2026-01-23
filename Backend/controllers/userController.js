

import Session from "../models/Session.js";
import User from "../models/User.js";
import { reverseGeocode } from "../utils/geocode.js";
import jwt from "jsonwebtoken";

// Optional: node-cron for scheduled jobs. If not installed, scheduled tasks are skipped but controllers still work.
let cron;
try {
  cron = (await import("node-cron")).default;
} catch (e) {
  cron = null;
}

// -------------------- CONFIG --------------------
const CONFIG = {
  TIMEZONE: "Asia/Kolkata", // IST
  IDLE_MINUTES: 5, // <-- changed to 5 minutes as requested
  DISCONNECT_MINUTES: 5, // disconnected -> offline after this many minutes
  ARCHIVE_DAYS: parseInt(process.env.ARCHIVE_DAYS || "90", 10),
  DELETE_ARCHIVE_DAYS: parseInt(process.env.DELETE_ARCHIVE_DAYS || "365", 10),
  CSV_RETENTION_DAYS: parseInt(process.env.CSV_RETENTION_DAYS || "30", 10),
  DAILY_CLEAN_HOUR: 10, // 10:20 AM IST run daily cleanup
  DAILY_CLEAN_MINUTE: 20,
  // Shift / break times in 24h local time (IST)
  SHIFT_START_HOUR: 10,
  SHIFT_START_MIN: 30, // 10:30 start
  SHIFT_END_HOUR: 18,
  SHIFT_END_MIN: 30, // 18:30 end
  MORNING_LATE_CUTOFF_MIN_AFTER_START: 5, // 10:35
  LUNCH_START_HOUR: 13,
  LUNCH_START_MIN: 0,
  LUNCH_END_HOUR: 13,
  LUNCH_END_MIN: 45,
  LUNCH_GRACE_MIN_AFTER_END: 5, // 1:50
  TEA_START_HOUR: 16,
  TEA_START_MIN: 0,
  TEA_END_HOUR: 16,
  TEA_END_MIN: 15,
  TEA_GRACE_MIN_AFTER_END: 5, // 4:20
};

// -------------------- Helpers (IST-safe) --------------------
function toIST(date = new Date()) {
  const s = date.toLocaleString("en-US", { timeZone: CONFIG.TIMEZONE });
  return new Date(s);
}

function startOfDayIST(date = new Date()) {
  const z = toIST(date);
  return new Date(z.getFullYear(), z.getMonth(), z.getDate(), 0, 0, 0);
}

function combineIST(dateIST, hour, minute) {
  const z = toIST(dateIST);
  return new Date(z.getFullYear(), z.getMonth(), z.getDate(), hour, minute, 0);
}

function toISOStringSafe(d) {
  return d ? new Date(d).toISOString() : "";
}

function secondsBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 1000));
}

/**
 * computeTotalDuration(loginTime, logoutTime, fallback)
 * - unchanged for compatibility: returns seconds between login & logout (or to now)
 */
function computeTotalDuration(loginTime, logoutTime, fallback = 0) {
  if (!loginTime) return fallback;
  if (!logoutTime)
    return Math.max(0, Math.floor((Date.now() - new Date(loginTime)) / 1000));
  return Math.max(
    0,
    Math.floor((new Date(logoutTime) - new Date(loginTime)) / 1000)
  );
}

// clamp a timestamp into the same day's office window (IST)
function clampToOfficeWindow(ts) {
  if (!ts) return null;
  const tIST = toIST(new Date(ts));
  const y = tIST.getFullYear(), m = tIST.getMonth(), d = tIST.getDate();
  const officeStart = new Date(y, m, d, CONFIG.SHIFT_START_HOUR, CONFIG.SHIFT_START_MIN, 0);
  const officeEnd = new Date(y, m, d, CONFIG.SHIFT_END_HOUR, CONFIG.SHIFT_END_MIN, 0);
  if (tIST < officeStart) return officeStart;
  if (tIST > officeEnd) return officeEnd;
  return tIST;
}

// add active seconds to session.totalDuration between fromTs and toTs, but only inside office window and respecting loginTime
async function addActiveSeconds(session, fromTs, toTs) {
  if (!session || !fromTs || !toTs) return 0;
  // convert to Date
  const from = new Date(fromTs);
  const to = new Date(toTs);
  if (to <= from) return 0;

  // clamp both to office window of the day corresponding to 'from'
  const fromClamped = clampToOfficeWindow(from);
  const toClamped = clampToOfficeWindow(to);
  if (!fromClamped || !toClamped) return 0;
  if (toClamped <= fromClamped) return 0;

  // also ensure we don't count before loginTime
  const login = session.loginTime ? new Date(session.loginTime) : null;
  const startCount = login && fromClamped < login ? login : fromClamped;

  if (toClamped <= startCount) return 0;

  const deltaSec = Math.floor((toClamped - startCount) / 1000);

  // initialize totalDuration if absent
  session.totalDuration = Math.max(0, parseInt(session.totalDuration || 0, 10));
  session.totalDuration += deltaSec;
  return deltaSec;
}

// safe reverse geocode with timeout
async function safeReverseGeocode(lat, lng, timeoutMs = 3000) {
  if (!reverseGeocode) return null;
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    reverseGeocode(lat, lng)
      .then((r) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(r);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

// is a login time a late-join? (consider morning, lunch, tea rules)
function isLateJoin(loginDate) {
  if (!loginDate) return false;
  const loginIST = toIST(new Date(loginDate));
  const y = loginIST.getFullYear(),
    m = loginIST.getMonth(),
    dt = loginIST.getDate();

  // morning cutoff
  const morningCutoff = new Date(
    y,
    m,
    dt,
    CONFIG.SHIFT_START_HOUR,
    CONFIG.SHIFT_START_MIN + CONFIG.MORNING_LATE_CUTOFF_MIN_AFTER_START,
    0
  );
  if (loginIST > morningCutoff && loginIST <= combineIST(loginIST, 23, 59))
    return true;

  // lunch
  const lunchEndGrace = new Date(
    y,
    m,
    dt,
    CONFIG.LUNCH_END_HOUR,
    CONFIG.LUNCH_END_MIN + CONFIG.LUNCH_GRACE_MIN_AFTER_END,
    0
  );
  if (
    loginIST > lunchEndGrace &&
    loginIST <= combineIST(loginIST, 23, 59) &&
    loginIST.getHours() >= CONFIG.LUNCH_START_HOUR
  )
    return true;

  // tea
  const teaEndGrace = new Date(
    y,
    m,
    dt,
    CONFIG.TEA_END_HOUR,
    CONFIG.TEA_END_MIN + CONFIG.TEA_GRACE_MIN_AFTER_END,
    0
  );
  if (
    loginIST > teaEndGrace &&
    loginIST <= combineIST(loginIST, 23, 59) &&
    loginIST.getHours() >= CONFIG.TEA_START_HOUR
  )
    return true;

  return false;
}

// -------------------- CONTROLLERS --------------------

// STATS
export const stats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();

    // Online users tracked via User.isActive (keeps consistent with other parts of system)
    const onlineUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = Math.max(0, totalUsers - onlineUsers);

    // Latest session per user aggregation to compute statuses and idle
    const pipeline = [
      { $match: { status: { $in: ["online", "disconnected", "offline"] } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          status: { $first: "$status" },
          isIdle: { $first: "$isIdle" },
        },
      },
    ];

    const latest = await Session.aggregate(pipeline);
    const online = latest.filter((x) => x.status === "online").length;
    const offline = latest.filter((x) => x.status === "offline").length;
    const disconnected = latest.filter((x) => x.status === "disconnected").length;
    const idleUsers = latest.filter((x) => !!x.isIdle).length;

    // Late joiners (unique users who logged in today after the late threshold)
    const todayStart = startOfDayIST();
    const todaySessions = await Session.find({
      loginTime: { $gte: todayStart },
      status: { $in: ["online", "offline", "disconnected"] },
    }).select("userId loginTime");
    const lateSet = new Set();
    todaySessions.forEach((s) => {
      if (s && s.loginTime && isLateJoin(s.loginTime) && s.userId) lateSet.add(String(s.userId));
    });
    const lateJoinUsers = lateSet.size;

    return res.json({
      totalUsers,
      onlineUsers,
      inactiveUsers,
      offlineUsers: offline,
      onlineUsersLive: online,
      disconnected,
      idleUsers,
      lateJoinUsers,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
};

// ALERTS
export const alerts = async (req, res) => {
  try {
    // Today's sessions (for late joins)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const sessionsToday = await Session.find({
      loginTime: { $gte: todayStart },
      status: { $in: ["online", "offline", "disconnected"] },
    }).populate("userId", "name employeeId");

    // late join sessions (filter by helper isLateJoin)
    const lateJoin = sessionsToday
      .filter((s) => isLateJoin(s.loginTime))
      .map((s) => ({
        sessionId: s._id,
        user: s.userId ? { id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId } : null,
        loginTime: s.loginTime,
      }));

    // extended shift: stored + currently live sessions > shift length
    const shiftSeconds =
      (CONFIG.SHIFT_END_HOUR * 3600 + CONFIG.SHIFT_END_MIN * 60) -
      (CONFIG.SHIFT_START_HOUR * 3600 + CONFIG.SHIFT_START_MIN * 60);

    const storedExtended = await Session.find({ totalDuration: { $gt: shiftSeconds } })
      .populate("userId", "name employeeId")
      .limit(50)
      .sort({ createdAt: -1 });

    const extendedShift = storedExtended.map((s) => ({
      sessionId: s._id,
      user: s.userId ? { id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId } : null,
      totalDuration: s.totalDuration,
    }));

    const onlineSessions = await Session.find({ status: "online" }).populate("userId", "name employeeId");
    onlineSessions.forEach((s) => {
      const live = Math.max(0, parseInt(s.totalDuration || 0, 10) + computeTotalDuration(s.lastActivity || s.loginTime, null));
      if (live > shiftSeconds) extendedShift.push({ sessionId: s._id, user: s.userId ? { id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId } : null, totalDuration: live });
    });

    // unexpected disconnects in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const disconnects = await Session.find({ status: "disconnected", createdAt: { $gte: since } })
      .populate("userId", "name employeeId")
      .limit(50)
      .sort({ createdAt: -1 });

    const unexpectedDisconnect = disconnects.map((s) => ({ sessionId: s._id, user: s.userId ? { id: s.userId._id, name: s.userId.name, employeeId: s.userId.employeeId } : null, createdAt: s.createdAt }));

    return res.json({ lateJoin, extendedShift, unexpectedDisconnect });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to compute alerts" });
  }
};

// START SESSION
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
      // if session is very old (previous day), close it and create a fresh one
      const createdIST = toIST(existing.createdAt || existing.loginTime || new Date());
      const todayStart = startOfDayIST();
      if (createdIST < todayStart) {
        // close old: when closing old we must ensure active seconds already counted; here fallback
        existing.logoutTime = existing.lastActivity || existing.loginTime || new Date();
        existing.totalDuration = computeTotalDuration(existing.loginTime, existing.logoutTime);
        existing.status = "offline";
        await existing.save();
        existing = null; // will create new below
      }
    }

    if (existing) {
      // resume existing session: mark online, reset idle, update lastActivity
      existing.ip = ip || existing.ip;
      existing.device = device || existing.device;
      existing.location = location || existing.location;
      existing.lastActivity = new Date();
      existing.isIdle = false;
      // if existing was disconnected, don't retroactively count disconnected time - resume fresh
      existing.status = "online";
      await existing.save();
      user.isActive = true;
      await user.save();
      return res.json({ session: existing, message: "resumed" });
    }

    const now = new Date();
    const sessionData = {
      userId: user._id,
      ip,
      device: device || req.headers["user-agent"] || "",
      location: typeof location === "string" ? location : location ? JSON.stringify(location) : "",
      lastActivity: now,
      loginTime: now, // <--- added loginTime
      status: "online",
      isIdle: false,
      totalDuration: 0, // track active-only seconds
    };

    // Late detection: if login is after shift start + cutoff window (we'll mark isLate and lateByMin)
    try {
      const loginIST = toIST(now);
      const y = loginIST.getFullYear(), m = loginIST.getMonth(), d = loginIST.getDate();
      const officeStart = new Date(y, m, d, CONFIG.SHIFT_START_HOUR, CONFIG.SHIFT_START_MIN, 0);
      if (loginIST > officeStart) {
        sessionData.isLate = true;
        const lateBySec = Math.floor((loginIST - officeStart) / 1000);
        sessionData.lateByMin = Math.ceil(lateBySec / 60);
      } else {
        sessionData.isLate = false;
        sessionData.lateByMin = 0;
      }
    } catch (e) {
      /* ignore late calc errors */
    }

    // attempt reverse geocode if location looks like coordinates
    try {
      if (location) {
        let lat = null,
          lng = null;
        if (typeof location === "object" && location.lat != null && location.lng != null) {
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
          const geo = await safeReverseGeocode(lat, lng, 3000);
          if (geo && geo.name) sessionData.locationName = geo.name;
        }
      }
    } catch (e) {
      console.warn("geocode on start failed", e && e.message);
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

// ACTIVITY endpoint - call from frontend to keep session alive / update lastActivity
// Expected: authenticated request (req.user), optional sessionId in body
export const activity = async (req, res) => {
  try {
    const user = req.user;
    const { sessionId } = req.body || {};
    let session = null;

    if (sessionId) {
      session = await Session.findById(sessionId);
    } else {
      session = await Session.findOne({ userId: user._id, status: { $in: ["online", "disconnected"] } }).sort({ createdAt: -1 });
    }

    if (!session) return res.status(400).json({ message: "No active session" });

    const now = new Date();

    // If session was disconnected and activity arrives, treat as resume: set status online but DO NOT count disconnected gap.
    if (session.status === "disconnected") {
      session.status = "online";
      // don't retroactively add time
    }

    // If session was online and not idle, then add seconds between previous lastActivity and now (active time)
    try {
      if (!session.isIdle && session.lastActivity) {
        await addActiveSeconds(session, session.lastActivity, now);
      }
    } catch (e) {
      console.warn("addActiveSeconds failed on activity", e && e.message);
    }

    session.lastActivity = now;
    session.isIdle = false; // reset idle on activity
    await session.save();

    // ensure user is marked active
    if (!user.isActive) {
      user.isActive = true;
      await user.save();
    }

    return res.json({ ok: true, sessionId: session._id, totalDuration: session.totalDuration || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to update activity" });
  }
};

// END SESSION
export const end = async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const user = req.user;
    let session;

    if (sessionId) session = await Session.findById(sessionId);
    else
      session = await Session.findOne({
        userId: user._id,
        status: "online",
      }).sort({ createdAt: -1 });

    if (!session) return res.status(400).json({ message: "No active session" });

    const now = new Date();
    // before closing, add active seconds from lastActivity to now (clamped to office window)
    try {
      if (!session.isIdle && session.lastActivity) {
        await addActiveSeconds(session, session.lastActivity, now);
      }
    } catch (e) {
      console.warn("addActiveSeconds failed on end", e && e.message);
    }

    // set logoutTime as min(now, officeEnd)
    const logoutClamped = clampToOfficeWindow(now) || now;
    session.logoutTime = logoutClamped;
    // ensure totalDuration is present
    session.totalDuration = Math.max(0, parseInt(session.totalDuration || 0, 10));
    session.status = "offline";
    await session.save();

    user.isActive = false;
    await user.save();

    // trigger immediate users_list_update broadcast (best-effort)
    try {
      if (global._io && typeof global._io._broadcastLatestNow === 'function') {
        await global._io._broadcastLatestNow();
      }
    } catch (e) {
      console.warn('broadcast trigger failed on end', e && e.message);
    }

    return res.json({ session });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to end session" });
  }
};

// endBeacon (disconnect)
export const endBeacon = async (req, res) => {
  try {
    const { sessionId, token } = req.body || {};
    let user = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        user = await User.findById(decoded.id);
      } catch (e) {
        /* ignore */
      }
    }

    let session;
    if (sessionId) session = await Session.findById(sessionId);
    else if (user)
      session = await Session.findOne({
        userId: user._id,
        status: "online",
      }).sort({ createdAt: -1 });

    if (!session) return res.status(400).json({ message: "No active session" });

    const now = new Date();
    // When disconnecting, count active seconds up to now (if any) and then mark disconnected so further time won't be added
    try {
      if (!session.isIdle && session.lastActivity) {
        await addActiveSeconds(session, session.lastActivity, now);
      }
    } catch (e) {
      console.warn("addActiveSeconds failed on endBeacon", e && e.message);
    }

    session.status = "disconnected";
    session.lastActivity = now;
    // record disconnectedAt for reporting
    session.disconnectedAt = now;
    await session.save();

    // best-effort: trigger broadcast so dashboards and teamlead views update immediately
    try {
      if (global._io && typeof global._io._broadcastLatestNow === 'function') {
        await global._io._broadcastLatestNow();
      }
    } catch (e) {
      console.warn('broadcast trigger failed on endBeacon', e && e.message);
    }

    // keep user.isActive true until explicit end or disconnect watcher marks offline
    return res.json({ session });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to end session (beacon)" });
  }
};

// ACTIVE USERS
export const active = async (req, res) => {
  try {
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
    const usersWithTotal = users.map((s) => {
      // if online, compute live additional active seconds from lastActivity to now (but do not exceed office end)
      let total = Math.max(0, parseInt(s.totalDuration || 0, 10));
      if (s.status === "online" && s.lastActivity) {
        try {
          const added = Math.floor((Math.min(Date.now(), clampToOfficeWindow(s.lastActivity)?.getTime() || Date.now()) - new Date(s.lastActivity).getTime()) / 1000);
          // added may be 0; avoid negative
          if (added > 0) total += added;
        } catch (e) {
          /* ignore */
        }
      }
      return { ...s, totalDuration: Math.floor(total) };
    });

    return res.json({ users: usersWithTotal });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch active users" });
  }
};

// LOGS
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
    if (from) filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (employeeId) {
      const users = await User.find({ employeeId: String(employeeId) }).select("_id");
      const ids = users.map((u) => u._id);
      filter.userId = { $in: ids };
    }

    const sessions = await Session.find(filter)
      .populate("userId", "name employeeId")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l);
    const mapped = sessions.map((s) => {
      const totalSec = Math.max(0, parseInt(s.totalDuration || 0, 10));
      const totalMin = Math.round(totalSec / 60);
      const totalHoursDecimal = Number((totalSec / 3600).toFixed(2));
      return ({
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
        totalDuration: totalSec,
        totalMinutes: totalMin,
        totalHours: totalHoursDecimal,
        status: s.status,
        device: s.device || null,
        location: s.location || null,
        locationName: s.locationName || null,
        ip: s.ip || null,
        createdAt: s.createdAt,
      })
    });
    const total = await Session.countDocuments(filter);
    return res.json({ sessions: mapped, page: p, limit: l, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
};

// EXPORT CSV
// export const exportLogs = async (req, res) => {
//   try {
//     const {
//       from,
//       to,
//       userId,
//       status,
//       employeeId,
//       limit = 10000,
//     } = req.query || {};
//     const filter = {};
//     if (from) filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
//     if (to) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
//     if (userId) filter.userId = userId;
//     if (status) filter.status = status;
//     if (employeeId) {
//       const users = await User.find({ employeeId: String(employeeId) }).select("_id");
//       const ids = users.map((u) => u._id);
//       filter.userId = { $in: ids };
//     }

//     const lim = Math.min(50000, parseInt(limit, 10) || 10000);
//     const sessions = await Session.find(filter)
//       .populate("userId", "name employeeId")
//       .sort({ createdAt: -1 })
//       .limit(lim);

//     // stream CSV with readable hours/minutes
//     const header = [
//       "sessionId",
//       "name",
//       "employeeId",
//       "loginTime",
//       "logoutTime",
//       "totalDurationSeconds",
//       "totalMinutes",
//       "totalHoursDecimal",
//       "isLate",
//       "lateByMin",
//       "status",
//       "device",
//       "location",
//       "locationName",
//       "ip",
//     ];
//     res.setHeader("Content-Type", "text/csv");
//     res.setHeader("Content-Disposition", `attachment; filename="sessions-${Date.now()}.csv"`);

//     // write header
//     res.write(header.join(",") + "\n");
//     for (const s of sessions) {
//       const totalSec = Math.max(0, parseInt(s.totalDuration || 0, 10));
//       const totalMin = Math.round(totalSec / 60);
//       const totalHoursDecimal = Number((totalSec / 3600).toFixed(2));
//       const row = {
//         sessionId: s._id,
//         name: s.userId ? s.userId.name : "",
//         employeeId: s.userId ? s.userId.employeeId : "",
//         loginTime: s.loginTime ? toISOStringSafe(s.loginTime) : "",
//         logoutTime: s.logoutTime ? toISOStringSafe(s.logoutTime) : "",
//         totalDurationSeconds: totalSec,
//         totalMinutes: totalMin,
//         totalHoursDecimal,
//         isLate: s.isLate ? "true" : "false",
//         lateByMin: s.lateByMin || 0,
//         status: s.status,
//         device: s.device || "",
//         location: s.location || "",
//         locationName: s.locationName || "",
//         ip: s.ip || "",
//       };
//       const escaped = header.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",");
//       res.write(escaped + "\n");
//     }
//     return res.end();
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ message: "Failed to export logs" });
//   }
// };

// EXPORT CSV (EVENT BASED - CLEAN)
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
    if (from) filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    if (to) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
 
    if (employeeId) {
      const users = await User.find({ employeeId: String(employeeId) }).select("_id");
      const ids = users.map((u) => u._id);
      filter.userId = { $in: ids };
    }
 
    const lim = Math.min(50000, parseInt(limit, 10) || 10000);
 
    const sessions = await Session.find(filter)
      .populate("userId", "name employeeId")
      .sort({ createdAt: 1 }) // chronological
      .limit(lim);
 
    /* ================= CSV SETUP ================= */
    const header = [
      "Employee Name",
      "Date",
      "User Action",
      "Timestamp",
    ];
 
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="meeting-logs-${Date.now()}.csv"`
    );
 
    // write header
    res.write(header.join(",") + "\n");
 
    /* ================= EVENT BASED ROWS ================= */
    for (const s of sessions) {
      const name = s.userId ? s.userId.name : "";
 
      // JOIN EVENT
      if (s.loginTime) {
        const row = {
          "Employee Name": name,
          "Date": new Date(s.loginTime).toLocaleDateString("en-IN"),
          "User Action": "Joined",
          "Timestamp": new Date(s.loginTime).toLocaleString("en-IN"),
        };
 
        const escaped = header
          .map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`)
          .join(",");
        res.write(escaped + "\n");
      }
 
      // LEAVE EVENT
      if (s.logoutTime) {
        const row = {
          "Employee Name": name,
          "Date": new Date(s.logoutTime).toLocaleDateString("en-IN"),
          "User Action": "Left",
          "Timestamp": new Date(s.logoutTime).toLocaleString("en-IN"),
        };
 
        const escaped = header
          .map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`)
          .join(",");
        res.write(escaped + "\n");
      }
    }
 
    return res.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to export logs" });
  }
};

// CLEANUP (manual endpoint)
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

// -------------------- Background Jobs --------------------

async function idleWatcher() {
  try {
    const threshold = new Date(Date.now() - CONFIG.IDLE_MINUTES * 60 * 1000);
    // mark online sessions with lastActivity < threshold as idle
    const toIdle = await Session.find({ status: "online", lastActivity: { $lt: threshold }, isIdle: { $ne: true } });
    for (const s of toIdle) {
      // when marking idle, we do NOT add extra time (lastActivity already records last user interaction)
      s.isIdle = true;
      s.idleStartedAt = s.lastActivity || new Date();
      await s.save();
    }
    // optional: mark isIdle false for those with recent activity
    const activeThreshold = new Date(Date.now() - (CONFIG.IDLE_MINUTES - 1) * 60 * 1000);
    const toUnIdle = await Session.find({ status: "online", lastActivity: { $gte: activeThreshold }, isIdle: true });
    for (const s of toUnIdle) {
      // on resume from idle, record the idle end time for reporting
      s.isIdle = false;
      s.idleEndedAt = s.lastActivity || new Date();
      await s.save();
    }
  } catch (e) {
    console.error("idleWatcher failed", e);
  }
}

async function disconnectWatcher() {
  try {
    const threshold = new Date(Date.now() - CONFIG.DISCONNECT_MINUTES * 60 * 1000);
    const toOffline = await Session.find({ status: "disconnected", lastActivity: { $lt: threshold } });
    for (const s of toOffline) {
      // session was disconnected and past threshold => finalize it as offline
      // ensure we've already counted active time up to lastActivity (endBeacon/addActiveSeconds should have done it)
      s.status = "offline";
      s.logoutTime = s.lastActivity || new Date();
      s.totalDuration = Math.max(0, parseInt(s.totalDuration || 0, 10));
      await s.save();
      // keep user.isActive false only if no other online session exists
      const other = await Session.findOne({ userId: s.userId, status: "online" });
      if (!other) {
        await User.findByIdAndUpdate(s.userId, { isActive: false });
      }
    }
  } catch (e) {
    console.error("disconnectWatcher failed", e);
  }
}

async function dailyCleanupTask() {
  try {
    const todayStart = startOfDayIST();

    // 1) Close yesterday's sessions that are still online/disconnected
    const openQuery = { createdAt: { $lt: todayStart }, status: { $in: ["online", "disconnected"] } };
    const cursor = Session.find(openQuery).cursor();
    for (let s = await cursor.next(); s != null; s = await cursor.next()) {
      // finalize old sessions: count active time up to lastActivity
      try {
        if (!s.isIdle && s.lastActivity) {
          await addActiveSeconds(s, s.lastActivity, s.lastActivity); // no-op but safe
        }
      } catch (e) {
        /* ignore */
      }
      s.logoutTime = s.lastActivity || s.loginTime || new Date();
      s.totalDuration = Math.max(0, parseInt(s.totalDuration || 0, 10));
      s.status = "offline";
      await s.save();
      await User.findByIdAndUpdate(s.userId, { isActive: false });
    }

    // 2) Deduplicate sessions created before today: keep the latest per user, close older ones
    const dupPipeline = [
      { $match: { createdAt: { $lt: todayStart } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$userId", keepId: { $first: "$_id" }, otherIds: { $push: "$_id" } } }
    ];
    const dups = await Session.aggregate(dupPipeline);
    for (const d of dups) {
      const toRemove = (d.otherIds || []).filter((id) => String(id) !== String(d.keepId));
      if (toRemove.length) {
        await Session.updateMany({ _id: { $in: toRemove } }, { $set: { status: "offline", logoutTime: new Date(), totalDuration: 0 } });
      }
    }

    // 3) Archive very old sessions to sessions_archive collection (in chunks)
    const ARCHIVE_DAYS = CONFIG.ARCHIVE_DAYS;
    if (ARCHIVE_DAYS > 0) {
      const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
      const oldSessions = await Session.find({ createdAt: { $lt: cutoff } }).limit(1000);
      if (oldSessions.length) {
        const archiveColl = (await import("mongoose")).connection.collection("sessions_archive");
        const docs = oldSessions.map((s) => { const o = s.toObject(); o.origId = s._id; return o; });
        await archiveColl.insertMany(docs);
        const ids = oldSessions.map((s) => s._id);
        await Session.deleteMany({ _id: { $in: ids } });
      }
    }

    // 4) Delete archived older than DELETE_ARCHIVE_DAYS
    const DELETE_DAYS = CONFIG.DELETE_ARCHIVE_DAYS;
    if (DELETE_DAYS > 0) {
      const deleteCutoff = new Date(Date.now() - DELETE_DAYS * 24 * 60 * 60 * 1000);
      const archiveColl = (await import("mongoose")).connection.collection("sessions_archive");
      await archiveColl.deleteMany({ createdAt: { $lt: deleteCutoff } });
    }

    console.log("Daily cleanup completed");
  } catch (e) {
    console.error("dailyCleanupTask failed", e);
  }
}

// schedule jobs if cron available
if (cron) {
  try {
    // idle watcher every 1 minute
    cron.schedule("* * * * *", () => { idleWatcher().catch(e => console.error(e)); });

    // disconnected watcher every 1 minute
    cron.schedule("* * * * *", () => { disconnectWatcher().catch(e => console.error(e)); });

    // daily cleanup at configured IST time
    const spec = `${CONFIG.DAILY_CLEAN_MINUTE} ${CONFIG.DAILY_CLEAN_HOUR} * * *`;
    cron.schedule(spec, () => { dailyCleanupTask().catch(e => console.error(e)); }, { timezone: CONFIG.TIMEZONE });

    console.log("Session controller cron jobs scheduled");
  } catch (e) {
    console.warn("Failed to schedule cron jobs", e);
  }
} else {
  console.warn("node-cron not found - background jobs (idle/disconnect watcher, daily cleanup) are disabled. Install node-cron to enable.");
}

// Export helper for manual invocation if needed
export const runDailyCleanup = dailyCleanupTask;
export const runDisconnectWatcher = disconnectWatcher;
export const runIdleWatcher = idleWatcher;









