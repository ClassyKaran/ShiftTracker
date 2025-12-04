import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "../context/socket";
import useSession from "../hooks/useSession";
import Timer from "../components/Timer";
import createIdleTracker from "../utils/idle";
import "./employeeHome.css";
import { formatTime, durationSeconds } from "../utils/time";

export default function EmployeeHome() {
  const qc = useQueryClient();
  const token = qc.getQueryData(["token"]) || localStorage.getItem("token");

  const { start, end } = useSession();
  const [session, setSession] = useState(null);
  const [deviceType, setDeviceType] = useState("Unknown");
  const [loading, setLoading] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [endedSession, setEndedSession] = useState(null);
  const socketRef = useRef(null);
  const user = qc.getQueryData(["user"]) || {};
  const userDisplay =
    user?.name || user?.displayName || user?.employeeId || user?.email || "You";

  useEffect(() => {
    if (!session?.lastActivity) {
      setIdleSeconds(0);
      return;
    }

    const update = () => {
      try {
        setIdleSeconds(durationSeconds(session.lastActivity));
      } catch (err) {
        void err;
      }
    };

    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [session?.lastActivity]);

  const detectDevice = () => {
    const ua = navigator.userAgent || "";
    if (/mobile/i.test(ua)) return "Mobile";
    if (/tablet/i.test(ua)) return "Tablet";
    return "Desktop";
  };

  const handleStartShift = async () => {
    setLoading(true);
    try {
      const detected = detectDevice();
      setDeviceType(detected);
      const res = await start(token, { device: detected });
      setSession(res.session);

      try {
        const socket = connectSocket(token);
        socketRef.current = socket;
        const idle = createIdleTracker(socket, {
          idleMs: 5 * 60 * 1000,
          heartbeatMs: 30 * 1000,
        });
        idle.start();
        window.__idleTracker = idle;
      } catch (e) {
        console.warn("socket init failed", e);
      }

      toast.success("Shift started");
    } catch (e) {
      console.error("start failed", e);
      toast.error("Could not start shift");
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    setLoading(true);
    try {
      const data = await end(token, session?._id);
      // keep a reference to the ended session so UI can display logoutTime/totalDuration
      setEndedSession(data && data.session ? data.session : null);
      setSession(null);
      try {
        if (
          window.__idleTracker &&
          typeof window.__idleTracker.stop === "function"
        )
          window.__idleTracker.stop();
      } catch (err) {
        void err;
      }
      try {
        disconnectSocket();
      } catch (err) {
        void err;
      }
      toast.success("Shift ended");
    } catch (e) {
      console.error("end failed", e);
      toast.error("Could not end shift");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleUnload = () => {
      try {
        const s = qc.getQueryData(["activeSession"]) || session;
        if (s && s._id) {
          const payload = JSON.stringify({ sessionId: s._id, token });
          const url =
            (window.__REACT_APP_API__ ||
              import.meta.env.VITE_API_BASE_URL ||
              "http://localhost:5000") + "/api/session/end-beacon";

          if (navigator.sendBeacon) navigator.sendBeacon(url, payload);
          else {
            navigator.fetch &&
              navigator.fetch(url, {
                method: "POST",
                body: payload,
                headers: { "Content-Type": "application/json" },
                keepalive: true,
              });
          }
        }
      } catch (err) {
        void err;
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [session, qc, token]);

  useEffect(() => {
    (async () => {
      try {
        const cached = qc.getQueryData(["activeSession"]);
        if (cached && cached.status === "online") {
          setSession(cached);
          return;
        }
        const user = qc.getQueryData(["user"]);
        if (!user) return;
      } catch (err) {
        void err;
      }
    })();
  }, [qc, token]);

  return (
    <div className="employee-home">
      <div className="container">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h2 className="fw-bold mb-0">Tracking Your Shift</h2>
            <div className="text-muted">{userDisplay}</div>
          </div>
        </div>

        <div className="row g-4">
          {/* LEFT STATUS BOXES */}
          <div className="col-lg-4">
            <div className="eh-metric">
              <div className="label">Status</div>
              <div
                className="value"
                style={{ color: session ? "#21c45a" : "#777" }}
              >
                ● {session ? "Online" : "Offline"}
              </div>
            </div>

            <div className="eh-metric">
              <div className="label">Position</div>
              <div className="value">{deviceType}</div>
            </div>

            <div className="eh-metric">
              <div className="label">Location</div>
              <div className="value">
                {session?.locationName || session?.location || "-"}
              </div>
            </div>

            <div className="eh-metric">
              <div className="label">Idle Time</div>
              <div className="value">
                {session?.lastActivity
                  ? session?.isIdle
                    ? new Date(idleSeconds * 1000).toISOString().substr(11, 8)
                    : "--"
                  : endedSession?.lastActivity && endedSession?.logoutTime
                  ? new Date(
                      Math.max(
                        0,
                        Math.floor(
                          (new Date(endedSession.logoutTime) -
                            new Date(endedSession.lastActivity)) /
                            1000
                        )
                      ) * 1000
                    )
                      .toISOString()
                      .substr(11, 8)
                  : "--"}
              </div>
            </div>
          </div>

          {/* CENTER CIRCLE TIMER */}
          <div className="col-lg-4 ">
            <div className="timer-circle">
              <span>
                {session?.loginTime ? (
                  <Timer start={session.loginTime} />
                ) : (
                  "00:00:00"
                )}
              </span>
              <small>Active Session</small>
            </div>

            <div className="text-center mt-5">
              <button
                className={`eh-start-btn ${session ? "eh-end-btn" : ""}`}
                onClick={session ? handleEndShift : handleStartShift}
                disabled={loading}
              >
                {session ? "End Shift" : "Start Shift"}
              </button>
            </div>
          </div>

          {/* RIGHT INFO BOXES */}
          <div className="col-lg-4">
            <div className="eh-metric">
              <div className="label">Login Time</div>
              <div className="value">
                {session?.loginTime
                  ? formatTime(session.loginTime)
                  : endedSession?.loginTime
                  ? formatTime(endedSession.loginTime)
                  : "--"}
              </div>
            </div>
            <div className="eh-metric">
              <div className="label">LogOut Time</div>
              <div className="value">
                {session?.logoutTime
                  ? formatTime(session.logoutTime)
                  : endedSession?.logoutTime
                  ? formatTime(endedSession.logoutTime)
                  : "--"}
              </div>
            </div>
            <div className="eh-metric">
              <div className="label">Expected End Time</div>
              <div className="value">06:30 PM</div>
            </div>

            <div className="eh-metric">
              <div className="label">Total Duration</div>
              <div className="value">
                {session?.loginTime && !session?.logoutTime
                  ? new Date(durationSeconds(session.loginTime) * 1000)
                      .toISOString()
                      .substr(11, 8)
                  : endedSession?.totalDuration
                  ? new Date(endedSession.totalDuration * 1000)
                      .toISOString()
                      .substr(11, 8)
                  : "--"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
