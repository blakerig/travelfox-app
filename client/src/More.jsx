import { Link } from 'react-router-dom';
import './More.css';
import BottomNav from './BottomNav.jsx';

// "More" tab (2026-11-09) - the bottom nav's third destination, holding
// app-level pages that aren't city content. Starts with just About; Contact,
// Privacy & terms and Advertise with us slot in here as extra rows once
// they exist - add an object to ITEMS and a route in App.jsx.
const ITEMS = [
  { to: '/about', label: 'About TravelFox', hint: 'Independent, selective, visited in person' },
];

function More() {
  return (
    <div className="more-screen">
      <div className="more-header">
        <h1>More</h1>
      </div>
      <div className="more-list">
        {ITEMS.map((item) => (
          <Link to={item.to} className="more-item" key={item.to}>
            <div className="more-item-text">
              <span className="more-item-label">{item.label}</span>
              {item.hint && <span className="more-item-hint">{item.hint}</span>}
            </div>
            <span className="more-item-chevron" aria-hidden="true">&rsaquo;</span>
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

export default More;
