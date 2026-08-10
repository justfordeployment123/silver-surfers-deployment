import { useEffect, useRef, useState } from 'react';

// Criteria counts are pre-computed from the backend's WCAG criteria registry
// (src/features/audits/wcag-mapping.ts) applying the same cumulative-level /
// version-inclusion rules the 2.2.7.2 backend filter will use: a level
// includes all criteria at or below it (AA includes A), a version track
// includes all criteria at or below it (2.2 includes 2.1 and 2.0), and 4.1.1
// Parsing is excluded once WCAG 2.2 is selected (it was removed in 2.2).
// "Combined" is unfiltered — every criterion in the registry, unchanged from
// today's default behaviour.
export const WCAG_STANDARD_OPTIONS = [
  {
    id: 'wcag21-a',
    wcagStandard: 'wcag21',
    conformanceLevel: 'A',
    label: 'WCAG 2.1 Level A',
    description: 'The minimum legally-recognized baseline. Covers only the most fundamental barriers.',
    criteriaCount: 30,
  },
  {
    id: 'wcag21-aa',
    wcagStandard: 'wcag21',
    conformanceLevel: 'AA',
    label: 'WCAG 2.1 Level AA',
    description: 'The most widely-referenced compliance target for ADA and Section 508 audits.',
    criteriaCount: 50,
    recommended: true,
  },
  {
    id: 'wcag21-aaa',
    wcagStandard: 'wcag21',
    conformanceLevel: 'AAA',
    label: 'WCAG 2.1 Level AAA',
    description: 'The strictest 2.1 tier. Rarely required site-wide, typically used for specialised content.',
    criteriaCount: 51,
  },
  {
    id: 'wcag22-a',
    wcagStandard: 'wcag22',
    conformanceLevel: 'A',
    label: 'WCAG 2.2 Level A',
    description: 'Adds newer criteria like Consistent Help. Minimum baseline under the current standard.',
    criteriaCount: 31,
  },
  {
    id: 'wcag22-aa',
    wcagStandard: 'wcag22',
    conformanceLevel: 'AA',
    label: 'WCAG 2.2 Level AA',
    description: 'The current legal benchmark for ADA compliance. Includes Focus Not Obscured, Target Size, and Dragging Movements.',
    criteriaCount: 55,
  },
  {
    id: 'wcag22-aaa',
    wcagStandard: 'wcag22',
    conformanceLevel: 'AAA',
    label: 'WCAG 2.2 Level AAA',
    description: 'The strictest current tier. Typically only required for government or highly-regulated sites.',
    criteriaCount: 56,
  },
  {
    id: 'combined',
    wcagStandard: 'combined',
    conformanceLevel: 'AA',
    label: 'Full Combined (2.1 + 2.2 A & AA)',
    description: 'Evaluates against both standards at once for the broadest possible coverage. Current default.',
    criteriaCount: 57,
  },
];

const STYLES = `
.wss-field { position: relative; }
.wss-trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 14px; border-radius: var(--r); font-size: 16px; font-family: var(--ff);
  cursor: pointer; text-align: left; transition: border-color .15s, box-shadow .15s;
}
.wss-trigger--themed {
  background: var(--surface); color: var(--ink); border: 1.5px solid var(--sandd);
}
.wss-trigger--themed:hover { border-color: var(--t2); }
.wss-trigger--themed.open { border-color: var(--t4); box-shadow: 0 0 0 3px rgba(29,158,117,0.15); }
.wss-trigger--glass-dark {
  /* Fixed light background regardless of site theme (matches .home-input),
     so the label text must stay a fixed dark color too — var(--ink) flips
     to near-white in dark theme and would vanish against this surface. */
  background: rgba(255,255,255,0.92); color: #1A1A18; border: 1.5px solid transparent;
}
.wss-trigger--glass-dark .wss-trigger-chevron { color: rgba(26,26,24,0.55); }
.wss-trigger--glass-dark.open { border-color: var(--t4); box-shadow: 0 0 0 3px rgba(29,158,117,0.15); }
.wss-trigger-label { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.wss-trigger-title { font-weight: 600; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wss-trigger-chevron { flex-shrink: 0; color: var(--ink3); transition: transform .15s; }
.wss-trigger-chevron.open { transform: rotate(180deg); }

.wss-panel {
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 40;
  background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--rl);
  box-shadow: 0 8px 32px rgba(8,80,65,0.16); overflow: hidden; max-height: 380px; overflow-y: auto;
  animation: wss-pop .12s ease-out;
}
@keyframes wss-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.wss-option {
  width: 100%; text-align: left; padding: 12px 16px; border: none; background: none; cursor: pointer;
  display: block; border-bottom: 1px solid var(--sandd);
}
.wss-option:last-child { border-bottom: none; }
.wss-option:hover, .wss-option:focus-visible { background: var(--t05, var(--t1)); outline: none; }
.wss-option.selected { background: var(--t05, var(--t1)); }
.wss-option-head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.wss-option-title { font-weight: 700; font-size: 16px; color: var(--ink); }
.wss-option-badge {
  font-size: 16px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 7px; border-radius: 9999px; background: var(--t6); color: #fff;
}
.wss-option-check { margin-left: auto; color: var(--t4); flex-shrink: 0; }
.wss-option-desc { font-size: 16px; color: var(--ink3); line-height: 1.4; }
.wss-option-count { font-size: 16px; color: var(--ink6); margin-top: 4px; font-weight: 600; }

.wss-chip {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 12px;
  border-radius: 9999px; font-size: 16px; font-weight: 700; background: var(--t1); color: var(--t9);
}
.wss-chip--glass-dark { background: rgba(29,158,117,0.22); color: #eafff5; }
`;

