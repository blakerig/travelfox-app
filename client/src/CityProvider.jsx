import { useEffect, useState } from 'react';
import { CityContext } from './city-context.js';

// Single source of truth for "current city" - fetched once here so any
// screen that needs it (Home, CategoryScreen, ...) shares the same value
// instead of each re-fetching and re-picking a city independently.
//
// TODO: "current city" selection is still undecided (geolocation vs manual
// picker) - for now we hardcode to Barcelona while it's the city being
// populated with real data, falling back to whatever the API returns first
// if it's missing. When real city selection is built, this is the only
// place that needs to change.
export function CityProvider({ children }) {
  const [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/cities`)
      .then((res) => res.json())
      .then((data) => setCity(data.find((c) => c.name === 'Barcelona') ?? data[0] ?? null))
      .catch((err) => console.error('Failed to fetch cities:', err))
      .finally(() => setLoading(false));
  }, []);

  return <CityContext.Provider value={{ city, loading }}>{children}</CityContext.Provider>;
}
