import React from 'react';
import Timer from './Timer';

export default function UserCard({ user }) {
  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.employeeId}</td>
      <td>{user.loginTime ? new Date(user.loginTime).toLocaleString() : '-'}</td>
      <td><Timer start={user.loginTime} /></td>
      <td><span className={`badge ${user.status === 'online' ? 'bg-success' : user.status === 'disconnected' ? 'bg-warning' : 'bg-secondary'}`}>{user.status}</span></td>
    </tr>
  );
}
