import { useEffect, useState } from 'react';

// Keeps the dashboard date and time current in the browser’s local time zone.
export default function HomeClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time className="home-clock" dateTime={now.toISOString()}>
      <span>{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <span className="home-clock-time">{now.toLocaleTimeString([], { timeStyle: 'short' })}</span>
    </time>
  );
}
