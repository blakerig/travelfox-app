import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './EssentialsHolidaysRow.css';
import { useCity } from './city-context.js';
import { describeUpcoming } from './holidayDates.js';

// Preview row shown at the top of the Essentials category screen (see
// CategoryScreen.jsx), linking through to the full Public Holidays list -
// see claude/public-holidays-spec.md for the feature's full design.
//
// A separate component (not folded into CategoryScreen.jsx itself) since
// Public Holidays isn't Entry-backed like everything else on that screen -
// it needs its own fetch, its own loading/empty handling, and its own route
// (see App.jsx), so keeping it self-contained here is a smaller, more
// targeted change than threading holiday-specific logic through the shared
// list-rendering code every other category also relies on.
//
// Renders nothing (not a skeleton/placeholder) while loading, on a fetch
// error, or when the city's country has no `code` set yet (see Country.code
// in schema.prisma) - GET /api/cities/:cityId/holidays returns an empty list
// in that last case rather than an error, and an Essentials screen with no
// other content shouldn't show a row promising holiday info that isn't
// there yet. Same "don't guess, hide instead" principle as the home
// screen's icon-visibility rule.
function EssentialsHolidaysRow() {
  const { city } = useCity();
  const [holidays, setHolidays] = useState(null);

  useEffect(() => {
    if (!city) return;
    setHolidays(null);
    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${city.id}/holidays`)
      .then((res) => res.json())
      .then((data) => setHolidays(data.holidays ?? []))
      .catch((err) => {
        console.error('Failed to fetch public holidays:', err);
        setHolidays([]);
      });
  }, [city]);

  if (!holidays || holidays.length === 0) return null;

  const next = describeUpcoming(holidays)[0];
  if (!next) return null;

  return (
    <Link to="/category/essentials/holidays" className="holidays-row">
      <div className="holidays-row-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <line x1="3" y1="9.5" x2="21" y2="9.5" />
          <line x1="7.5" y1="3" x2="7.5" y2="6.4" />
          <line x1="16.5" y1="3" x2="16.5" y2="6.4" />
          <circle cx="12" cy="14.5" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className="holidays-row-text">
        <span className="holidays-row-title">Public Holidays</span>
        <span className="holidays-row-subtitle">
          Next: {next.holiday.localName} &middot; {next.label}
        </span>
      </div>
      <svg className="holidays-row-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none">
        <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export default EssentialsHolidaysRow;
