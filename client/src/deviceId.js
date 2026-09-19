// Stable per-device identifier for anonymous features that need to persist
// across visits without a real user account - currently just Favourites
// (see Favourite in schema.prisma). Generated once with crypto.randomUUID()
// and cached in localStorage; a cleared browser, private window, or a
// different device gets a fresh id and so starts with an empty favourites
// list. That trade-off is deliberate for now, not an oversight - see
// claude/todo.md's "User accounts / login" item, which names saved
// favourites as the natural first hook for a future real-account "soft
// login wall"; this anonymous-device-id approach is the stepping stone
// described there, chosen so favouriting works today without forcing that
// accounts decision first. Migrating a device's favourites onto a real
// account later is a small follow-up (reassign this id's rows to a
// userId), not a rebuild.
const STORAGE_KEY = 'travelfox_device_id';

export function getDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private browsing / storage blocked - fall back to a per-call id
    // rather than throwing. Favourites just won't persist for this
    // visitor (every toggle looks like a new device), same graceful-
    // degradation spirit as useUserLocation.js falling back rather than
    // crashing when a browser API isn't available.
    return crypto.randomUUID();
  }
}
