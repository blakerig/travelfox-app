import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from './auth-context.js';
import { useCity } from './city-context.js';
import { authHeaders } from './auth.js';
import './AdminAnalytics.css';

// Usage numbers for the team (ADMIN/EDITOR) - what screens and listings
// people open, and what they search for. Reached from the logged-in options
// on /admin (see AdminLogin.jsx), not linked from anywhere public. Mirrors
// the server's own restriction (every GET /api/analytics/* requires one of
// those roles - see server/index.js) so anyone else sees a plain message
// instead of five failed requests, but the real enforcement is server-side.
//
// Loaded lazily from App.jsx so recharts only downloads when this page is
// opened. Data comes from AnalyticsEvent rows (see schema.prisma); nothing
// appears until the capture side (trackEvent.js) has been live for a while.

// Recharts needs real colour strings, so these mirror the green/ink tokens
// in AdminAnalytics.css rather than reading CSS variables.
const GREEN = '#2e7a45';
const AMBER = '#d98e2b';

const RANGES = [7, 30, 90];

const TRENDS = [
  { value: 'page_view', label: 'Screen views' },
  { value: 'entry_view', label: 'Entry views' },
  { value: 'search', label: 'Searches' },
];

function formatDay(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Fetches one GET /api/analytics/<path> endpoint and re-fetches when its
// params change. Keeps showing the previous result while the next one loads
// (flagged by `loading`, which the page dims) instead of flashing empty, and
// derives `loading` during render rather than setting it inside the effect.
function useAnalytics(path, params, enabled) {
  const query = new URLSearchParams(params).toString();
  const key = `${path}?${query}`;
  const [result, setResult] = useState(null); // { key, data } | { key, error }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_URL}/api/analytics/${path}?${query}`, { headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch((err) => {
        console.error(`Failed to load analytics/${path}:`, err);
        if (!cancelled) setResult({ key, error: 'Could not load this section.' });
      });
    return () => {
      cancelled = true;
    };
  }, [key, path, query, enabled]);

  return {
    data: result?.data ?? null,
    error: result?.key === key ? (result.error ?? null) : null,
    loading: enabled && result?.key !== key,
  };
}

function Panel({ title, state, children, hint }) {
  return (
    <section className={`admin-analytics-panel${state.loading ? ' is-loading' : ''}`}>
      <h2 className="admin-analytics-panel-title">{title}</h2>
      {hint && <p className="admin-analytics-hint">{hint}</p>}
      {state.error ? <div className="admin-analytics-error">{state.error}</div> : children}
    </section>
  );
}

function Empty({ children = 'Nothing recorded for this period yet.' }) {
  return <p className="admin-analytics-empty">{children}</p>;
}

