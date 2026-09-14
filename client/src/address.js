// Formats Entry.address for display by dropping the postcode, city and
// country from the end when they're redundant with the city the entry is
// already filed under - since that's already implied by the section the
// address is shown in (e.g. a Lyon entry's address doesn't need to repeat
// "Lyon" while you're already looking at Lyon).
//
// Raised by Blake 2026-09-14 alongside phoneNumber.js's country-code rule,
// and follows the same underlying principle: only touch the value when the
// redundant part is safely identifiable, and leave everything else exactly
// as typed. Entry.address is one free-text field (see schema.prisma), not
// separate street/city/postcode/country fields, so there's no structured
// data to compare against - just a comma-separated string, most often
// pasted straight from Google Maps in its usual "Street, Number, District,
// Postcode City, Country" shape (confirmed against a real entry, Cal Pep:
// "Plaça de les Olles, 8, Ciutat Vella, 08003 Barcelona, Spain").
//
// Approach: split on commas, then pop segments off the *end* only, only
// while each one is unambiguously the country or the city (city alone, or
// "<postcode> <city>" glued together the way Google Maps writes it) -
// stopping the instant a segment doesn't match. That's what makes this
// safe for a day-trip/nearby-town entry deliberately filed under a
// different city's section on purpose: its trailing place name won't
// match this city, so the loop stops immediately and the address is shown
// in full - which is the point, since that mismatch is exactly the signal
// the reader needs. A district/neighbourhood segment (like "Ciutat Vella"
// above) is never popped - only what was actually asked to go (postcode/
// city/country) - since it's useful, disambiguating information the city
// name doesn't already convey.
//
// Deliberately does NOT try to strip a postcode entered as its own comma
// segment, separate from the city (e.g. "..., 2514 EA, The Hague, ..."):
// on its own a short alphanumeric segment is indistinguishable from a
// house number (Cal Pep's own address has one: "..., 8, ..."), and
// guessing wrong would eat real information - see the "Some Street, 8"
// case this was checked against. The combined "<postcode> <city>" form
// above covers the shape every address seen from this app so far
// actually uses.
//
// Display only. getDirectionsUrl (EntryDetail.jsx) and the geocode lookup
// (EntryEditor.jsx) both use the full, untouched address - stripping would
// only hurt map/geocoding accuracy there, not help it.

function isCountrySegment(segment, countryNameLower) {
  return Boolean(countryNameLower) && segment.toLowerCase() === countryNameLower;
}

// True for a segment that IS the city name, or is "<postcode> <city>" -
// one or two short alphanumeric tokens (covers both a plain numeric
// postcode like Spain/France's "08003"/"69002", and a split one like the
// Netherlands' "1012 AB") immediately followed by the city name and
// nothing else. Word-based, not a plain substring match, so "Lyon-la-Foret"
// or "Vic" never get mistaken for "Lyon"/"Barcelona".
function isCityOrPostcodeCitySegment(segment, cityWords) {
  const words = segment.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < cityWords.length) return false;
  const tail = words.slice(words.length - cityWords.length);
  if (tail.join(' ') !== cityWords.join(' ')) return false;
  const prefixWords = words.slice(0, words.length - cityWords.length);
  if (prefixWords.length === 0) return true;
  return prefixWords.every((w) => w.length <= 5 && /^[a-z0-9-]+$/i.test(w));
}

export function formatEntryAddress(address, city) {
  if (!address) return address;
  const cityName = city?.name?.trim();
  if (!cityName) return address;

  const segments = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Nothing to safely pop off a single-segment address without risking
  // stripping the entire thing - leave it exactly as typed.
  if (segments.length <= 1) return address;

  const cityWords = cityName.toLowerCase().split(/\s+/).filter(Boolean);
  const countryNameLower = city?.country?.name?.trim().toLowerCase();

  // Country is always last when present, so it's checked first; each step
  // only proceeds while more than one segment remains, so the address is
  // never stripped down to nothing.
  if (segments.length > 1 && isCountrySegment(segments[segments.length - 1], countryNameLower)) {
    segments.pop();
  }
  if (segments.length > 1 && isCityOrPostcodeCitySegment(segments[segments.length - 1], cityWords)) {
    segments.pop();
  }

  const stripped = segments.join(', ');
  return stripped || address;
}
