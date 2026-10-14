import { Link } from 'react-router-dom';

// Shared react-markdown `components` override, used anywhere Entry/
// ActivityType/ShopType description gets rendered (EntryDetail's full view,
// EntryEditor's live preview, Local Cuisine's expand-in-place card, and a
// few other Markdown-rendering spots - see this file's importers) so they
// all behave the same way.
//
// Two kinds of link, two behaviours:
// - An internal link (href starting with "/", e.g.
//   "/category/local-cuisine/entry/42" - another entry's own page)
//   navigates within the app via React Router's Link - no new tab, no full
//   page reload, same as tapping any other in-app link. Added 2026-10-14 so
//   a description can reference another entry (e.g. mentioning Churros from
//   the Hot Chocolate entry) and have it actually go there - see
//   claude/home-screen-spec.md. The target entry's id has to be looked up
//   by hand right now (it's in that entry's own edit URL) - no
//   autocomplete/picker for this yet, and a renamed/deleted target entry
//   will quietly 404 rather than re-resolving - both acceptable at this
//   app's scale/single-curator model, same tradeoff already made elsewhere
//   (see claude/todo.md).
//
//   onClick stopPropagation matters specifically for Local Cuisine's
//   expand-in-place card (EntryCard.jsx), where the whole card has its own
//   onClick that toggles expanded/collapsed - without this, the click would
//   also bubble up and re-trigger that toggle. Harmless no-op everywhere
//   else this renders (EntryDetail, the editor preview, ...) since nothing
//   above it is listening for clicks there.
// - Anything else (an external http(s) URL, or a mailto:/tel: link) keeps
//   the original behaviour: opens in a new tab/window rather than
//   navigating away inside the app, so tapping a link to an external site
//   (Play Store, a tourism website) doesn't lose the user's place in
//   Travelfox. rel="noopener noreferrer" is the standard safety pairing for
//   target="_blank" (noopener stops the new page reaching back via
//   window.opener, noreferrer also withholds the referrer header).
export const markdownComponents = {
  a: ({ href, children, ...props }) => {
    if (href?.startsWith('/')) {
      return (
        <Link to={href} onClick={(e) => e.stopPropagation()} {...props}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};
