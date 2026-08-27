import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [cities, setCities] = useState([]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/cities`)
      .then((res) => res.json())
      .then((data) => setCities(data))
      .catch((err) => console.error('Failed to fetch cities:', err));
  }, []);

  return (
    <div>
      <h1>Travel App</h1>
      <h2>Cities</h2>
      <ul>
        {cities.map((city) => (
          <li key={city.id}>
            {city.name}, {city.country}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;