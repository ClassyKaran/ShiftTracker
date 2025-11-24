import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { login as loginApi, me as meApi } from '../api/authApi';

export default function useAuth() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const login = async (employeeId, password) => {
    const { token, user } = await loginApi({ employeeId, password });
    localStorage.setItem('token', token);
    qc.setQueryData(['token'], token);
    qc.setQueryData(['user'], user);
    if (user.role === 'admin') navigate('/dashboard');
    else if (user.role === 'teamlead') navigate('/teamlead');
    else navigate('/employee');
    return { token, user };
  };

  const logout = () => {
    localStorage.removeItem('token');
    qc.removeQueries(['token']);
    qc.removeQueries(['user']);
    navigate('/login');
  };

  const bootstrap = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    qc.setQueryData(['token'], token);
    try {
      const resp = await meApi(token);
      qc.setQueryData(['user'], resp.user);
      return resp.user;
    } catch (e) {
      localStorage.removeItem('token');
      return null;
    }
  };

  return { login, logout, bootstrap };
}
