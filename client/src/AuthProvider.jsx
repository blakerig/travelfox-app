import { useCallback, useMemo, useState } from 'react';
import { AuthContext } from './auth-context.js';
import { getStoredAuth, setStoredAuth, clearStoredAuth } from './auth.js';

// Team-account auth (admin/editor/creator), not the consumer-facing login
// discussed separately - see claude/todo.md's "User accounts / login"
// items. Sits above CityProvider/CityDataProvider in App.jsx so both can
// eventually read `user` if needed, though most of them read the token
// directly via auth.js's authHeaders() instead (see that file's comment on
// why - a lot of the fetches this touches aren't inside components).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredAuth()?.user ?? null);

  // Deliberately does a full page reload after a successful login/logout
  // (see AdminLogin.jsx and the logout button in Home.jsx) rather than a
  // client-side navigate - the shared per-city data cache in
  // CityDataProvider.jsx was very likely fetched anonymously (published-
  // only) before login, and a plain navigate wouldn't refetch it with the
  // new token attached. A full reload is the simplest way to guarantee
  // every screen's data reflects the new auth state from a clean start,
  // for a tool this low-traffic.
  const login = useCallback(async (email, password) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    setStoredAuth(data.token, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: user != null, login, logout }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
