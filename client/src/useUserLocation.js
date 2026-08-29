import { useCallback, useState } from 'react';

// Wraps the browser Geolocation API for the Eating Out distance filter
// (2026-08-28). Deliberately request-on-demand (requestLocation() is called
// from a "Use my location" button in CategoryScreen.jsx) rather than on
// mount, so the permission prompt only appears once the user actually
// opens the distance filter, not just from visiting the screen.
//
// Not tied to any one category on purpose - proximity isn't cuisine
// specific, so this is reusable if Activities/Sightseeing grow a distance
// filter later (see categoryConfig.js). Because CategoryScreen stays
// mounted across a category switch (only its route params change - see the
// loadedKey reset pattern in CategoryScreen.jsx), a granted location
// persists across categories in the same visit instead of re-prompting.
//
// status: 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'
export function useUserLocation() {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  return { status, coords, requestLocation };
}
