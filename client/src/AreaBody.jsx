import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from './markdownComponents.jsx';
import { AREA_SECTIONS } from './areaSections.js';
import './ActivityTypeDetail.css';
import './NeighbourhoodDetail.css';

// The main write-up of an Area (2026-11-17): its description followed by the
// labelled sections (Don't miss, Eat & drink, ...). Shared by the expanded
// map panel (AreaSheet.jsx) and the standalone Area page
// (NeighbourhoodDetail.jsx) so the two can never drift apart. Name, summary
// and photo are left to each caller, since they sit differently in each.
function AreaBody({ area }) {
  return (
    <>
      {area.description && (
        <div className="activity-type-detail-markdown">
          <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
            {area.description}
          </ReactMarkdown>
        </div>
      )}

      {AREA_SECTIONS.filter(({ field }) => area[field]).map(({ field, label }) => (
        <section className="area-detail-section" key={field}>
          <h2 className="area-detail-section-label">{label}</h2>
          <div className="activity-type-detail-markdown area-detail-section-body">
            <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
              {area[field]}
            </ReactMarkdown>
          </div>
        </section>
      ))}
    </>
  );
}

export default AreaBody;
