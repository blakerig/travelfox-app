import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Home.css';
import { useCity } from './city-context.js';
import CityPicker from './CityPicker.jsx';
import heroPlaceholder from './assets/home-hero-placeholder.jpg';
import { getCityPhotoUrl } from './cloudinaryUrl.js';
import iconEssentials from './assets/icon-essentials.png';
import iconActivities from './assets/icon-activities.png';
import iconEatingOut from './assets/icon-eating-out.png';
import iconSightseeing from './assets/icon-sightseeing.png';
import iconLocalCuisine from './assets/icon-local-cuisine.png';
import iconNeighbourhoods from './assets/icon-neighbourhoods.png';

// Local display info for each category the home screen knows how to render.
// `to` overrides the default `/category/:slug` destination - Neighbourhoods
// isn't a CategoryScreen (Entry-card list) at all, it's the dedicated map
// screen (client/src/Neighbourhoods.jsx), added 2026-08-31 - see
// Neighbourhood in schema.prisma and the "Neighbourhoods" discussion in
// claude/home-screen-spec.md.
const CATEGORY_DISPLAY = [
  { slug: 'essentials', label: 'Essentials', icon: iconEssentials },
  { slug: 'activities', label: 'Activities', icon: iconActivities },
  { slug: 'eating-out', label: 'Eating Out', icon: iconEatingOut },
  { slug: 'sightseeing', label: 'Sightseeing', icon: iconSightseeing },
  { slug: 'local-cuisine', label: 'Local Cuisine', icon: iconLocalCuisine },
  { slug: 'neighbourhoods', label: 'Neighbourhoods', icon: iconNeighbourhoods, to: '/neighbourhoods' },
];

function Home() {
  const { city } = useCity();
  const location = useLocation();
  const [availableSlugs, setAvailableSlugs] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!city) return;
    fetch(`${import.meta.env.VITE_API_URL}/api/cities/${city.id}/home-categories`)
      .then((res) => res.json())
      .then((data) => setAvailableSlugs(new Set(data.map((c) => c.slug))))
      .catch((err) => console.error('Failed to fetch home categories:', err));
  }, [city]);

  const visibleCategories = availableSlugs
    ? CATEGORY_DISPLAY.filter((c) => availableSlugs.has(c.slug))
    : [];

  return (
    <div className="home">
      <div className="home-hero">
        <img
          // city.photoUrl is set by hand in Prisma Studio for now (see
          // City.photoUrl in schema.prisma) - falls back to the static
          // placeholder when unset, same pattern as EntryCard's photo.
          src={city?.photoUrl ? getCityPhotoUrl(city.photoUrl) : heroPlaceholder}
          alt=""
          className="home-hero-image"
        />
        <div className="home-hero-gradient" />
        {city && (
          <Link
            to={`/city/${city.id}/edit`}
            className="home-hero-edit"
            aria-label="Edit cover photo"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path
                d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
        <button
          type="button"
          className="home-hero-city"
          onClick={() => setPickerOpen(true)}
          disabled={!city}
        >
          {city ? city.name : ' '}
          {city && (
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" className="home-hero-city-chevron">
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <div className="home-search">
        {/* state.backgroundLocation is what tells App.jsx to render Search
            as an overlay on top of this screen instead of replacing it -
            see the comment there. */}
        <Link to="/search" state={{ backgroundLocation: location }} className="home-search-bar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <line x1="20" y1="20" x2="15.8" y2="15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>{city ? `Search ${city.name}` : 'Search'}</span>
        </Link>
      </div>

      <div className="home-categories">
        {visibleCategories.map((cat) => (
          <Link to={cat.to ?? `/category/${cat.slug}`} className="home-category" key={cat.slug}>
            <img src={cat.icon} alt="" className="home-category-icon" />
            <div className="home-category-label">{cat.label}</div>
          </Link>
        ))}
      </div>

      {pickerOpen && <CityPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

export default Home;
