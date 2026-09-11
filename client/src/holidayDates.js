// Date helpers shared by EssentialsHolidaysRow.jsx, PublicHolidays.jsx and
// HolidayDetail.jsx - see claude/public-holidays-spec.md. Kept separate from
// any one component since all three need the same "how many days until
// this date" / "is this a weekend" logic.
//
// Holiday dates come back from the server as plain "YYYY-MM-DD" strings
// (see GET /api/cities/:cityId/holidays) - parsed here by splitting on "-"
// rather than `new Date("YYYY-MM-DD")`, which JS treats as UTC midnight and
// can shift a day off in either direction depending on the viewer's own
// timezone offset. Building the Date from its parts instead makes it local
// midnight for whatever timezone the browser is in, which is what "is this
// today" / "how many days away" should be comparing against - the viewer's
// own calendar, not the destination city's (this app doesn't have a
// concept of "the viewer's day in Barcelona time" anywhere else either).
export function parseHolidayDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LABELS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Hardcoded English labels rather than Intl/locale-based formatting -
// consistent with the rest of this app, which isn't localised yet.
export function weekdayLabel(date) {
  return WEEKDAY_LABELS[date.getDay()];
}

export function monthLabel(date) {
  return MONTH_LABELS[date.getMonth()];
}

export function fullDateLabel(date) {
  return `${WEEKDAY_LABELS_FULL[date.getDay()]}, ${date.getDate()} ${MONTH_LABELS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

// Returns holidays from today onward (inclusive), sorted by date, each
// wrapped with the derived display bits every screen needs - "Today"/"in N
// days" label, whether it falls on a weekend, and the parsed Date. Holidays
// before today are dropped rather than shown - see PublicHolidays.jsx.
export function describeUpcoming(holidays) {
  const today = startOfToday();
  return holidays
    .map((holiday) => ({ holiday, date: parseHolidayDate(holiday.date) }))
    .filter(({ date }) => date >= today)
    .sort((a, b) => a.date - b.date)
    .map(({ holiday, date }) => {
      const daysAway = Math.round((date - today) / MS_PER_DAY);
      return {
        holiday,
        date,
        isWeekend: isWeekend(date),
        weekday: weekdayLabel(date),
        label: daysAway === 0 ? 'Today' : `in ${daysAway} day${daysAway === 1 ? '' : 's'}`,
      };
    });
}
