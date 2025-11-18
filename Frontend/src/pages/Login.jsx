import React, { useState } from 'react';
import { toast } from 'react-toastify';
import useAuth from '../hooks/useAuth';

export default function Login() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(employeeId, password);
      toast.success('Logged in');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="row justify-content-center ">
      <div className="col-md-6">
        <div className="card shadow">
          <div className="card-body">
            <h3 className="card-title mb-3">Employee Login</h3>
            <form onSubmit={submit}>
              <div className="mb-3">
                <label className="form-label">Employee ID</label>
                <input className="form-control" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">Password</label>
                <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary">Login</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
