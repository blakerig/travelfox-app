import { Routes, Route, useLocation } from 'react-router-dom';
import { CityProvider } from './CityProvider.jsx';
import Home from './Home.jsx';
import CategoryScreen from './CategoryScreen.jsx';
import EntryDetail from './EntryDetail.jsx';
import EntryEditor from './EntryEditor.jsx';
import ActivityTypeDetail from './ActivityTypeDetail.jsx';
import CityEditor from './CityEditor.jsx';
import Search from './Search.jsx';
import Neighbourhoods from './Neighbourhoods.jsx';

function App() {
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
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  return (
    <CityProvider>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/city/:cityId/edit" element={<CityEditor />} />
        <Route path="/category/:slug" element={<CategoryScreen />} />
        <Route path="/neighbourhoods" element={<Neighbourhoods />} />
        <Route path="/category/:slug/type/:typeId" element={<ActivityTypeDetail />} />
        <Route path="/category/:slug/entry/:entryId" element={<EntryDetail />} />
        <Route path="/category/:slug/entry/:entryId/edit" element={<EntryEditor />} />
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
    </CityProvider>
  );
}

export default App;
