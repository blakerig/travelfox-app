import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth-context.js';
import { authHeaders } from './auth.js';
import './AdminUsers.css';

const ROLES = ['CREATOR', 'EDITOR', 'ADMIN'];

// Admin-only: list team accounts and create new ones. Reached via the
// "Manage team" link on /admin (see AdminLogin.jsx) - not linked from
// anywhere public. Mirrors the server's own restriction (GET/POST
// /api/users both require the ADMIN role - see server/index.js) so a
// non-admin who somehow lands here sees a plain "not allowed" message
// instead of a broken form, but the real enforcement is server-side.
function AdminUsers() {
  const { user, isAuthenticated } = useAuth();
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CREATOR');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const isAdmin = isAuthenticated && user.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/users`, { headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then(setUsers)
      .catch((err) => {
        console.error('Failed to load users:', err);
        setLoadError('Could not load the team list.');
      });
  }, [isAdmin]);

  function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    fetch(`${import.meta.env.VITE_API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email, password, role }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((data) => Promise.reject(new Error(data.error || `Failed (${res.status})`)));
        return res.json();
      })
      .then((created) => {
        setUsers((prev) => (prev ? [...prev, created] : [created]));
        setEmail('');
        setPassword('');
        setRole('CREATOR');
      })
      .catch((err) => setCreateError(err.message))
      .finally(() => setCreating(false));
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-users">
        <p className="admin-users-status">
          <Link to="/admin" className="admin-users-link">Log in</Link> to manage the team.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-users">
        <p className="admin-users-status">Only admins can manage team accounts.</p>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="admin-users-header">
        <Link to="/admin" className="admin-users-back" aria-label="Back">&larr;</Link>
        <h1 className="admin-users-title">Team accounts</h1>
      </div>

      {loadError && <div className="admin-users-error">{loadError}</div>}

      {users && (
        <ul className="admin-users-list">
          {users.map((u) => (
            <li key={u.id} className="admin-users-row">
              <span className="admin-users-email">{u.email}</span>
              <span className="admin-users-role">{u.role.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}

      <form className="admin-users-form" onSubmit={handleCreate}>
        <h2 className="admin-users-form-title">Add someone</h2>
        <label className="admin-users-field">
          <span className="admin-users-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="admin-users-input"
            required
          />
        </label>
        <label className="admin-users-field">
          <span className="admin-users-label">Temporary password</span>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-users-input"
            required
          />
        </label>
        <label className="admin-users-field">
          <span className="admin-users-label">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="admin-users-input"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
        {createError && <div className="admin-users-error">{createError}</div>}
        <button type="submit" className="admin-users-submit" disabled={creating}>
          {creating ? 'Adding…' : 'Add'}
        </button>
      </form>
    </div>
  );
}

export default AdminUsers;
