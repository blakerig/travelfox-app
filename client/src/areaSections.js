// The short labelled sections shown under an Area's main paragraph
// (2026-11-17), in display order - shared by NeighbourhoodDetail.jsx (which
// renders them) and NeighbourhoodEditor.jsx (which edits them), so adding or
// renaming a section only happens here. Each maps to an optional text column
// on Neighbourhood in schema.prisma and is rendered as Markdown, so a list
// can be written either as one comma-separated line or as bullets.
export const AREA_SECTIONS = [
  {
    field: 'highlights',
    label: "Don't miss",
    hint: 'The must-see sights, e.g. "Sagrada Família, Casa Batlló, La Pedrera".',
  },
  {
    field: 'eatDrink',
    label: 'Eat & drink',
    hint: 'What to eat or drink here and where to look for it.',
  },
  {
    field: 'gettingThere',
    label: 'Getting there',
    hint: 'Only where it isn’t obvious - e.g. the cable car or funicular for Montjuïc.',
  },
  {
    field: 'bestFor',
    label: 'Best for',
    hint: 'Who will like this area, e.g. "first-time visitors, history lovers".',
  },
  {
    field: 'headsUp',
    label: 'Heads-up',
    hint: 'Pickpockets, crowds, tourist traps, steep streets - said the way a travel app would say it.',
  },
];

// True when an Area has any write-up beyond its name/summary - used to decide
// whether there's anything to expand into or show an "empty" message.
export function hasAreaBody(area) {
  return Boolean(area.description) || AREA_SECTIONS.some(({ field }) => area[field]);
}