function AdminAnalytics() {
  const { user, isAuthenticated } = useAuth();
  const { cities } = useCity();
  const [days, setDays] = useState(30);
  const [cityId, setCityId] = useState('');
  const [trend, setTrend] = useState('page_view');

  const allowed = isAuthenticated && (user.role === 'ADMIN' || user.role === 'EDITOR');
  const base = { days, ...(cityId && { cityId }) };

  // Hooks all run before the early returns below (rules of hooks); `allowed`
  // keeps them from fetching for someone who can't see the page.
  const overview = useAnalytics('overview', base, allowed);
  const series = useAnalytics('views-over-time', { ...base, eventType: trend }, allowed);
  const topEntries = useAnalytics('top-entries', { ...base, limit: 10 }, allowed);
  const byCategory = useAnalytics('views-by-category', base, allowed);
  const searches = useAnalytics('searches', base, allowed);

  if (!isAuthenticated) {
    return (
      <div className="admin-analytics">
        <p className="admin-analytics-status">
          <Link to="/admin" className="admin-analytics-link">Log in</Link> to see usage numbers.
        </p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="admin-analytics">
        <p className="admin-analytics-status">Only admins and editors can see usage numbers.</p>
      </div>
    );
  }

  const stats = overview.data;
  const noData = stats && stats.pageViews + stats.entryViews + stats.searches === 0;
  const trendLabel = TRENDS.find((t) => t.value === trend).label;
  const entryRows = topEntries.data ?? [];

  return (
    <div className="admin-analytics">
      <div className="admin-analytics-header">
        <Link to="/admin" className="admin-analytics-back" aria-label="Back">&larr;</Link>
        <h1 className="admin-analytics-title">Usage</h1>
      </div>

      <div className="admin-analytics-controls">
        <label className="admin-analytics-control">
          <span className="admin-analytics-label">Period</span>
          <select
            className="admin-analytics-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>Last {r} days</option>
            ))}
          </select>
        </label>
        <label className="admin-analytics-control">
          <span className="admin-analytics-label">City</span>
          <select
            className="admin-analytics-select"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {noData && (
        <Empty>
          No usage recorded for this period yet. Numbers build up as people use the app - visits
          from devices where you are logged in as staff are not counted.
        </Empty>
      )}

      <div className={`admin-analytics-cards${overview.loading ? ' is-loading' : ''}`}>
        <div className="admin-analytics-card">
          <span className="admin-analytics-card-value">{stats ? stats.uniqueDevices.toLocaleString() : '–'}</span>
          <span className="admin-analytics-card-label">Unique devices</span>
        </div>
        <div className="admin-analytics-card">
          <span className="admin-analytics-card-value">{stats ? stats.pageViews.toLocaleString() : '–'}</span>
          <span className="admin-analytics-card-label">Screen views</span>
        </div>
        <div className="admin-analytics-card">
          <span className="admin-analytics-card-value">{stats ? stats.entryViews.toLocaleString() : '–'}</span>
          <span className="admin-analytics-card-label">Entry views</span>
        </div>
        <div className="admin-analytics-card">
          <span className="admin-analytics-card-value">{stats ? stats.searches.toLocaleString() : '–'}</span>
          <span className="admin-analytics-card-label">Searches</span>
        </div>
      </div>

      <Panel title="Over time" state={series}>
        <div className="admin-analytics-tabs" role="tablist">
          {TRENDS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={trend === t.value}
              className={`admin-analytics-tab${trend === t.value ? ' is-active' : ''}`}
              onClick={() => setTrend(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="admin-analytics-chart">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series.data ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#d9e0dc" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={formatDay} />
              <Legend />
              <Line type="monotone" dataKey="count" name={trendLabel} stroke={GREEN} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="devices" name="Unique devices" stroke={AMBER} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Most viewed entries"
        state={topEntries}
        hint="The per-listing number to quote to a business considering a promoted slot."
      >
        {entryRows.length === 0 ? (
          <Empty />
        ) : (
          <div className="admin-analytics-chart">
            <ResponsiveContainer width="100%" height={entryRows.length * 34 + 30}>
              <BarChart data={entryRows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#d9e0dc" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(name) => truncate(name, 20)}
                />
                <Tooltip />
                <Bar dataKey="views" name="Views" fill={GREEN} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="By category"
        state={byCategory}
        hint="Screen views = the category's own list was opened. Entry views = one of its listings was opened."
      >
        {(byCategory.data ?? []).length === 0 ? (
          <Empty />
        ) : (
          <div className="admin-analytics-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCategory.data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#d9e0dc" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="screenViews" name="Screen views" fill={GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="entryViews" name="Entry views" fill={AMBER} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="admin-analytics-columns">
        <Panel title="Top searches" state={searches}>
          {(searches.data?.top ?? []).length === 0 ? (
            <Empty />
          ) : (
            <ol className="admin-analytics-list">
              {searches.data.top.map((t) => (
                <li key={t.term} className="admin-analytics-list-row">
                  <span>{t.term}</span>
                  <span className="admin-analytics-list-count">{t.searches}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel
          title="Searches with no results"
          state={searches}
          hint="Content people want that the app doesn't have yet."
        >
          {(searches.data?.noResults ?? []).length === 0 ? (
            <Empty>None - every search found something.</Empty>
          ) : (
            <ol className="admin-analytics-list">
              {searches.data.noResults.map((t) => (
                <li key={t.term} className="admin-analytics-list-row">
                  <span>{t.term}</span>
                  <span className="admin-analytics-list-count">{t.searches}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default AdminAnalytics;
