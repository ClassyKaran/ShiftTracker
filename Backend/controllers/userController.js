
import Session from "../models/Session.js";
import User from "../models/User.js";

// -------------------- START SESSION --------------------
export const start = async (req, res) => {
  try {
    const user = req.user;
    const ip = req.ip || req.headers["x-forwarded-for"] || "";

    const session = await Session.create({
      userId: user._id,
      ip,
      status: "online",
    });

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

    if (!session)
      return res.status(400).json({ message: "No active session" });

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

// -------------------- ACTIVE USERS (FIXED) --------------------
export const active = async (req, res) => {
  try {
    const sessions = await Session.find({
      status: { $in: ["online", "disconnected", "offline"] },
    }).populate("userId", "name employeeId");

    // 🔥 null-safe mapping (fix for TypeError: reading '_id')
    const users = sessions
      .filter((s) => s.userId !== null) // ⛔ remove null users
      .map((s) => {
        const total =
          s.status === "online"
            ? Math.max(0, (Date.now() - new Date(s.loginTime)) / 1000)
            : s.totalDuration || 0;

        return {
          _id: s.userId._id,
          name: s.userId.name,
          employeeId: s.userId.employeeId,
            loginTime: s.loginTime,
            logoutTime: s.logoutTime || null,
          status: s.status,
          totalDuration: Math.floor(total),
        };
      });

    return res.json({ users });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch active users" });
  }
};

// -------------------- LOGS --------------------
export const logs = async (req, res) => {
  try {
    const sessions = await Session.find({})
      .populate("userId", "name employeeId")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json({ sessions });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
};
