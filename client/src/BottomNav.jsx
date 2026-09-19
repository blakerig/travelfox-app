import { NavLink } from 'react-router-dom';
import './BottomNav.css';

// Persistent bottom tab bar (added 2026-09-18 alongside Favourites) - the
// app's first piece of persistent navigation chrome. Every screen before
// this was reached by tapping into it and reading/exiting back out (Home's
// icon grid, Search's overlay, a category's own back arrow); there was no
// always-present nav element anywhere. Favourites is the first destination
// that genuinely needs one: it's not "inside" any single city or category
// the way everything else is (see the "Favourites" placement discussion in
// claude/home-screen-spec.md, which explicitly deferred this until there
// was an actual home for it), so it needs its own persistent, always-
// reachable entry point rather than living in Home's city-content icon
// grid alongside Eating Out/Activities/etc.
//
// Deliberately rendered only on the two top-level destination screens
// (Home.jsx, Favourites.jsx), not on every drill-down screen (a category
// list, an entry-detail page, an editor) - same reasoning a typical mobile
// app's tab bar only lives on its top-level tabs, not stacked on top of
// every pushed screen. Each screen renders <BottomNav /> itself and adds
// matching bottom padding so the fixed bar never covers its own content -
// see the padding-bottom rules in Home.css/Favourites.css.
function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav-item${isActive ? ' is-active' : ''}`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
          <path
            d="M4 11.5 12 4l8 7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 10v9a1 1 0 0 0 1 1h3v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3a1 1 0 0 0 1-1v-9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Home</span>
      </NavLink>
      <NavLink
        to="/favourites"
        className={({ isActive }) => `bottom-nav-item${isActive ? ' is-active' : ''}`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
          <path
            d="M12 20.5s-7.5-4.6-10-9.3C.5 8 1.8 4.5 5 3.4c2-.7 4.2 0 5.6 1.8l1.4 1.7 1.4-1.7c1.4-1.8 3.6-2.5 5.6-1.8 3.2 1.1 4.5 4.6 3 7.8-2.5 4.7-10 9.3-10 9.3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span>Favourites</span>
      </NavLink>
    </nav>
  );
}

export default BottomNav;
