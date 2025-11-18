
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
// import { useQueryClient } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import Login from './pages/Login';
import EmployeeHome from './pages/EmployeeHome';
import Dashboard from './pages/Dashboard';
import useAuth from './hooks/useAuth';

function App() {
  // const qc = useQueryClient();
  const { bootstrap } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const u = await bootstrap();
      if (!u) navigate('/login');
    })();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="container py-3">
      <Header />
      <Routes>
        <Route path="/" 
        element={<Navigate to="/login" replace />} 
        />
        <Route path="/login" element={<Login />} />
        <Route path="/employee" element={<EmployeeHome />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
      <ToastContainer position="top-right" />
    </div>
  );
}

export default App;
