import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth-context.js';
import './AdminLogin.css';

// Team login (admin/editor/creator) - deliberately not linked from
// anywhere in the public-facing nav (Home, CategoryScreen, etc.). Reached
// only by knowing the /admin url directly, same as most small internal
// CMS tools - see the "Login entry point" discussion in claude/todo.md.
// A successful login does a full page reload rather than a client-side
// navigate - see AuthProvider.jsx's login() for why.
function AdminLogin() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    login(email, password)
      .then(() => {
        // Reload back onto /admin itself (not straight into the app) -
        // still a full page load so the shared data cache in
        // CityDataProvider.jsx picks up the new token cleanly (see
        // AuthProvider.jsx's login() comment), but this way you land on
        // the "already logged in" options below (Go to the app / Manage
        // team) instead of skipping past them.
        window.location.href = '/admin';
      })
      .catch((err) => {
        setError(err.message || 'Login failed');
        setSubmitting(false);
      });
  }

  if (isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1 className="admin-login-title">Already logged in</h1>
          <p className="admin-login-subtitle">
            Signed in as {user.email} ({user.role.toLowerCase()}).
          </p>
          <div className="admin-login-actions">
            <Link to="/" className="admin-login-link">
              Go to the app
            </Link>
            {user.role === 'ADMIN' && (
              <Link to="/admin/users" className="admin-login-link">
                Manage team
              </Link>
            )}
            <button type="button" className="admin-login-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1 className="admin-login-title">Team login</h1>
        <p className="admin-login-subtitle">Travelfox content editing</p>

        <label className="admin-login-field">
          <span className="admin-login-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="admin-login-input"
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-login-field">
          <span className="admin-login-label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-login-input"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="admin-login-error">{error}</div>}

        <button type="submit" className="admin-login-submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;
