import { Routes, Route } from 'react-router-dom';
import { CityProvider } from './CityProvider.jsx';
import Home from './Home.jsx';
import CategoryScreen from './CategoryScreen.jsx';
import EntryDetail from './EntryDetail.jsx';
import EntryEditor from './EntryEditor.jsx';
import ActivityTypeDetail from './ActivityTypeDetail.jsx';

function App() {
  return (
    <CityProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/category/:slug" element={<CategoryScreen />} />
        <Route path="/category/:slug/type/:typeId" element={<ActivityTypeDetail />} />
        <Route path="/category/:slug/entry/:entryId" element={<EntryDetail />} />
        <Route path="/category/:slug/entry/:entryId/edit" element={<EntryEditor />} />
      </Routes>
    </CityProvider>
  );
}

export default App;
