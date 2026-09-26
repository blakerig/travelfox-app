// Client-side helper for the entry-editor opening-hours lookup (2026-09-26)
// - see "Structured opening hours" in claude/todo.md for the fuller
// discussion of why this pulls from OpenStreetMap rather than Google
// Places. Short version: Google's Places API can return opening hours, but
// its Terms of Service (developers.google.com/maps/documentation/places/
// web-service/policies) forbid storing/caching most Place Details fields
// long-term - only the Place ID itself is exempt - so a one-time pull into
// Entry.openingTimes (exactly what this needs, same as every other field
// in this app) isn't something Google's terms actually allow, on top of
// opening hours falling under Google's priciest "Enterprise" pricing SKU.
// OpenStreetMap's `opening_hours` tag is free, genuinely structured (not
// free text - see the OSM wiki), and carries no such caching restriction
// (ODbL just requires attribution) - so this proxies OSM's Overpass API
// server-side (GET /api/opening-hours-lookup in server/index.js), same OSM
// ecosystem this app already leans on for geocoding.
//
// Two responsibilities live in this one file rather than being split: the
// fetch call (fetchOsmOpeningHours, mirrors geocode.js's shape/contract),
// and the OSM-syntax-to-this-app's-convention converter
// (convertOsmOpeningHours). Kept together because nothing else in the app
// needs either piece independently, and the converter only exists to
// serve this one lookup feature.

