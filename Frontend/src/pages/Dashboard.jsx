import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../context/socket';
import UserCard from '../components/UserCard';
import AddUserForm from '../components/AddUserForm';
import * as sessionApi from '../api/sessionApi';

export default function Dashboard() {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');
  const [users, setUsers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await sessionApi.getActive(token);
        setUsers(resp.users || []);
        const socket = connectSocket(token);
        socket.on('users_list_update', (data) => setUsers(data.users || []));
        socket.on('user_online', (u) => setUsers(prev => {
          const map = new Map(prev.map(x => [String(x._id), x]));
          map.set(String(u._id), u);
          return Array.from(map.values());
        }));
        socket.on('user_offline', (u) => setUsers(prev => prev.map(p => p._id === u._id ? u : p)));
        socket.on('user_disconnected', (u) => setUsers(prev => prev.map(p => p._id === u._id ? u : p)));
      } catch (e) {
        console.error(e);
      }
    })();

    return () => disconnectSocket();
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <h3>Admin Dashboard</h3>
      {/* show add-user form only for admins */}
      {(() => {
        const user = qc.getQueryData(['user']);
        if (user && user.role === 'admin') return <AddUserForm onCreated={() => sessionApi.getActive(token).then(r => setUsers(r.users || []))} />;
        return null;
      })()}
      <div className="card">
        <div className="card-body">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Login Time</th>
                <th>Active Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => <UserCard key={u._id} user={u} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
