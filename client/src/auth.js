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

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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