// Calls GET /api/opening-hours-lookup with the entry's name and
// coordinates - needs coordinates, not just a name, since Overpass finds
// things by location, not by a text search the way LocationIQ/Nominatim
// does (see geocode.js). Returns null when OSM has nothing nearby that
// matches this entry's name closely enough to trust - a real "nothing
// there" answer (OSM's coverage is genuinely patchy - most of the value
// of this feature is a real time-saver on the entries that *are* mapped,
// not a guarantee every entry has something to find), not a failure.
// Throws on an actual failure (network error, non-2xx response) - the
// caller is responsible for catching that and showing it as a lookup
// error, not a "nothing found" result, same convention as geocodeAddress.
export async function fetchOsmOpeningHours(apiUrl, { name, latitude, longitude }) {
  const params = new URLSearchParams({
    name: name ?? '',
    latitude: String(latitude),
    longitude: String(longitude),
  });
  const res = await fetch(`${apiUrl}/api/opening-hours-lookup?${params}`);
  if (!res.ok) {
    throw new Error(`Opening-hours lookup failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.found) return null;
  return {
    name: data.name,
    raw: data.raw,
    // Converted into this app's own Mon/Tue convention where possible -
    // see convertOsmOpeningHours below. null means the raw OSM text uses
    // a construct this deliberately doesn't attempt to translate; the
    // caller (EntryEditor.jsx) shows the raw text as a reference instead
    // of an insertable suggestion in that case, since inserting untranslated
    // OSM syntax into Entry.openingTimes would silently break this app's
    // own parser (openingHours.js), which knows nothing about OSM's format.
    converted: convertOsmOpeningHours(data.raw),
  };
}

// OSM day codes -> this app's own day tokens (see openingHours.js's
// DAY_NAMES/parseDayToken) - "Mon"/"Tue"/etc. rather than "Mo"/"Tu", since
// that's what this app's convention already expects and parses.
const OSM_DAY_TO_APP = {
  Mo: 'Mon',
  Tu: 'Tue',
  We: 'Wed',
  Th: 'Thu',
  Fr: 'Fri',
  Sa: 'Sat',
  Su: 'Sun',
};

// "Mo" -> "Mon"; "Mo-Fr" -> "Mon-Fri" (this app's parser accepts a hyphen
// day-range directly, see parseDayGroup in openingHours.js). Returns null
// for anything that isn't a single OSM day code or a two-code range -
// convertOsmOpeningHours bails entirely (returns null) rather than half-
// converting when this happens, since a day token it can't confidently
// place shouldn't just be dropped from the result.
function convertOsmDayToken(token) {
  const parts = token.split('-').map((p) => p.trim());
  if (parts.length === 1) {
    return OSM_DAY_TO_APP[parts[0]] ?? null;
  }
  if (parts.length === 2) {
    const start = OSM_DAY_TO_APP[parts[0]];
    const end = OSM_DAY_TO_APP[parts[1]];
    return start && end ? `${start}-${end}` : null;
  }
  return null;
}

// "08:00" -> "8am"; "13:30" -> "1.30pm" - this app's convention uses a
// period for minutes (see openingHours.js's file comment) and 12-hour
// am/pm, not OSM's 24-hour clock. Hour 24 (OSM's way of writing midnight
// as the *end* of a window, e.g. "20:00-24:00") folds to hour 0 - "12am" -
// which is exactly what this app's own convention already uses for a
// window's end when it means "until midnight" (isOpenNow in
// openingHours.js treats an end time <= the start time as spilling into
// the next calendar day, the same mechanism a literal "12am" end time
// triggers), so this isn't a special case to handle separately.
function formatOsmTime(hourStr, minuteStr) {
  const hour = Number(hourStr) % 24;
  const minute = Number(minuteStr);
  const suffix = hour < 12 ? 'am' : 'pm';
  let hour12 = hour % 12;
  if (hour12 === 0) hour12 = 12;
  return minute === 0 ? `${hour12}${suffix}` : `${hour12}.${String(minute).padStart(2, '0')}${suffix}`;
}

// "08:00-17:00" -> "8am to 17:00"... no - "8am to 5pm". Returns null for
// anything not matching OSM's plain HH:MM-HH:MM shape (see the caller's
// comment on why a single unrecognised piece bails the whole conversion
// rather than dropping just that piece).
function convertOsmWindow(window) {
  const match = window.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, startHour, startMinute, endHour, endMinute] = match;
  return `${formatOsmTime(startHour, startMinute)} to ${formatOsmTime(endHour, endMinute)}`;
}

// Translates an OSM `opening_hours` tag value into this app's own
// convention (see the file-level comment on Entry.openingTimes in
// schema.prisma, or openingHours.js) - e.g. "Mo-Fr 08:00-12:00,13:00-18:00"
// -> "Mon-Fri: 8am to 12pm & 1pm to 6pm". Returns null (not a partial/
// best-guess conversion) for anything outside a deliberately narrow scope:
// OSM's opening_hours mini-language supports a lot more than this app's
// own convention does - public/school holiday modifiers ("PH", "SH"),
// fallback rule groups ("||"), week-number and month-range restrictions,
// explicit "closed"/"off" exception days layered on top of a broader rule,
// and "24/7" - and getting any of those subtly wrong would silently feed
// a wrong value into isOpenNow (openingHours.js), which is worse than not
// converting at all. Rather than build (and maintain) day-set-subtraction
// logic to handle e.g. "Mo-Su 09:00-18:00; Tu off" correctly, this simply
// declines to convert anything containing those constructs - the raw OSM
// text still gets shown to whoever's editing the entry (see
// EntryEditor.jsx), just as something to translate by hand rather than a
// one-tap "Use this" suggestion. Revisit if this scope limit turns out to
// exclude a lot of real entries in practice - not built preemptively, same
// "ship the safe version, expand it if it's actually needed" pattern used
// elsewhere in this app (e.g. the Directions-link fallback).
export function convertOsmOpeningHours(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Deliberately out of scope - see the doc comment above for why each of
  // these bails rather than attempting a partial conversion.
  if (/\b(PH|SH)\b/.test(trimmed)) return null;
  if (trimmed.includes('||')) return null;
  if (/\bweek\b/i.test(trimmed)) return null;
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(trimmed)) return null;
  if (/\b(off|closed)\b/i.test(trimmed)) return null;
  if (trimmed === '24/7') return null;

  const rules = trimmed
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean);
  if (rules.length === 0) return null;

  const clauses = [];
  for (const rule of rules) {
    // Splits a rule into its day-selector part and its time-window part -
    // e.g. "Mo-Fr 08:00-12:00,13:00-18:00" -> "Mo-Fr" / "08:00-12:00,13:00-18:00".
    // A rule with no day part at all (OSM allows this - "every day" - but
    // this app's own parser only assumes "every day" for a clause with no
    // day prefix at all, i.e. no leading day text before a colon) isn't
    // handled here - a bare time-only rule doesn't match this regex (no
    // day-selector characters before the time), so it correctly falls
    // through to the "return null" below rather than being silently
    // mis-converted.
    const match = rule.match(
      /^([A-Za-z,\-\s]+?)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/
    );
    if (!match) return null;
    const [, dayPart, timePart] = match;

    // OSM commas combine either several individual days ("Mo,We,Fr") or
    // several time windows ("08:00-12:00,13:00-18:00") depending on which
    // side of the rule they're on - this app's convention uses "&" for
    // both of those (comma is reserved as this app's *clause* separator),
    // so both sides' commas become "&" here, not the semicolon/comma
    // clause-join used between rules further down.
    const dayTokens = dayPart
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const convertedDays = dayTokens.map(convertOsmDayToken);
    if (convertedDays.some((d) => d == null)) return null;

    const windowTokens = timePart
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);
    const convertedWindows = windowTokens.map(convertOsmWindow);
    if (convertedWindows.some((w) => w == null)) return null;

    clauses.push(`${convertedDays.join(' & ')}: ${convertedWindows.join(' & ')}`);
  }

  return clauses.length > 0 ? clauses.join(', ') : null;
}
