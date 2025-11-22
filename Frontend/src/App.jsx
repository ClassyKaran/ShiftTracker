
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
// import { useQueryClient } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/Header';
import Login from './pages/Login';
import EmployeeHome from './pages/EmployeeHome';
import Dashboard from './pages/Dashboard';
import TeamLeadDashboard from './pages/TeamLeadDashboard';
import AdminLayout from './components/AdminLayout';
import useAuth from './hooks/useAuth';
import TeamSection from './pages/TeamSection';
import TeamLeadLayout from './components/TeamLeadLayout';
import TrackTeam from './pages/trackteam';

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
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/employee" element={<EmployeeHome />} />

        <Route path="/dashboard" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="teamsection" element={<TeamSection />} />
        </Route>

        <Route path="/teamlead" element={<TeamLeadLayout />}>
          <Route index element={<TeamLeadDashboard />} />
          <Route path="trackteam" element={<TrackTeam />} />
       </Route>

      </Routes>
      <ToastContainer position="top-right" />
    </>
  );
}

export default App;
