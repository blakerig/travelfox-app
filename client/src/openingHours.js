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
// "&" also combines day-groups on the *day* side of a clause (2026-09-17,
// see parseDayRange below) - "Mon-Thu & Sun: 11.30am to 2.30am" means
// Mon/Tue/Wed/Thu/Sun all share that one set of hours, without needing to
// repeat them across separate comma clauses. Added once a real entry used
// it this way and it turned out to silently parse wrong rather than fail
// loudly - see the "Fixed 2026-09-17" note below.
//
// Fixed 2026-09-17: a window that crosses midnight (e.g. "11.30am to
// 2.30am") used to be parsed but never match anything - its end-before-
// start shape meant it read as permanently closed rather than "open until
// 2.30am the next morning" (found via a real entry using exactly this
// shape, open Mon-Thu & Sun 11.30am-2.30am, showing closed at 5.30pm on a
// Thursday). isOpenNow now treats endMin <= startMin as "crosses into the
// next calendar day": it matches either the tail of *today's* window
// (today is in the clause's days, now is at/after startMin) or the
// spillover from *yesterday's* window (yesterday is in the clause's days,
// now is still before endMin) - see isOpenNow below. This was previously
// logged as a known limitation in claude/todo.md; that note has been
// updated to reflect the fix.
//
// Fixed 2026-09-17, same fix: the day-parsing bug this surfaced. Before
// the "&" day-group support above existed, "Mon-Thu & Sun" was fed whole
// into the hyphen-range parser, which split it on "-" into "Mon" and
// "Thu & Sun" - the latter then matched via parseDayToken's startsWith
// check (which was only ever meant to match a token against its own name)
// because "thu & sun" happens to start with "thu", silently discarding
// Sunday from the day set with no error or warning. Fixed as a side effect
// of routing each "&"-separated group through the day/range parser
// separately (see parseDayRange below), so parseDayToken only ever sees a
// single clean day token again.

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDayToken(token) {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  const index = DAY_NAMES.findIndex((name) => t.startsWith(name));
  return index === -1 ? null : index;
}

