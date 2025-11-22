import { useQueryClient } from '@tanstack/react-query';
import * as sessionApi from '../api/sessionApi';

export default function useSession() {
  const qc = useQueryClient();

  const start = async (token, opts = {}) => {

    const detectDevice = () => {
      const ua = navigator.userAgent || '';
      if (/mobile/i.test(ua)) return 'Mobile';
      if (/tablet/i.test(ua)) return 'Tablet';
      return 'Desktop';
    };
    let body = { device: opts.device || detectDevice() };
    try {
      if (navigator.geolocation) {
        // get position once (with timeout)
        body.location = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(''), 3000);
          navigator.geolocation.getCurrentPosition((pos) => {
            clearTimeout(timer);
            resolve(`${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`);
          }, () => { clearTimeout(timer); resolve(''); }, { timeout: 3000 });
        });
      }
    } catch (e) {
      body.location = '';
    }
    const data = await sessionApi.startSession(token, body);
    qc.setQueryData(['activeSession'], data.session);
    return data;
  };

  const end = async (token, sessionId) => {
    const data = await sessionApi.endSession(token, sessionId);
    qc.removeQueries(['activeSession']);
    return data;
  };

  const refreshActive = async (token) => {
    const data = await sessionApi.getActive(token);
    qc.setQueryData(['activeUsers'], data.users || []);
    return data;
  };

  return { start, end, refreshActive };
}
