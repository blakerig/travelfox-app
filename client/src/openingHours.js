// Parses Entry.openingTimes (a free-text string, see the doc comment on
// that field in schema.prisma) into structured day/time data, and answers
// "is this entry open right now" given the entry's city timezone.
//
// Deliberately parses the existing hand-typed convention rather than
// adding a second, separately-maintained structured field/model - see the
// "Structured opening hours" item this closes out in claude/todo.md.
//
// Convention (updated 2026-09-02, hours after this file was first written,
// once the user clarified their actual typing habits): "Mon: 7.30pm to
// 11.30pm, Tue-Sat: 1pm to 3.45pm & 7.30pm to 11.30pm" - a comma separates
// day-range clauses, a colon separates the day range from its hours, "&"
// separates multiple windows within one clause (a lunch/dinner split),
// "to" (or a bare "-") separates a window's start/end, and minutes use a
// period ("7.30pm"), not a colon. A semicolon is *also* accepted as a
// clause separator and a colon is *also* accepted for minutes ("7:30pm") -
// both were the original convention this file shipped with hours earlier
// the same day, so existing entries typed that way keep working without
// needing to be re-typed. Parsing is deliberately forgiving, not strict:
// this field was never validated at save time, so a clause or window that
// doesn't match the convention is just skipped rather than thrown away
// entirely or crashing - see parseOpeningTimes below.
//
// One thing the comma-as-clause-separator convention can't do: list
// several non-contiguous single days in one clause (e.g. "Mon, Wed, Fri:
// 9am to 5pm") - a comma there now starts a new clause instead. Write it
// as three separate clauses instead ("Mon: 9am to 5pm, Wed: 9am to 5pm,
// Fri: 9am to 5pm") - same result, just one clause per day rather than one
// clause covering three.
//
// Known limitation, not handled: a window that crosses midnight (e.g.
// "10pm to 2am") is parsed but its end-before-start shape means it will
// never match anything, i.e. it's silently treated as closed rather than
// "open until 2am" - no entries use this yet, but worth fixing properly
// (splitting into two same-day windows) if a real late-night venue is ever
// entered. Logged in claude/todo.md alongside the rest of this feature's
// known gaps.

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDayToken(token) {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  const index = DAY_NAMES.findIndex((name) => t.startsWith(name));
  return index === -1 ? null : index;
}

