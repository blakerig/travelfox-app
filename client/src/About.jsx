import { Link } from 'react-router-dom';
import './About.css';
import BottomNav from './BottomNav.jsx';

// About page (2026-11-09) - replaces the "100% independent reviews" trust
// line that used to sit at the top of Home. Reached from the More tab.
// Copy is a first draft for Blake to edit. The "How we pay for it" section
// matches the sponsorship plan in claude/todo.md (sponsors can only buy a
// labelled slot, never the review itself) - keep the two in step if that
// plan changes.
const SECTIONS = [
  {
    title: 'Completely independent',
    body: 'Nobody pays to be included in TravelFox, and nobody pays for a better review. Every recommendation is our own honest opinion.',
  },
  {
    title: 'We go there ourselves',
    body: 'Every restaurant, sight, shop and activity in the app has been visited in person by our team. We don’t list places we haven’t been to.',
  },
  {
    title: 'We don’t list everything',
    body: 'TravelFox isn’t a directory. We only include places we think are genuinely worth your time, so if somewhere isn’t here, it may be deliberate.',
  },
  {
    title: 'How we pay for it',
    body: 'TravelFox is free to use. In future some content may be sponsored. If so, it will always be clearly labelled, and sponsors never get a say in what we write.',
  },
  {
    title: 'Who we are',
    body: 'TravelFox is made by City Trail Publishing, the team behind the City Trail guidebooks. We live in Barcelona, which is why it’s our first city.',
  },
];

function About() {
  return (
    <div className="about-screen">
      <div className="about-header">
        <Link to="/more" className="about-back" aria-label="Back to More">
          &larr;
        </Link>
        <h1 className="about-title">About TravelFox</h1>
      </div>
      <p className="about-intro">
        Honest, hand-picked recommendations from people who have actually been there.
      </p>
      <div className="about-sections">
        {SECTIONS.map((s) => (
          <section className="about-section" key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

export default About;
