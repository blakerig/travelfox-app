// Builds a display URL from a stored Entry.photoUrl/City.photoUrl by
// inserting Cloudinary's URL-based transform syntax (see
// https://cloudinary.com/documentation). photoUrl is the plain secure_url
// the server's /api/upload endpoint returns and the respective model stores
// as-is (see server/index.js) - it already contains the account's cloud
// name, so no separate client-side config is needed.
//
// This is deliberately the ONLY place in the client that knows Cloudinary's
// URL syntax - see the photo-hosting item in claude/todo.md: if the hosting
// provider ever changes, this is the one file that needs to change, plus a
// one-off migration script for existing rows.
//
// f_auto/q_auto let Cloudinary pick the best format (WebP/AVIF) and quality
// per-browser automatically.
function buildCloudinaryUrl(photoUrl, { width, height }) {
  if (!photoUrl) return null;
  const transform = `w_${width},h_${height},c_fill,f_auto,q_auto`;
  return photoUrl.replace('/upload/', `/upload/${transform}/`);
}

// Entry.photoUrl (Eating Out / Sightseeing / Local Cuisine cards + entry
// detail). Defaults (1200x900 = 4:3, matching .entry-card-photo-img's
// aspect-ratio in EntryCard.css) target the high end of the "900-1300px on
// the long edge" guidance in claude/home-screen-spec.md for a crisp result
// at high-DPI.
export function getEntryPhotoUrl(photoUrl, { width = 1200, height = 900 } = {}) {
  return buildCloudinaryUrl(photoUrl, { width, height });
}

// City.photoUrl - the Home screen's full-width hero cover photo. Same
// Cloudinary-hosted pattern as Entry.photoUrl above, just a different crop:
// defaults match .home-hero's aspect-ratio (390/270, see Home.css) rather
// than Entry's 4:3 card ratio.
export function getCityPhotoUrl(photoUrl, { width = 1200, height = 831 } = {}) {
  return buildCloudinaryUrl(photoUrl, { width, height });
}
