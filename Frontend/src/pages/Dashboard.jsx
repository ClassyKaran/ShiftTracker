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
        // dedupe by id
        const uniq = Array.from(new Map((resp.users || []).map(u => [String(u._id), u])).values());
        setUsers(uniq);
        const socket = connectSocket(token);
        socket.on('users_list_update', (data) => {
          const list = data.users || [];
          const uniq2 = Array.from(new Map(list.map(u => [String(u._id), u])).values());
          setUsers(uniq2);
        });
        socket.on('user_online', (u) => setUsers(prev => {
          const map = new Map(prev.map(x => [String(x._id), x]));
          map.set(String(u._id), u);
          return Array.from(map.values());
        }));
        socket.on('user_offline', (u) => setUsers(prev => prev.map(p => String(p._id) === String(u._id) ? u : p)));
        socket.on('user_disconnected', (u) => setUsers(prev => prev.map(p => String(p._id) === String(u._id) ? u : p)));
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
        if (user && user.role === 'admin') return <AddUserForm onCreated={() => sessionApi.getActive(token).then(r => { const uniq = Array.from(new Map((r.users||[]).map(u=>[String(u._id),u])).values()); setUsers(uniq); })} />;
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
                <th>LogOut Time</th>
                <th>Active Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => <UserCard key={u._id} user={u} onUpdated={(updated) => setUsers(prev => prev.map(p => String(p._id) === String(updated.id) ? {...p, ...updated} : p))} onDeleted={(id) => setUsers(prev => prev.filter(p => String(p._id) !== String(id)))} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
