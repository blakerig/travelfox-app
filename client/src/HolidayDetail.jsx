import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import './HolidayDetail.css';
import { markdownComponents } from './markdownComponents.jsx';
import { useCity } from './city-context.js';
import { parseHolidayDate, fullDateLabel, isWeekend, monthLabel } from './holidayDates.js';

// Detail screen for one holiday, reached by tapping a row on
// PublicHolidays.jsx that has editorial content written for it (see
// HolidayInfo in schema.prisma) - see claude/public-holidays-spec.md.
//
// Re-fetches the same GET /api/cities/:cityId/holidays list used by
// PublicHolidays.jsx and finds the one matching :slug, rather than adding a
// separate single-holiday endpoint - the list is small (a dozen or so
// entries) and this keeps the server surface for this feature to one route.
// This also means the date shown here is always whichever year's occurrence
// the server currently has cached, even though HolidayInfo's own content
// (description/whatToExpect) is written once and doesn't change per year -
// see that model's comment in schema.prisma.
function HolidayDetail() {
  const { slug } = useParams();
  const { city } = useCity();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!city) return;
    setData(null);
    setNotFound(false);
    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${city.id}/holidays`)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => {
        console.error('Failed to fetch public holidays:', err);
        setNotFound(true);
      });
  }, [city]);

  const holiday = data?.holidays.find((h) => h.slug === slug) ?? null;

  useEffect(() => {
    if (data && !holiday) setNotFound(true);
  }, [data, holiday]);

  const date = holiday ? parseHolidayDate(holiday.date) : null;
  const isToday = date && date.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime();

  return (
    <div className="holiday-detail">
      <div className="holiday-detail-header">
        <Link to="/category/essentials/holidays" className="holiday-detail-back" aria-label="Back to Public Holidays">
          &larr;
        </Link>
        <div className="holiday-detail-heading">
          <span className="holiday-detail-name">{holiday?.localName ?? 'Public Holiday'}</span>
          <span className="holiday-detail-kind">Public Holiday</span>
        </div>
      </div>

      {notFound && <div className="holiday-detail-status">Couldn&apos;t find this holiday.</div>}
      {!notFound && !holiday && <div className="holiday-detail-status">Loading…</div>}

      {holiday && date && (
        <div className="holiday-detail-body">
          <div className="holiday-detail-summary">
            <div className={`holiday-detail-date${isToday ? ' is-today' : ''}`}>
              <span className="holiday-detail-day">{date.getDate()}</span>
              <span className="holiday-detail-month">{monthLabel(date)}</span>
            </div>
            <div className="holiday-detail-summary-text">
              <span className="holiday-detail-full-date">{fullDateLabel(date)}</span>
              <div className="holiday-detail-tags">
                <span className={`holiday-detail-tag${holiday.global ? '' : ' is-regional'}`}>
                  {holiday.global ? 'National' : data.subdivisionName ?? 'Regional'}
                </span>
                {isWeekend(date) && <span className="holiday-detail-tag holiday-detail-tag-outline">Weekend</span>}
                {isToday && <span className="holiday-detail-tag holiday-detail-tag-today">Today</span>}
              </div>
            </div>
          </div>

          <div className="holiday-detail-section-label">About this day</div>
          <div className="holiday-detail-markdown">
            <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
              {holiday.description}
            </ReactMarkdown>
          </div>

          {holiday.whatToExpect && (
            <>
              <div className="holiday-detail-section-label">What to expect</div>
              <p className="holiday-detail-what-to-expect">{holiday.whatToExpect}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default HolidayDetail;
