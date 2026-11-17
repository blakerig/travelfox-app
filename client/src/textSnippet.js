// Shared plain-text card/teaser snippet helper (2026-11-17, extracted from
// EntryCard.jsx so ActivityTypeDetail.jsx's own photo-overlay teaser - see
// that file - can reuse the exact same truncation/stripping rules instead
// of a second copy drifting out of sync).
//
// Strips common Markdown syntax for a plain-text preview. Entry/ActivityType
// description and summary fields are authored as Markdown (see project
// notes), but full formatted rendering (react-markdown) is reserved for an
// actual detail screen - a card or photo-overlay teaser just needs a clean
// plain-text preview.
export function stripMarkdown(text) {
  return text
    .replace(/[*_`]/g, '')
    .replace(/^-\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

export function snippet(text, max = 120) {
  if (!text) return '';
  const plain = stripMarkdown(text);
  return plain.length > max ? `${plain.slice(0, max).trim()}…` : plain;
}
