// Builds a display URL from a stored Entry.photoUrl by inserting Cloudinary's
// URL-based transform syntax (see https://cloudinary.com/documentation).
// photoUrl is the plain secure_url the server's /api/upload endpoint returns
// and Entry.photoUrl stores as-is (see server/index.js) - it already
// contains the account's cloud name, so no separate client-side config is
// needed.
//
// This is deliberately the ONLY place in the client that knows Cloudinary's
// URL syntax - see the photo-hosting item in claude/todo.md: if the hosting
// provider ever changes, this is the one file that needs to change, plus a
// one-off migration script for existing rows.
//
// Defaults (1200x900 = 4:3, matching .entry-card-photo-img's aspect-ratio in
// EntryCard.css) target the high end of the "900-1300px on the long edge"
// guidance in claude/home-screen-spec.md for a crisp result at high-DPI.
// f_auto/q_auto let Cloudinary pick the best format (WebP/AVIF) and quality
// per-browser automatically.
export function getEntryPhotoUrl(photoUrl, { width = 1200, height = 900 } = {}) {
  if (!photoUrl) return null;
  const transform = `w_${width},h_${height},c_fill,f_auto,q_auto`;
  return photoUrl.replace('/upload/', `/upload/${transform}/`);
}
