import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './PublicHolidays.css';
import { useCity } from './city-context.js';
import { describeUpcoming, monthLabel } from './holidayDates.js';

// Full "Public Holidays" list, reached from EssentialsHolidaysRow.jsx on the
// Essentials category screen - see claude/public-holidays-spec.md. Shows
// every holiday from today onward for the current city's country (and
// region, where relevant - see subdivisionName below), soonest first. A
// holiday with editorial content written for it (see HolidayInfo in
// schema.prisma) is a link through to HolidayDetail.jsx; one without isn't -
// there's nothing to show on a detail screen for it yet.
function PublicHolidays() {
  const { city } = useCity();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!city) return;
    setData(null);
    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${city.id}/holidays`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => {
        console.error('Failed to fetch public holidays:', err);
        setData({ subdivisionName: null, holidays: [] });
      });
  }, [city]);

  const upcoming = data ? describeUpcoming(data.holidays) : null;

  return (
    <div className="holidays-screen">
      <div className="holidays-screen-header">
        <Link to="/category/essentials" className="holidays-screen-back" aria-label="Back to Essentials">
          &larr;
        </Link>
        <div className="holidays-screen-heading">
          <h1 className="holidays-screen-title">Public Holidays</h1>
          <span className="holidays-screen-subtitle">
            {city?.name}
            {new Date().getFullYear() ? ` · ${new Date().getFullYear()}` : ''}
          </span>
        </div>
      </div>

      {upcoming === null && (
        <div className="holidays-screen-status">
          <div className="holidays-screen-spinner" aria-hidden="true" />
          <p>Loading…</p>
        </div>
      )}

      {upcoming !== null && upcoming.length === 0 && (
        <div className="holidays-screen-status">Nothing coming up.</div>
      )}

      {upcoming !== null && upcoming.length > 0 && (
        <>
          <div className="holidays-screen-section-label">Upcoming</div>
          <div className="holidays-screen-list">
            {upcoming.map(({ holiday, date, label, isWeekend, weekday }) => {
              const row = (
                <>
                  <div className={`holidays-item-date${label === 'Today' ? ' is-today' : ''}`}>
                    <span className="holidays-item-day">{date.getDate()}</span>
                    <span className="holidays-item-month">{monthLabel(date)}</span>
                  </div>
                  <div className="holidays-item-text">
                    <span className="holidays-item-name">{holiday.localName}</span>
                    <div className="holidays-item-tags">
                      <span className={`holidays-tag${holiday.global ? '' : ' is-regional'}`}>
                        {holiday.global ? 'National' : data.subdivisionName ?? 'Regional'}
                      </span>
                      {isWeekend ? (
                        <span className="holidays-tag holidays-tag-outline">Weekend</span>
                      ) : (
                        <span className="holidays-item-weekday">{weekday}</span>
                      )}
                    </div>
                  </div>
                  <div className="holidays-item-when">
                    <span className={label === 'Today' ? 'is-today' : ''}>{label}</span>
                    {holiday.slug && (
                      <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </>
              );

              return holiday.slug ? (
                <Link
                  key={`${holiday.date}-${holiday.localName}`}
                  to={`/category/essentials/holidays/${holiday.slug}`}
                  className={`holidays-item${label === 'Today' ? ' is-today' : ''}`}
                >
                  {row}
                </Link>
              ) : (
                <div key={`${holiday.date}-${holiday.localName}`} className={`holidays-item${label === 'Today' ? ' is-today' : ''}`}>
                  {row}
                </div>
              );
            })}
          </div>
          <div className="holidays-screen-footer">Dates from Nager.Date &middot; refreshed automatically each year</div>
        </>
      )}
    </div>
  );
}

export default PublicHolidays;
