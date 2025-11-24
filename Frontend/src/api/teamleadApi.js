import axios from 'axios';

// default to localhost backend during development if no env provided
const base = import.meta.env.VITE_API_BASE_URL || window.__ENV?.API_BASE_URL || 'http://localhost:5000';

export const getTracked = async (token) => {
  const resp = await axios.get(base + '/teamlead/tracked', { headers: { Authorization: `Bearer ${token}` } });
  return resp.data;
};

export const setTracked = async (token, trackedIds) => {
  const resp = await axios.post(base + '/teamlead/tracked', { tracked: trackedIds }, { headers: { Authorization: `Bearer ${token}` } });
  return resp.data;
};
