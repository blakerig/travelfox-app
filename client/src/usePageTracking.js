import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useCity } from './city-context.js';
import { trackEvent } from './trackEvent.js';

// Matches a category's own list screen only (/category/eating-out), not
// anything deeper (/category/eating-out/entry/12, .../type/3) - so a
// page_view's categorySlug means "this category's screen was opened", and
// entry opens are counted separately as entry_view (see EntryDetail.jsx).
const CATEGORY_SCREEN = /^\/category\/([^/]+)\/?$/;

// Records a page_view each time the visitor lands on a new screen in the
// current city, from one place instead of a call in every screen - mounted
// once in AppRoutes (see App.jsx). Waits for the city to load first, since
// "a view of Home" isn't meaningful to an advertiser without knowing which
// city it was for. Switching city while staying on the same path counts as
// a new view (it is a different city's Home). /admin screens are our own
// tooling, not audience, and are skipped (trackEvent also skips anyone
// logged in as staff).
export function usePageTracking() {
  const { pathname } = useLocation();
  const { city } = useCity();
  const cityId = city?.id;

  useEffect(() => {
    if (cityId == null || pathname.startsWith('/admin')) return;
    const categorySlug = pathname.match(CATEGORY_SCREEN)?.[1];
    trackEvent('page_view', { cityId, categorySlug, path: pathname });
  }, [pathname, cityId]);
}
