// Team-account auth storage (admin/editor/creator) - not the consumer-
// facing login discussed separately (see claude/todo.md's "User accounts
// / login" items). Token + user are kept together as one JSON blob in
// localStorage rather than decoding the JWT client-side to read the role -
// simpler, and the server is the only thing that ever needs to trust the
// token's contents.
//
// Plain functions (not a hook) so non-component code - CityDataProvider's
// module-level fetchCityBundle, EntryEditor's save handler, etc. - can read
// the current token/attach it to a fetch without needing React context
// threaded all the way down to them.
const STORAGE_KEY = 'travelfox:auth';

// Reads the JWT's `exp` claim (seconds since epoch) without verifying it -
// only used to notice an expired session client-side; the server still
// verifies every token itself. Returns null if the token can't be read.
function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// An expired token is treated as logged out (and cleared) - added
// 2026-10-12. Before this, an expired 30-day token stayed in localStorage,
// so the UI still showed the editing controls while the server (via
// optionalAuth) silently treated every request as anonymous: draft-only
// categories vanished from Home and every save failed with a misleading
// "check the server is running" error.
export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const expiry = stored?.token ? tokenExpiryMs(stored.token) : null;
    if (expiry !== null && expiry <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function setStoredAuth(token, user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  } catch {
    // Storage unavailable (private browsing, disabled) - login still works
    // for this page load via React state, it just won't survive a reload.
  }
}

export function clearStoredAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}

// Spread into a fetch's `headers` - {} (no-op) when logged out, so every
// call site can use this unconditionally rather than branching on whether
// a token exists.
export function authHeaders() {
  const stored = getStoredAuth();
  return stored?.token ? { Authorization: `Bearer ${stored.token}` } : {};
}

// Turns a failed save/upload response into an error carrying its HTTP
// status, so describeSaveError() can word it honestly.
export function responseError(res, action = 'Save') {
  const err = new Error(`${action} failed (${res.status})`);
  err.status = res.status;
  return err;
}

// User-facing message for a failed save/upload. A 401 means the login
// expired or is no longer valid (e.g. JWT_SECRET changed) - the form's
// contents are untouched, and since the token lives in localStorage, logging
// in again in another tab and pressing Save here picks up the new token.
export function describeSaveError(err, action = 'save') {
  if (err?.status === 401) {
    return `Your login has expired, so this couldn't ${action}. Your changes are still here - open /admin in a new tab, log in again, then come back and try again.`;
  }
  if (err?.status === 403) {
    return `Your account isn't allowed to ${action} this.`;
  }
  return `Could not ${action} - check the server is running and try again.`;
}
