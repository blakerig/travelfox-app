// Formats Entry.phone for consistent display and for the tel: links
// EntryCard.jsx/EntryDetail.jsx dial out to, and fills in the country's
// dial code when the person who entered the number left it out.
//
// Entry.phone is free text (see the comment on it in schema.prisma) - typed
// however the person adding the entry happened to type it: with or without
// spaces, dashes, a leading "+", a leading trunk "0", or a country code at
// all. Nothing here rewrites what's stored; this only normalizes how it's
// shown and what's actually dialled.
//
// Country-code rule (raised by Blake 2026-09-14): if the stored number
// already starts with "+", it's treated as already carrying its own
// country code and is never touched - a provider can genuinely be based in
// a different country than the city it's listed under (a UK-run business
// with a +44 number, listed on a Spain city). Only when there's no leading
// "+" is a dial code added, and it comes from that city's Country.code
// (ISO 3166-1 alpha-2, e.g. "ES") via DIAL_CODES below - never guessed from
// the phone number's shape.

// ISO 3166-1 alpha-2 -> international calling code. Only needs to cover
// Country.code values that actually exist in the database - currently
// France/Spain/Netherlands (see claude/public-holidays-spec.md's backfill)
// - plus nearby countries likely to be added next. Extend this as new
// countries come on board (see claude/todo.md); a code missing here just
// means a number without a leading "+" is shown/dialled as typed, with no
// dial code guessed.
const DIAL_CODES = {
  ES: '34', // Spain
  FR: '33', // France
  NL: '31', // Netherlands
  PT: '351', // Portugal
  IT: '39', // Italy
  DE: '49', // Germany
  BE: '32', // Belgium
  GB: '44', // United Kingdom
  IE: '353', // Ireland
  CH: '41', // Switzerland
  AT: '43', // Austria
  LU: '352', // Luxembourg
  US: '1', // United States/Canada (NANP) - never used to add a dial code
  // (no city's Country.code is "US"), kept only so a provider's own "+1..."
  // number is recognised correctly by splitCallingCode below instead of
  // falling through to the 2-digit guess.
};

// Every calling code this file knows about, longest first, so a 3-digit
// code (e.g. Ireland's "353") is matched before a 2-digit code that happens
// to be one of its prefixes. Used only to work out where a country code
// ends inside a number that already arrived with its own "+" (see
// splitCallingCode below) - we don't know which country typed those, so we
// recognise the code rather than assuming a fixed digit count.
const KNOWN_CALLING_CODES = [...new Set(Object.values(DIAL_CODES))].sort(
  (a, b) => b.length - a.length
);

// Strips everything but a leading "+" and digits, so however the number
// was actually typed (spaces, dots, dashes, parentheses) is tolerated.
function toRawDigits(phone) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

// Groups a run of digits into space-separated chunks of 3, left to right,
// folding a lone trailing digit into the previous chunk instead of leaving
// it stranded on its own (e.g. "1234567" -> "123 4567", not "123 456 7").
// Not locale-perfect grouping for every country - just a single consistent
// convention applied everywhere, which is what was actually asked for.
function groupDigits(digits) {
  if (digits.length <= 4) return digits;
  const groups = [];
  let i = 0;
  while (digits.length - i > 4) {
    groups.push(digits.slice(i, i + 3));
    i += 3;
  }
  groups.push(digits.slice(i));
  return groups.join(' ');
}

// Finds where a known calling code ends inside a digit string that already
// had its own "+" (so we don't know, and don't ask the caller, which
// country it belongs to). Falls back to a 2-digit guess - right far more
// often than wrong, since most calling codes are 1-2 digits - if nothing in
// DIAL_CODES matches; this only affects where the display groups a space,
// never the actual digits dialled.
function splitCallingCode(digits) {
  const known = KNOWN_CALLING_CODES.find((code) => digits.startsWith(code));
  const callingCode = known ?? digits.slice(0, 2);
  return { callingCode, rest: digits.slice(callingCode.length) };
}

// Returns { display, href } for a phone number, or null if there's nothing
// to show - so callers can write `formatPhoneNumber(entry.phone, code) &&`
// the same way they'd have checked `entry.phone &&` before.
//
// display: consistently spaced, always includes a country code when one is
// known ("+34 912 345 678"). href: a matching `tel:` URL with no spaces, the
// most broadly compatible form for triggering a call.
export function formatPhoneNumber(phone, countryCode) {
  if (!phone) return null;
  const raw = toRawDigits(phone);
  if (!raw) return null;

  let full;
  if (raw.startsWith('+')) {
    // Already carries its own country code - left exactly as entered,
    // per the rule above.
    full = raw;
  } else {
    const dialCode = countryCode && DIAL_CODES[countryCode.toUpperCase()];
    // Drop a single leading trunk "0" before attaching the dial code
    // (France/Netherlands' "0" prefix, dropped in international form -
    // e.g. "01 23 45 67 89" -> "+33 1 23 45 67 89"; Spain has no such
    // prefix, so this is a no-op there). Italy is the well-known exception
    // that keeps its leading 0 - not a concern for the countries currently
    // seeded, but worth knowing if Italy is ever added.
    const national = dialCode ? raw.replace(/^0/, '') : raw;
    full = dialCode ? `+${dialCode}${national}` : national;
  }

  if (!full.startsWith('+')) {
    // No country code available (Country.code not set for this city yet -
    // see schema.prisma) and none was entered - show/dial exactly what was
    // typed rather than guessing.
    return { display: full, href: `tel:${full}` };
  }

  const { callingCode, rest } = splitCallingCode(full.slice(1));
  const display = rest ? `+${callingCode} ${groupDigits(rest)}` : `+${callingCode}`;
  return { display, href: `tel:+${callingCode}${rest}` };
}
