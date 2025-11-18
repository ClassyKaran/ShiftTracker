import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';

export default function Timer({ start }) {
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!start) return <span>-</span>;
  const diff = now.diff(dayjs(start), 'second');
  const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
  const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const ss = String(diff % 60).padStart(2, '0');
  return <span>{hh}:{mm}:{ss}</span>;
}