// "Mon" -> {1}; "Tue-Sat" -> {2,3,4,5,6}; "Sat-Sun" -> {6,0} (wraps past
// the end of the DAY_NAMES array, since Sat=6 comes after Sun=0 in
// calendar order). Takes a single day or a single hyphen-range, not a
// comma-separated list of several - a comma is the *clause* separator now
// (see parseOpeningTimes below), so by the time this runs any comma has
// already split the string into separate clauses. "Mon, Wed, Fri: ..." in
// one clause isn't representable any more; write it as three clauses
// instead (see the file-level doc comment above).
function parseDayRange(daysPart) {
  const days = new Set();
  const parts = daysPart.split('-').map((p) => p.trim());
  if (parts.length === 1) {
    const d = parseDayToken(parts[0]);
    if (d != null) days.add(d);
  } else if (parts.length === 2) {
    const start = parseDayToken(parts[0]);
    const end = parseDayToken(parts[1]);
    if (start != null && end != null) {
      let i = start;
      // Walk forward from start to end, wrapping past Saturday back to
      // Sunday if the range crosses the week boundary (Sat-Sun).
      while (true) {
        days.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
    }
  }
  return days;
}

// "8am" -> 480, "12pm" -> 720, "7.30pm" -> 1170, "6:30pm" -> 1110,
// "14:00" -> 840 (no am/pm suffix is treated as 24-hour). Minutes can
// follow either a period ("7.30pm", the user's actual convention) or a
// colon ("7:30pm") - both accepted, same forgiving spirit as the ";"/","
// clause-separator flexibility above. Returns null for anything that
// doesn't look like a time.
function parseTimeToken(token) {
  const match = token.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (suffix === 'am') {
    if (hour === 12) hour = 0; // "12am" is midnight
  } else if (suffix === 'pm') {
    if (hour !== 12) hour += 12; // "12pm" stays noon
  }
  if (hour > 23) return null;
  return hour * 60 + minute;
}

// "8am to 12pm" -> {startMin: 480, endMin: 720}. Splits on the word "to"
// first (the documented convention); falls back to a bare "-" so
// "8am-12pm" also works, since that's an easy, natural typo/variant of the
// convention to make.
function parseWindow(windowStr) {
  const parts = windowStr.split(/\sto\s/i);
  const [startStr, endStr] = parts.length === 2 ? parts : windowStr.split('-');
  if (startStr == null || endStr == null) return null;
  const startMin = parseTimeToken(startStr);
  const endMin = parseTimeToken(endStr);
  if (startMin == null || endMin == null) return null;
  return { startMin, endMin };
}

// Returns an array of { days: Set<0-6>, windows: [{startMin, endMin}] } -
// one entry per comma- (or semicolon-) separated clause that parsed
// successfully. Clauses/windows that don't match the convention are
// dropped rather than causing the whole string to be treated as
// unparseable, since existing free-text entries may not follow it
// perfectly. Returns [] (not null) for a blank or entirely unparseable
// string - callers treat an empty array the same as "unknown", see
// isOpenNow below.
export function parseOpeningTimes(openingTimes) {
  if (!openingTimes) return [];
  const clauses = [];
  for (const rawClause of openingTimes.split(/[,;]/)) {
    const clause = rawClause.trim();
    if (!clause) continue;
    const colonIndex = clause.indexOf(':');
    if (colonIndex === -1) continue;
    const days = parseDayRange(clause.slice(0, colonIndex));
    if (days.size === 0) continue;
    const windows = clause
      .slice(colonIndex + 1)
      .split('&')
      .map((w) => parseWindow(w))
      .filter(Boolean);
    if (windows.length === 0) continue;
    clauses.push({ days, windows });
  }
  return clauses;
}

// Current { dayIndex: 0-6, minutes: 0-1439 } in the given IANA timezone
// (e.g. "Europe/Madrid") - deliberately NOT the viewer's own device
// timezone, since "is this restaurant open" needs to be answered in the
// restaurant's own local time (see the discussion logged in
// claude/todo.md - a viewer planning a trip from a different timezone
// would otherwise get a confidently wrong answer, the same lesson learned
// from the straight-line distance filter). Returns null if timezone is
// missing or isn't a real IANA identifier Intl recognises.
function getZonedNow(timezone) {
  if (!timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase();
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    const dayIndex = DAY_NAMES.findIndex((name) => weekday?.startsWith(name));
    if (dayIndex === -1 || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { dayIndex, minutes: hour * 60 + minute };
  } catch {
    // Intl throws on an unrecognised timeZone string (e.g. a typo in
    // Prisma Studio) - treat the same as "unknown" rather than crashing.
    return null;
  }
}

// true/false when it can confidently say so, null when it can't (no
// opening-times text, nothing in it parsed, or no usable city timezone) -
// callers should treat null as "don't show a status" rather than guessing,
// same "don't claim precision you don't have" principle used throughout
// this app (see the distance filter). Deliberately computed fresh from
// `new Date()` at call time rather than kept live-ticking - good enough
// for how briefly someone looks at a list/detail screen, see the note in
// CategoryScreen.jsx/EntryCard.jsx where this gets called.
export function isOpenNow(openingTimes, timezone) {
  const clauses = parseOpeningTimes(openingTimes);
  if (clauses.length === 0) return null;
  const now = getZonedNow(timezone);
  if (!now) return null;
  return clauses.some(
    (clause) =>
      clause.days.has(now.dayIndex) &&
      clause.windows.some((w) => now.minutes >= w.startMin && now.minutes < w.endMin)
  );
}
