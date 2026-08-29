import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import { useCity } from './city-context.js';
import heroPlaceholder from './assets/home-hero-placeholder.jpg';
import iconEssentials from './assets/icon-essentials.png';
import iconActivities from './assets/icon-activities.png';
import iconEatingOut from './assets/icon-eating-out.png';
import iconSightseeing from './assets/icon-sightseeing.png';

// Local display info for each category the home screen knows how to render.
// Food & Drink has no icon asset yet - once one exists, add it here and it
// will start showing up automatically as soon as a city has content in it.
const CATEGORY_DISPLAY = [
  { slug: 'essentials', label: 'Essentials', icon: iconEssentials },
  { slug: 'activities', label: 'Activities', icon: iconActivities },
  { slug: 'eating-out', label: 'Eating Out', icon: iconEatingOut },
  { slug: 'sightseeing', label: 'Sightseeing', icon: iconSightseeing },
];

function Home() {
  const { city } = useCity();
  const [availableSlugs, setAvailableSlugs] = useState(null);

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
        <img src={heroPlaceholder} alt="" className="home-hero-image" />
        <div className="home-hero-gradient" />
        <div className="home-hero-city">{city ? city.name : ' '}</div>
      </div>

      <div className="home-search">
        <div className="home-search-bar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <line x1="20" y1="20" x2="15.8" y2="15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>{city ? `Search ${city.name}` : 'Search'}</span>
        </div>
      </div>

      <div className="home-categories">
        {visibleCategories.map((cat) => (
          <Link to={`/category/${cat.slug}`} className="home-category" key={cat.slug}>
            <img src={cat.icon} alt="" className="home-category-icon" />
            <div className="home-category-label">{cat.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;
