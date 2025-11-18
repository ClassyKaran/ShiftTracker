import { useQueryClient } from '@tanstack/react-query';
import * as sessionApi from '../api/sessionApi';

export default function useSession() {
  const qc = useQueryClient();

  const start = async (token) => {
    const data = await sessionApi.startSession(token);
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
