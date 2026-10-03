import { useEffect, useRef, useState } from 'react';
import './FilterSheet.css';

// Generic bottom sheet used by CategoryScreen's per-filter-dimension panels
// (2026-10-02) - replaces the old single "Filters" panel that stacked every
// dimension (cuisine, price, distance, hours) into one long always-open
// block once toggled, which Blake flagged as overwhelming and unclear how
// to dismiss. He pointed at the Michelin Guide app as the pattern he
// wanted instead: a horizontal row of filter-category pills, each opening
// a focused sheet for just that one dimension, dismissed by swiping it
// down. This component is the sheet half of that pattern -
// CategoryScreen.jsx owns the horizontal pill row and which dimension is
// "open" (openFilterSheet), and renders exactly one of these, swapping
// `title`/`children` based on which pill was tapped, rather than mounting
// a separate sheet per dimension.
//
// Deliberately generic/content-agnostic - it doesn't know anything about
// cuisine chips or radius options, just renders whatever children it's
// given inside a dismissable sheet. That keeps the actual filter chip
// markup living in CategoryScreen.jsx (reusing the exact same
// .category-screen-filter-chip styling the old inline panel used) rather
// than duplicating it here, and means this component could be reused for
// any other single-dimension picker this app ever wants a bottom sheet
// for.
//
// Dismiss has three equally-valid paths, since a swipe gesture alone can be
// easy to miss on a first visit, especially before anyone's told you it's
// there: tapping the dimmed backdrop, tapping the explicit "x" close
// button, or dragging the sheet down past a distance/velocity threshold
// (DISMISS_DISTANCE_PX / DISMISS_VELOCITY_PX_MS below) via the handle/
// header. All three call the same onClose - CategoryScreen.jsx doesn't
// need to know which one fired.
const DISMISS_DISTANCE_PX = 90;
const DISMISS_VELOCITY_PX_MS = 0.55;
// How long the exit transition takes, in ms - must match the CSS
// transition-duration in FilterSheet.css exactly, since the "fully closed,
// stop rendering" moment is timed off this constant rather than a
// transitionend listener (simpler and more reliable here than trying to
// distinguish the sheet's own transitionend from a child element's, since
// .filter-sheet-body's content could itself contain something transitioning).
const EXIT_DURATION_MS = 220;

function FilterSheet({ title, isOpen, onClose, onClear, clearLabel = 'Clear', children }) {
  // mounted: whether the sheet (and backdrop) are in the DOM at all.
  // entered: whether it's in its "open" resting position - toggling this
  // on a short delay after mount (see the rAF below) is what makes the
  // slide-up read as an actual transition rather than popping straight to
  // its open state.
  const [mounted, setMounted] = useState(isOpen);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef(null);
  const exitTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = null;
      }
      setMounted(true);
      setDragY(0);
      // Two rAFs rather than one - the first just gets the sheet painted in
      // its closed (translateY(100%)) position, the second then flips
      // `entered` so the browser has something to actually transition
      // *from*. A single rAF can occasionally land in the same paint pass
      // as the initial mount and skip straight to the open state with no
      // visible slide, depending on the browser.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
    } else if (mounted) {
      setEntered(false);
      exitTimeoutRef.current = setTimeout(() => {
        setMounted(false);
        exitTimeoutRef.current = null;
      }, EXIT_DURATION_MS);
    }
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
    // Deliberately only re-runs when isOpen changes, not on every
    // `mounted` change this same effect causes - re-running on `mounted`
    // too would immediately clear the exit timeout it had just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Standard bottom-sheet behavior: the page behind can't scroll while this
  // is open. Restored via the cleanup function whenever `mounted` goes
  // false (not just when `entered` does), so a rapid open-close-open
  // doesn't briefly unlock scrolling mid-transition.
  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted]);

  // Escape-to-close - cheap to add and standard dialog behavior, even
  // though touch (backdrop tap / swipe) is the primary path on the mobile
  // PWA this is actually used in.
  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, onClose]);

  // Drag handling lives on the handle/header area only (see
  // .filter-sheet-drag-area below), not the whole sheet - so if this ever
  // wraps content that itself needs to scroll internally, a finger drag
  // starting inside that content scrolls it rather than being eaten by the
  // sheet's own dismiss gesture.
  //
  // Fixed 2026-10-03: the Clear/Close buttons sit inside this same drag
  // area (they're part of the header), and setPointerCapture below was
  // unconditionally grabbing every pointerdown that started on them too -
  // that capture retargets the browser's synthetic click away from the
  // button, so neither button's onClick ever fired, even on a plain tap
  // with no actual drag. Blake caught this on the "x" close button
  // specifically ("clicking the X does nothing"); Clear had the exact same
  // bug, just not yet noticed. Fix: bail out before starting a drag (and
  // before capturing the pointer) whenever the press itself began on a
  // button - lets both buttons receive their normal click, while a press
  // anywhere else in the handle/header (the title text, the empty space)
  // still starts the swipe-to-dismiss drag as before.
  function handlePointerDown(e) {
    if (e.target.closest('button')) return;
    dragStateRef.current = {
      startY: e.clientY,
      lastY: e.clientY,
      startTime: performance.now(),
      lastTime: performance.now(),
    };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragStateRef.current) return;
    // Only follows downward drags (negative delta clamped to 0) - dragging
    // up has no effect rather than letting the sheet travel above its
    // resting position, since there's nothing further "open" to reveal.
    const delta = Math.max(0, e.clientY - dragStateRef.current.startY);
    setDragY(delta);
    dragStateRef.current.lastY = e.clientY;
    dragStateRef.current.lastTime = performance.now();
  }

  function handlePointerUp() {
    if (!dragStateRef.current) return;
    const { startY, startTime, lastY, lastTime } = dragStateRef.current;
    const distance = Math.max(0, lastY - startY);
    const elapsed = Math.max(1, lastTime - startTime);
    const velocity = distance / elapsed;
    dragStateRef.current = null;
    setDragging(false);
    setDragY(0);
    // Dismisses on either a long-enough drag or a fast-enough flick, so a
    // quick short flick still closes it even if it didn't travel past
    // DISMISS_DISTANCE_PX - matches how native bottom sheets feel, rather
    // than requiring a slow deliberate drag all the way down.
    if (distance > DISMISS_DISTANCE_PX || velocity > DISMISS_VELOCITY_PX_MS) {
      onClose();
    }
  }

  if (!mounted) return null;

  return (
    <div className={`filter-sheet-backdrop${entered ? ' is-visible' : ''}`} onClick={onClose}>
      <div
        className={`filter-sheet${entered ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
        style={dragging ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="filter-sheet-drag-area"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="filter-sheet-handle" aria-hidden="true" />
          <div className="filter-sheet-header">
            <span className="filter-sheet-title">{title}</span>
            <div className="filter-sheet-header-actions">
              {onClear && (
                <button type="button" className="filter-sheet-clear" onClick={onClear}>
                  {clearLabel}
                </button>
              )}
              <button
                type="button"
                className="filter-sheet-close"
                onClick={onClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
        <div className="filter-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export default FilterSheet;
