import { createContext, useContext } from 'react';

// See AuthProvider.jsx for what populates this - { user, isAuthenticated,
// login, logout }. user is null when logged out, otherwise
// { id, email, role }.
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
