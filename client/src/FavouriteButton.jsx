import { useFavourites } from './favourites-context.js';
import './FavouriteButton.css';

// Star/heart toggle rendered on any Entry-backed card (EntryCard.jsx's
// 'photo'/'venue'/'reference' variants - not 'group', which renders an
// ActivityType/ShopType, not an Entry itself, so there's nothing here to
// favourite) and on the entry-detail screen (EntryDetail.jsx). `className`
// lets each call site position it via CSS without this component needing
// to know which variant/screen it's rendered inside - see
// EntryCard.css/EntryDetail.css for the positioning rules per host.
function FavouriteButton({ entryId, className = '' }) {
  const { favouriteIds, toggleFavourite } = useFavourites();
  const isFavourited = favouriteIds.has(entryId);

  return (
    <button
      type="button"
      className={`favourite-button${isFavourited ? ' is-favourited' : ''}${className ? ` ${className}` : ''}`}
      aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={isFavourited}
      onClick={(e) => {
        // Cards are usually wrapped in a <Link> to the entry-detail screen
        // (CategoryScreen.jsx, Search.jsx), and an expandable 'photo' card
        // (Local Cuisine) has its own click-to-expand handler
        // (EntryCard.jsx) - stop the tap from reaching either, same
        // stopPropagation pattern EntryCard.jsx already uses for its
        // tap-to-call phone chip.
        e.preventDefault();
        e.stopPropagation();
        toggleFavourite(entryId);
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-10-9.3C.5 8 1.8 4.5 5 3.4c2-.7 4.2 0 5.6 1.8l1.4 1.7 1.4-1.7c1.4-1.8 3.6-2.5 5.6-1.8 3.2 1.1 4.5 4.6 3 7.8-2.5 4.7-10 9.3-10 9.3Z"
          fill={isFavourited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default FavouriteButton;