// "Mon" -> {1}; "Tue-Sat" -> {2,3,4,5,6}; "Sat-Sun" -> {6,0} (wraps past
// the end of the DAY_NAMES array, since Sat=6 comes after Sun=0 in
// calendar order). Takes a single day-group: one day, or one hyphen-range
// - not a comma-separated list of several, since a comma is the *clause*
// separator now (see parseOpeningTimes below), and not an "&"-separated
// list of several either, since that's split off by parseDayRange below
// before this ever runs. "Mon, Wed, Fri: ..." in one clause isn't
// representable via comma any more; write it as three clauses instead
// (see the file-level doc comment above), or combine them with "&" if
// they share identical hours (see parseDayRange below).
function parseDayGroup(daysPart) {
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

// "Mon-Thu & Sun" -> {1,2,3,4,0} - splits on "&" first (2026-09-17, see the
// file-level doc comment above) so each day-group (a single day or a
// hyphen-range) is parsed on its own via parseDayGroup, then unions the
// results. A clause with no "&" at all (the common case, e.g. "Tue-Sat")
// splits into exactly one group and behaves exactly as before this was
// added. Deliberately routes each group through parseDayGroup separately
// rather than handing the whole string to it - passing "Mon-Thu & Sun"
// straight to a hyphen-splitting parser silently mis-parsed it (the "&
// Sun" tail got swallowed into a startsWith match on "Thu") - see the
// "Fixed 2026-09-17" note above.
function parseDayRange(daysPart) {
  const days = new Set();
  for (const group of daysPart.split('&')) {
    for (const d of parseDayGroup(group.trim())) days.add(d);
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

// All 7 day indices - the default day set for a clause that names no days
// at all (see ALL_DAYS use in parseOpeningTimes below).
const ALL_DAYS = new Set(DAY_NAMES.map((_, i) => i));

// A day-range prefix is letters/whitespace/"&"/"-" only ("Mon", "Tue-Sat",
// "Mon-Thu & Sun"). A time token always has a digit in it, so this is
// enough to tell "Mon: 1pm to 5pm" (day prefix "Mon") apart from a bare
// "1pm to 5pm" or "7:30pm to 11:30pm" (no day prefix - the colon there
// belongs to the time itself, see below).
const DAY_PREFIX_RE = /^[a-z\s&-]+$/i;

// Returns an array of { days: Set<0-6>, windows: [{startMin, endMin}] } -
// one entry per comma- (or semicolon-) separated clause that parsed
// successfully. Clauses/windows that don't match the convention are
// dropped rather than causing the whole string to be treated as
// unparseable, since existing free-text entries may not follow it
// perfectly. Returns [] (not null) for a blank or entirely unparseable
// string - callers treat an empty array the same as "unknown", see
// isOpenNow below.
//
// A clause with no day range at all (e.g. just "1pm to 5pm") is assumed to
// mean every day (added 2026-09-20, once a real entry was typed that way
// and the omission needed a sensible default rather than being silently
// dropped like an unparseable clause). Detecting "no day given" can't just
// be "no colon in the clause": minutes are also allowed to use a colon
// ("7:30pm"), so a clause like "7:30pm to 11:30pm" (no day prefix, but a
// colon inside the time) must NOT be mistaken for a day/time split on that
// colon. So the text before the first colon (if there is one) only counts
// as a day prefix when it's letters/"&"/"-" only - see DAY_PREFIX_RE above
// - otherwise the whole clause is treated as the time part.
export function parseOpeningTimes(openingTimes) {
  if (!openingTimes) return [];
  const clauses = [];
  for (const rawClause of openingTimes.split(/[,;]/)) {
    const clause = rawClause.trim();
    if (!clause) continue;
    const colonIndex = clause.indexOf(':');
    const prefix = colonIndex === -1 ? null : clause.slice(0, colonIndex);
    const hasDayPrefix = prefix != null && DAY_PREFIX_RE.test(prefix);
    let days;
    let timesPart;
    if (hasDayPrefix) {
      days = parseDayRange(prefix);
      if (days.size === 0) continue;
      timesPart = clause.slice(colonIndex + 1);
    } else {
      days = ALL_DAYS;
      timesPart = clause;
    }
    const windows = timesPart
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
//
// Exported (2026-09-23, previously internal-only) so EntryDetail.jsx can
// work out which of getWeekSchedule's 7 rows is "today" - same zoned-now
// math isOpenNow already relies on below, just needed one level up too
// rather than duplicated.
export function getZonedNow(timezone) {
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
  // Only needed for a window that crosses midnight (see below) - the day
  // whose clause a wrapping window's spillover hours (after midnight,
  // before endMin) would belong to.
  const yesterday = (now.dayIndex + 6) % 7;
  return clauses.some((clause) =>
    clause.windows.some((w) => {
      if (w.endMin > w.startMin) {
        // Ordinary same-day window - unchanged from before 2026-09-17.
        return clause.days.has(now.dayIndex) && now.minutes >= w.startMin && now.minutes < w.endMin;
      }
      // Crosses midnight (endMin <= startMin, e.g. "11.30am to 2.30am") -
      // see the "Fixed 2026-09-17" file-level doc comment above. The
      // clause's day is when the window *opens*; it stays open into the
      // following calendar day until endMin. So "now" matches either the
      // tail of today's window (today is in clause.days, already past
      // startMin) or yesterday's spillover (yesterday is in clause.days,
      // still before endMin).
      return (
        (clause.days.has(now.dayIndex) && now.minutes >= w.startMin) ||
        (clause.days.has(yesterday) && now.minutes < w.endMin)
      );
    })
  );
}

// "8am" -> "8am", "12pm" -> "12pm", 1170 (7.30pm) -> "7:30pm" - the
// reverse of parseTimeToken above, for building display text rather than
// parsing input. Minutes come back with a colon regardless of whether the
// original text used a period or a colon, since this is generated output,
// not something anyone re-types - see getWeekSchedule below. hour==0
// displays as "12am" (midnight) and hour==12 as "12pm" (noon), the same
// 12-hour convention the app's opening-times text already uses throughout.
function formatTimeToken(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return minute === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
}

// Monday-first day order/labels for display (2026-09-23) - purely a
// presentation remap, not a change to DAY_NAMES' indices (0=Sun..6=Sat,
// matching JS's native Date/Intl weekday numbering, which getZonedNow
// above relies on). Monday-first because that's how Blake's own
// opening-times convention is always typed ("Mon: ... Tue: ...") and how
// EntryDetail.jsx's day-by-day breakdown lists the week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Expands parseOpeningTimes' clause list into one row per calendar day,
// Monday through Sunday - "Mon: 12pm to 3pm, 6pm to 9pm" / "Tue: Closed" /
// ... - for EntryDetail.jsx's day-by-day Hours breakdown (2026-09-23,
// replacing the old per-clause-not-per-day raw-text display; see the
// "Structured opening hours" item in claude/todo.md). A day with no
// clause covering it reads as Closed - deliberately not left blank or
// omitted, since "no data for this day" and "confirmed closed" would
// otherwise look identical to someone reading the list.
//
// Returns null (not an array of seven "Closed" rows) when
// parseOpeningTimes finds nothing at all to work with, so callers fall
// back to showing the raw openingTimes text instead of confidently
// claiming every day is closed for an entry whose hours just don't match
// the convention yet - same "don't claim structure you don't have"
// principle as isOpenNow returning null above.
export function getWeekSchedule(openingTimes) {
  const clauses = parseOpeningTimes(openingTimes);
  if (clauses.length === 0) return null;
  return WEEK_ORDER.map((dayIndex) => {
    const windows = clauses
      .filter((clause) => clause.days.has(dayIndex))
      .flatMap((clause) => clause.windows)
      .sort((a, b) => a.startMin - b.startMin);
    const text =
      windows.length === 0
        ? 'Closed'
        : windows.map((w) => `${formatTimeToken(w.startMin)} to ${formatTimeToken(w.endMin)}`).join(', ');
    return { dayIndex, dayLabel: DAY_LABELS[dayIndex], text };
  });
}
