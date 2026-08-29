// Shared react-markdown `components` override, used anywhere Entry.description
// gets rendered (EntryDetail's full view, EntryEditor's live preview) so both
// behave the same way.
//
// Links open in a new tab/window rather than navigating away inside the app -
// tapping a link to an external site (Play Store, a tourism website, etc.)
// shouldn't lose the user's place in Travelfox. rel="noopener noreferrer" is
// the standard safety pairing for target="_blank" (noopener stops the new
// page from being able to reach back via window.opener, noreferrer also
// withholds the referrer header).
export const markdownComponents = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};
