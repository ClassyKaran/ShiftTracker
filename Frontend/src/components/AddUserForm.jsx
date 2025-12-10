import React, { useState } from 'react'; 
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { addUser as addUserApi } from '../api/authApi';
import * as sessionApi from '../api/sessionApi';

export default function AddUserForm({ onCreated }) {
  const qc = useQueryClient();
  const token = qc.getQueryData(['token']) || localStorage.getItem('token');

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');

  // 👁️ password toggle
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await addUserApi({ name, employeeId, password, role }, token);
      toast.success('User created');

      setName('');
      setEmployeeId('');
      setPassword('');
      setRole('employee');

      if (onCreated) onCreated();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    }
  };

  return (
    <div className="container-fluid mb-3">
      <div className="bg-white shadow p-3 rounded">
       <label className=" fw-bold">Add Employee</label>


        <form onSubmit={submit} className="row g-2">
          
          <div className="col-md-3">
            <input 
              className="form-control" 
              placeholder="Name" 
              value={name} 
              onChange={e=>setName(e.target.value)} 
              required 
            />
          </div>

          <div className="col-md-2">
            <input 
              className="form-control" 
              placeholder="Employee ID" 
              value={employeeId} 
              onChange={e=>setEmployeeId(e.target.value)} 
              required 
            />
          </div>

          {/* PASSWORD + EYE ICON */}
          <div className="col-md-3" style={{ position: "relative" }}>
            <input 
              type={showPassword ? "text" : "password"} 
              className="form-control" 
              placeholder="Password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              required 
            />

            <i  
              className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                fontSize: "18px"
              }}
            ></i>
          </div>

          <div className="col-md-2">
            <select 
              className="form-select" 
              value={role} 
              onChange={e=>setRole(e.target.value)}
            >
          <option>Select Role</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="teamlead">TeamLead</option>
            </select>
          </div>

          <div className="col-md-2">
            <button className="btn btn-primary w-100" type="submit">Create</button>
          </div>

        </form>
      </div>
    </div>
  );
}
