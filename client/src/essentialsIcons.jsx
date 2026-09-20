// Curated icon set for Essentials entries (2026-09-19) - a small fixed
// vocabulary of inline SVG icons + accent colours, picked per entry via
// Entry.icon (a short key, e.g. "airport") rather than an uploaded image -
// see the "Essentials card redesign" note in claude/home-screen-spec.md.
// Deliberately code-defined rather than an uploadable asset like
// Entry.photoUrl: there's a small, known set of Essentials topics
// (airport, language, money, transport, apps, holidays), so a fixed
// picker keeps every card visually consistent without asking for
// per-entry icon-design work. Add a new option here to add a new icon -
// nothing else needs to change for it to show up in both EntryEditor's
// picker (EntryEditor.jsx) and EntryCard's 'reference' variant rendering
// (EntryCard.jsx).
//
// Icons are plain inline SVGs (Feather-style stroke icons, 24x24
// viewBox), matching the existing inline SVGs already used for UI chrome
// elsewhere in the app (Home.jsx's search/chevron/edit icons) rather than
// the separate imported-PNG convention used for the home screen's
// category icons - no image assets to source/design for this feature.
// Rendered at a fixed white stroke, sitting on top of each option's own
// colour circle (see ESSENTIALS_ICON_OPTIONS below).

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

// Hand-rolled from basic shapes rather than a remembered library path - a
// simple, unambiguous bus glyph (body + window line + two wheels).
function BusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <line x1="3" y1="10.5" x2="21" y2="10.5" />
      <circle cx="7.5" cy="18.5" r="1.5" fill="#fff" stroke="none" />
      <circle cx="16.5" cy="18.5" r="1.5" fill="#fff" stroke="none" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// Fallback for an entry with no icon set - including every existing
// Essentials entry from before this field existed, so the redesigned card
// still looks intentional for them rather than broken/blank. Uses the
// app's own accent green (matches --g-600 elsewhere) rather than a grey
// "unset" treatment, since a plain pin isn't wrong, just generic.
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export const ESSENTIALS_ICON_OPTIONS = [
  { key: 'airport', label: 'Airport / Arrivals', color: '#3fae74', Icon: PlaneIcon },
  { key: 'language', label: 'Language', color: '#f0ad2e', Icon: ChatIcon },
  { key: 'money', label: 'Money', color: '#8b5cf6', Icon: CardIcon },
  { key: 'transport', label: 'Public Transport', color: '#ef4444', Icon: BusIcon },
  { key: 'apps', label: 'Useful Apps', color: '#0f766e', Icon: PhoneIcon },
  { key: 'holidays', label: 'Public Holidays', color: '#e8536b', Icon: CalendarIcon },
];

const DEFAULT_ICON = { key: 'default', label: 'General', color: '#3a7d55', Icon: PinIcon };

const BY_KEY = new Map(ESSENTIALS_ICON_OPTIONS.map((opt) => [opt.key, opt]));

// Used by both EntryCard.jsx (render) and EntryEditor.jsx (picker hint
// text) - looks up an option by its stored key, falling back to the
// default pin for null/unrecognised values rather than throwing, since a
// stale/removed key should degrade gracefully, not break the card.
export function getEssentialsIcon(key) {
  return BY_KEY.get(key) ?? DEFAULT_ICON;
}
