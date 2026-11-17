import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AreaBody from './AreaBody.jsx';
import { hasAreaBody } from './areaSections.js';
import { getEntryPhotoUrl } from './cloudinaryUrl.js';
import './AreaSheet.css';

// Drag-up panel for the selected Area on the Areas map (2026-11-17),
// replacing the earlier fixed bottom sheet + "Read more" link.
//
// Two resting positions:
//   - collapsed: only the top part shows (grabber, name, one-line summary)
//   - expanded:  the panel fills almost the whole map and the full write-up
//                (photo, description, Don't miss, ...) scrolls inside it
//
// Ways to move between them, so nobody depends on the drag alone:
//   - drag or flick the top part up/down (touch, or mouse on desktop)
//   - tap/click the top part, or focus the grabber button and press Enter
//   - when expanded and scrolled to the very top, dragging the content down
//     collapses it (the usual "pull down to dismiss" behaviour)
//   - Escape collapses it
//
// Hand-rolled with plain touch/pointer listeners rather than a gesture or
// bottom-sheet library, same as the rest of this app's UI. Touch uses
// touchmove with passive: false so the drag can stop the page from
// scrolling; native scrolling inside the expanded content is left alone
// unless you're at the top and pulling down.
//
// The panel is always full height and simply slid down with a transform when
// collapsed, so expanding never changes layout - just the transform.

const DRAG_START_PX = 6; // movement before a touch counts as a drag, not a tap
const FLICK_PX_PER_MS = 0.4; // release speed that snaps regardless of position

const STATUS_LABELS = { DRAFT: 'Draft', AWAITING_REVIEW: 'Awaiting Review' };

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function AreaSheet({ area, canEdit, expanded, onExpandedChange }) {
  const sheetRef = useRef(null);
  const handleRef = useRef(null);
  const bodyRef = useRef(null);

  const [sizes, setSizes] = useState({ sheet: 0, handle: 0 });
  // Live position while a finger/mouse is dragging; null when at rest.
  const [dragOffset, setDragOffset] = useState(null);

  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  // Latest values for the native listeners below, which are attached once.
  const latestRef = useRef({ expanded, collapsedOffset: 0, onExpandedChange });

  const collapsedOffset = Math.max(0, sizes.sheet - sizes.handle);
  const offset = dragOffset ?? (expanded ? 0 : collapsedOffset);

  useEffect(() => {
    latestRef.current = { expanded, collapsedOffset, onExpandedChange };
  });

  // Measure the panel and its top part, and keep measuring - the top part's
  // height changes with the summary's length and the screen width.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const handle = handleRef.current;
    if (!sheet || !handle) return;
    const measure = () => setSizes({ sheet: sheet.offsetHeight, handle: handle.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(handle);
    return () => observer.disconnect();
  }, []);

  // A different Area starts from the top of its write-up.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [area.id]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') latestRef.current.onExpandedChange(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  // Drag handling, as native listeners so touchmove can be non-passive.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    function start(y, target) {
      const { expanded: isExpanded, collapsedOffset: collapsed } = latestRef.current;
      gestureRef.current = {
        startY: y,
        startOffset: isExpanded ? 0 : collapsed,
        inHandle: handleRef.current?.contains(target) ?? false,
        mode: 'pending', // 'pending' | 'drag' | 'scroll'
        lastY: y,
        lastT: performance.now(),
        velocity: 0,
      };
    }

    // Returns true when this move is part of a panel drag (so the caller
    // should stop the browser from also scrolling).
    function move(y) {
      const g = gestureRef.current;
      if (!g) return false;
      const dy = y - g.startY;
      const { expanded: isExpanded, collapsedOffset: collapsed } = latestRef.current;

      if (g.mode === 'pending') {
        if (Math.abs(dy) < DRAG_START_PX) return false;
        const atTop = (bodyRef.current?.scrollTop ?? 0) <= 0;
        if (g.inHandle || !isExpanded || (atTop && dy > 0)) {
          g.mode = 'drag';
        } else {
          g.mode = 'scroll';
        }
      }
      if (g.mode !== 'drag') return false;

      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) g.velocity = (y - g.lastY) / dt;
      g.lastY = y;
      g.lastT = now;
      setDragOffset(clamp(g.startOffset + dy, 0, collapsed));
      return true;
    }

    function end() {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.mode !== 'drag') return;

      const { collapsedOffset: collapsed, onExpandedChange: change } = latestRef.current;
      const finalOffset = clamp(g.startOffset + (g.lastY - g.startY), 0, collapsed);
      let nextExpanded;
      if (g.velocity < -FLICK_PX_PER_MS) nextExpanded = true;
      else if (g.velocity > FLICK_PX_PER_MS) nextExpanded = false;
      else nextExpanded = finalOffset < collapsed / 2;

      // A drag that ends over the top part would otherwise also count as a
      // click on it and toggle the panel straight back.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      setDragOffset(null);
      change(nextExpanded);
    }

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      start(e.touches[0].clientY, e.target);
    }
    function onTouchMove(e) {
      if (e.touches.length !== 1) return;
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }

    // Mouse (desktop testing): drag only from the top part, so selecting
    // text in the write-up still works normally.
    function onPointerMove(e) {
      if (move(e.clientY)) e.preventDefault();
    }
    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      end();
    }
    function onPointerDown(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (!handleRef.current?.contains(e.target)) return;
      start(e.clientY, e.target);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
    sheet.addEventListener('pointerdown', onPointerDown);
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', end);
      sheet.removeEventListener('touchcancel', end);
      sheet.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  function handleTopClick() {
    if (suppressClickRef.current) return;
    onExpandedChange(!expanded);
  }

  const measured = sizes.sheet > 0;
  const className = [
    'area-sheet',
    expanded ? 'is-expanded' : '',
    dragOffset === null && measured ? 'is-animating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Areas written before the summary field existed have only a description;
  // show a clamped preview of it in the collapsed panel instead.
  const preview = area.summary || (!expanded ? area.description : null);
  const hasBody = hasAreaBody(area) || Boolean(area.photoUrl);

  return (
    <div
      ref={sheetRef}
      className={className}
      style={{
        transform: `translateY(${offset}px)`,
        visibility: measured ? 'visible' : 'hidden',
      }}
    >
      <div ref={handleRef} className="area-sheet-top" onClick={handleTopClick}>
        <button
          type="button"
          className="area-sheet-grabber"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${area.name}` : `Show more about ${area.name}`}
        />
        <div className="area-sheet-name">
          {area.name}
          {area.status && area.status !== 'PUBLISHED' && (
            <span className="area-sheet-draft">{STATUS_LABELS[area.status] ?? area.status}</span>
          )}
        </div>
        {preview && (
          <div className={area.summary ? 'area-sheet-summary' : 'area-sheet-summary is-clamped'}>
            {preview}
          </div>
        )}
      </div>

      <div
        ref={bodyRef}
        className="area-sheet-body"
        // Hidden from screen readers and keyboard focus while collapsed,
        // since it's slid off-screen then.
        aria-hidden={!expanded}
        inert={!expanded}
      >
        {area.photoUrl && (
          <img src={getEntryPhotoUrl(area.photoUrl)} alt="" className="area-sheet-photo" />
        )}
        <AreaBody area={area} />
        {!hasBody && <p className="area-sheet-empty">Nothing more written about this area yet.</p>}
        {canEdit && (
          <Link to={`/neighbourhoods/${area.id}/edit`} className="area-sheet-edit">
            Edit this area
          </Link>
        )}
      </div>
    </div>
  );
}

export default AreaSheet;
