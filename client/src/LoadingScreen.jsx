import { useEffect, useState } from 'react';
import './LoadingScreen.css';

// Shown by App.jsx while CityProvider's initial /api/cities fetch is in
// flight. Without this, the very first thing a visitor sees is a genuinely
// blank/empty shell (Home renders immediately with no data), which reads
// as "broken" rather than "loading" - people click away rather than wait.
// That gap can be a real few seconds even on a warm server, and much
// longer on Render's free tier after the server has spun down from
// inactivity (a cold start can take 30-60s) - see claude/todo.md. The
// second message only appears after a delay so a normal fast load never
// shows it, but a slow cold-start load gets an honest explanation instead
// of an indefinite bare spinner.
const SLOW_NOTICE_DELAY_MS = 4000;

function LoadingScreen() {
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowNotice(true), SLOW_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-title">TravelFox</p>
      {showSlowNotice && (
        <p className="loading-notice">
          Still loading - the server can take a moment to wake up.
        </p>
      )}
    </div>
  );
}

export default LoadingScreen;
