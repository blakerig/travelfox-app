import { createContext, useContext } from 'react';

// Plain (non-component) module: the context object plus the hook that reads
// it. Kept separate from CityProvider.jsx so that file only exports a
// component (React Fast Refresh works reliably that way).
export const CityContext = createContext(null);

export function useCity() {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error('useCity must be used within a CityProvider');
  return ctx;
}
