import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthProvider.jsx';
import { CityProvider } from './CityProvider.jsx';
import { useCity } from './city-context.js';
import { CityDataProvider } from './CityDataProvider.jsx';
import LoadingScreen from './LoadingScreen.jsx';
import Home from './Home.jsx';
import CategoryScreen from './CategoryScreen.jsx';
import EntryDetail from './EntryDetail.jsx';
import EntryEditor from './EntryEditor.jsx';
import ActivityTypeDetail from './ActivityTypeDetail.jsx';
import ActivityTypeEditor from './ActivityTypeEditor.jsx';
import ShopTypeDetail from './ShopTypeDetail.jsx';
import ShopTypeEditor from './ShopTypeEditor.jsx';
import CityEditor from './CityEditor.jsx';
import Search from './Search.jsx';
import Neighbourhoods from './Neighbourhoods.jsx';
import PublicHolidays from './PublicHolidays.jsx';
import HolidayDetail from './HolidayDetail.jsx';
import AdminLogin from './AdminLogin.jsx';
import AdminUsers from './AdminUsers.jsx';

function App() {
  return (
    <AuthProvider>
      <CityProvider>
        <CityDataProvider>
          <AppRoutes />
        </CityDataProvider>
      </CityProvider>
    </AuthProvider>
  );
}

// Split out from App so it can read CityProvider's context (a component
// can't consume a context it renders itself as a JSX child) - needed for
// `loading` below, added 2026-09-02 so the very first screen a visitor
// sees isn't a blank Home shell while the initial /api/cities fetch (and,
// on Render's free tier, a possible cold-start wake-up) is still in
// flight. See claude/todo.md.
function AppRoutes() {
  const { loading } = useCity();
  const location = useLocation();

  // Search renders as an overlay on top of whichever screen was showing
  // when it was opened, rather than replacing it outright (2026-08-31,
  // "modal route over a background location" - a standard React Router
  // pattern for exactly this). Reasoning: a plain route swap unmounts Home
  // completely - its icon grid, city name, edit button all vanish the
  // instant you tap the search bar - and no amount of animating Search's
  // own entrance can hide that, since it's Home disappearing that reads as
  // "a different page," not anything about how Search itself appears. This
  // way Home genuinely never unmounts while searching.
  //
  // `backgroundLocation` is only present when we navigated here via Home's
  // search Link, which sets it explicitly (see Home.jsx) - a direct visit
  // to /search (a bookmark, a hard refresh) has no prior screen to render
  // underneath, so `location.state` is empty, `backgroundLocation` is
  // undefined, and things fall through to the plain <Route path="/search">
  // below instead. Search.jsx renders fine as a standalone page in that
  // case too (see its own comment) - it just won't have Home's hero
  // showing through behind it.
  const backgroundLocation = location.state?.backgroundLocation;

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/city/:cityId/edit" element={<CityEditor />} />
        <Route path="/category/:slug" element={<CategoryScreen />} />
        {/* Fixed to Essentials, not a generic /category/:slug/holidays route -
            same reasoning as /neighbourhoods below being its own top-level
            route rather than parameterized: this is a one-off feature living
            inside a specific category, not a mechanism every category can
            opt into. See claude/public-holidays-spec.md. Placed above the
            :slug/entry/:entryId routes below since "holidays" is a distinct
            literal path segment, not another entryId - no route-matching
            ambiguity, ordered here just to keep Essentials-specific routes
            together. */}
        <Route path="/category/essentials/holidays" element={<PublicHolidays />} />
        <Route path="/category/essentials/holidays/:slug" element={<HolidayDetail />} />
        <Route path="/neighbourhoods" element={<Neighbourhoods />} />
        {/* Shopping's type detail/edit screens (2026-09-15, see ShopType in
            schema.prisma) get their own literal-slug routes rather than
            sharing the generic :slug ones below with Activities - both
            ShopTypeDetail.jsx/ShopTypeEditor.jsx are near-identical to
            their ActivityType counterparts but deliberately separate files
            (no Group field/relation to thread through a shared component -
            see ShopTypeDetail.jsx's file comment), so the routing has to
            pick which component per category too. A literal "shopping"
            segment here outranks the dynamic :slug below regardless of
            declaration order (React Router scores a static path segment
            higher than a param at the same position), same as
            "/category/essentials/holidays" above already relies on for
            "holidays" vs. :entryId - placed together with the Activities
            routes below just for readability. */}
        <Route path="/category/shopping/type/:typeId" element={<ShopTypeDetail />} />
        <Route path="/category/shopping/type/:typeId/edit" element={<ShopTypeEditor />} />
        <Route path="/category/:slug/type/:typeId" element={<ActivityTypeDetail />} />
        {/* Create/edit an ActivityType itself (2026-09-14, see
            ActivityTypeEditor.jsx) - distinct from the entry-edit routes
            below, which are for a *provider* within a type. One route only
            (2026-09-15 fix) - :typeId captures "new" as a plain string
            value just like the entry-edit route below already does for
            entryId, rather than a separate literal "/type/new/edit" route.
            That second route existed briefly and was the actual bug: a
            literal "new" segment isn't the same as :typeId, so
            useParams().typeId came back undefined on it, isCreate (typeId
            === 'new') was always false, and Save PATCHed
            /api/activity-types/undefined instead of creating anything. */}
        <Route path="/category/:slug/type/:typeId/edit" element={<ActivityTypeEditor />} />
        <Route path="/category/:slug/entry/:entryId" element={<EntryDetail />} />
        <Route path="/category/:slug/entry/:entryId/edit" element={<EntryEditor />} />
        {/* Team login - deliberately not linked from anywhere in the
            public nav, see claude/todo.md's "Login entry point" discussion. */}
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Routes>

      {/* Rendered a second time, as a sibling, only when there's a
          background screen to layer over - see the comment above. This is
          what actually produces the overlay: the main <Routes> above is
          showing `backgroundLocation` (Home), and this one separately
          mounts Search on top of it. */}
      {backgroundLocation && (
        <Routes>
          <Route path="/search" element={<Search />} />
        </Routes>
      )}
    </>
  );
}

export default App;
