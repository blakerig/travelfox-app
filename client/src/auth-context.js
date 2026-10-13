import { createContext, useContext } from 'react';

// See AuthProvider.jsx for what populates this - { user, isAuthenticated,
// canEdit, login, logout }. user is null when logged out, otherwise
// { id, email, role }. canEdit is false for a logged-out visitor and for a
// logged-in Tester account (see AuthProvider.jsx) - use it to gate any
// create/edit affordance; use isAuthenticated for "is someone logged in"
// checks that aren't about editing (e.g. the logout button).
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
