import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../context/socket";
import "./ScreenShareModal.css";

export default function ScreenShareModal({ isOpen, employeeId, employeeName, onClose }) {
  const [frame, setFrame] = useState("");
  const frameCanvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      console.error('[Modal] Socket not connected');
      return;
    }

    console.log('[Modal] Opened for', employeeName, '(', employeeId, ')');

    // Listen for frames from any employee (simple like reference)
    const handleFrame = (data) => {
      // Check if frame is from the employee we're watching
      if (String(data.employeeId) !== String(employeeId)) {
        console.log('[Modal] Frame from different employee:', data.employeeName, '(', data.employeeId, ') Expected:', employeeId);
        return;
      }

      const frameData = data.frame;
      console.log('[Modal] Received frame from', data.employeeName, ':', frameData.length, 'bytes');
      setFrame(frameData);
      
      // Render to canvas
      if (frameCanvasRef.current && frameData) {
        const img = new Image();
        img.onload = () => {
          console.log('[Modal] Frame rendered:', img.width, 'x', img.height);
          const ctx = frameCanvasRef.current.getContext('2d');
          frameCanvasRef.current.width = img.width;
          frameCanvasRef.current.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.onerror = () => console.error('[Modal] Frame load error');
        img.src = frameData;
      }
    };

    socket.on('admin-receive-frame', handleFrame);
    console.log('[Modal] Listening for frames');

    return () => {
      socket.off('admin-receive-frame', handleFrame);
      console.log('[Modal] Stopped listening');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="screen-share-overlay" onClick={onClose}>
      <div className="screen-share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="screen-share-header">
          <div className="screen-share-title">
            <h4 className="mb-0">
              Screen Share - <strong>{employeeName}</strong>
            </h4>
            <small className="text-muted">
              {frame ? (
                <span className="badge bg-success me-2">● Live</span>
              ) : (
                <span className="badge bg-warning">Waiting...</span>
              )}
            </small>
          </div>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Screen Display Area */}
        <div className="screen-share-content">
          {frame ? (
            <canvas
              ref={frameCanvasRef}
              className="screen-canvas"
              style={{ maxWidth: "100%", maxHeight: "100%", margin: "auto", display: "block" }}
            />
          ) : (
            <div className="screen-loading">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p>Waiting for employee to share screen...</p>
              <small className="text-muted">Employee must start shift and grant permission</small>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="screen-share-footer">
          <div className="d-flex justify-content-between align-items-center">
            <div className="text-muted small">
              Employee: <strong>{employeeName}</strong>
            </div>
            <div className="text-muted small">
              {frame && (
                <span className="badge bg-info">Real-time</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