/**
 * WCAG standard / conformance-level selector (2.2.7.1) — a custom listbox
 * dropdown (not a native <select>) so each option can show an inline
 * explanation and a live "N criteria will be evaluated" summary chip.
 *
 * variant="themed" (default) follows the site's normal light/dark token
 * swap (var(--surface)/var(--ink)) — use on any regular themed surface
 * (Checkout, MonitoringJobModal). variant="glass-dark" matches Home.js's
 * permanently-dark hero card, which uses a fixed near-white input style
 * regardless of site theme (matching .home-input) rather than the
 * theme-toggling tokens.
 */
const WcagStandardSelect = ({
  wcagStandard = 'combined',
  conformanceLevel = 'AA',
  onChange,
  variant = 'themed',
  label = 'WCAG Standard',
  showChip = true,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = WCAG_STANDARD_OPTIONS.find(
    (o) => o.wcagStandard === wcagStandard && (o.wcagStandard === 'combined' || o.conformanceLevel === conformanceLevel)
  ) || WCAG_STANDARD_OPTIONS.find((o) => o.wcagStandard === wcagStandard) || WCAG_STANDARD_OPTIONS[1];

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const select = (option) => {
    onChange?.({ wcagStandard: option.wcagStandard, conformanceLevel: option.conformanceLevel });
    setOpen(false);
  };

  const triggerClass = variant === 'glass-dark' ? 'wss-trigger--glass-dark' : 'wss-trigger--themed';
  const chipClass = variant === 'glass-dark' ? 'wss-chip wss-chip--glass-dark' : 'wss-chip';

  return (
    <div className="wss-field" ref={rootRef}>
      <style>{STYLES}</style>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block', fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 10, color: variant === 'glass-dark' ? 'rgba(255,255,255,0.6)' : 'var(--ink6)',
          }}
        >
          {label}
        </label>
      )}

      <button
        id={id}
        type="button"
        className={`wss-trigger ${triggerClass} ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="wss-trigger-label">
          <span className="wss-trigger-title">{selected.label}</span>
        </span>
        <svg className={`wss-trigger-chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="wss-panel" role="listbox">
          {WCAG_STANDARD_OPTIONS.map((option) => {
            const isSelected = option.id === selected.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`wss-option ${isSelected ? 'selected' : ''}`}
                onClick={() => select(option)}
                title={option.description}
              >
                <div className="wss-option-head">
                  <span className="wss-option-title">{option.label}</span>
                  {option.recommended && <span className="wss-option-badge">Recommended</span>}
                  {isSelected && (
                    <svg className="wss-option-check" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="wss-option-desc">{option.description}</div>
                <div className="wss-option-count">{option.criteriaCount} criteria evaluated</div>
              </button>
            );
          })}
        </div>
      )}

      {showChip && (
        <span className={chipClass}>
          {selected.criteriaCount} criteria will be evaluated
        </span>
      )}
    </div>
  );
};

export default WcagStandardSelect;
