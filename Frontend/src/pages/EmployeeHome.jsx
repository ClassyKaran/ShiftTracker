import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket,  } from '../context/socket';
import useSession from '../hooks/useSession';
import Timer from '../components/Timer';
// import * as sessionApi from '../api/sessionApi';

export default function EmployeeHome() {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');
  const { start, end,  } = useSession();
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await start(token);
        setSession(res.session);
        const socket = connectSocket(token);
        socket.on('connect', () => console.log('socket connected'));
        socket.on('disconnect', () => console.log('socket disconnected'));
      } catch(e){
        toast.error('Could not start session');
      }
    })();

    return () => {
      disconnectSocket();
    };
    // eslint-disable-next-line
  }, []);

  const handleLogout = async () => {
    try {
      await end(token, session?._id);
      disconnectSocket();
      window.location.href = '/login';
    } catch (e) {
      toast.error('Error logging out');
    }
  };

  return (
    <div>
      <h3>Employee Home</h3>
      <div className="card mb-3">
        <div className="card-body">
          <p><strong>Session:</strong> {session?._id || '-'}</p>
          <p><strong>Login time:</strong> {session?.loginTime ? new Date(session.loginTime).toLocaleString() : '-'}</p>
          <p><strong>Active time:</strong> <Timer start={session?.loginTime} /></p>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
