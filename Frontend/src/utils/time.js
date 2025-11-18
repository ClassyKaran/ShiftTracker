import dayjs from 'dayjs';

export const formatTime = (date) => {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

export const durationSeconds = (start, end = new Date()) => {
  const s = dayjs(start);
  const e = dayjs(end);
  return e.diff(s, 'second');
};

export default { formatTime, durationSeconds };
