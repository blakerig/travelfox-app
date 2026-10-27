// Anonymous usage analytics (added 2026-10-26) - sends one event to
// POST /api/events (see AnalyticsEvent in server/prisma/schema.prisma for
// what each event type means and why nothing identifying is captured).
//
// Fire-and-forget on purpose: never awaited, errors swallowed, and
// `keepalive` lets the request finish even if the page navigates away
// straight after - analytics must never slow down or break browsing.
//
// Team members are never tracked. A logged-in staff account is us editing
// and checking content, not an audience, and counting it would inflate
// exactly the numbers that get shown to advertisers - so anyone logged in
// at /admin on a given device is excluded for as long as that login lasts.
import { getDeviceId } from './deviceId.js';
import { getStoredAuth } from './auth.js';

export function trackEvent(eventType, { cityId, categorySlug, entryId, path, query, resultCount } = {}) {
  try {
    if (getStoredAuth()) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        eventType,
        cityId,
        categorySlug,
        entryId,
        path,
        query,
        resultCount,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing to do - see the file comment: analytics must never throw.
  }
}
