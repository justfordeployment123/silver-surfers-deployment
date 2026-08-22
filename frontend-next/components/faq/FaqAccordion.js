// Client island: only the expand/collapse interaction needs to run in the
// browser. The FAQ data itself is fetched server-side by app/faq/page.js
// and passed in as `items` — no client-side fetch-on-mount here, unlike
// the original frontend/src/pages/FAQ.js.
'use client';

import { useState } from 'react';

export default function FaqAccordion({ items }) {
  const [expandedFaq, setExpandedFaq] = useState(null);

  const toggleFaq = (faqId) => {
    setExpandedFaq(expandedFaq === faqId ? null : faqId);
  };

  if (items.length === 0) {
    return <p className="faq-status">No FAQs published yet.</p>;
  }

  return (
    <>
      {items.map((faq, idx) => {
        const id = faq._id || idx;
        const isOpen = expandedFaq === id;
        return (
          <div key={id} className="faq-item">
            <button
              type="button"
              className="faq-q-btn"
              onClick={() => toggleFaq(id)}
              aria-expanded={isOpen}
            >
              <div className="faq-q-inner">
                <span className="faq-q-num" aria-hidden="true">
                  {Number(faq.order ?? idx) + 1}
                </span>
                <span className="faq-q-text">{faq.question}</span>
              </div>
              <span className={`faq-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className="faq-answer-wrap">
                <p className="faq-answer-text">{faq.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
