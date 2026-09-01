// Client island for the /resources page: owns which resource is currently
// selected, so clicking a card's "Get This Resource" button both scrolls to
// the form AND pre-selects that resource in it. Server Component page.js
// just imports data/resources.js and renders this with it — same
// server-shell-plus-client-island split as Contact/Services. Renders its
// own two <section> blocks (grid, then form) rather than page.js wrapping
// it in one, since the grid and the form need different section
// backgrounds (.sec vs .sec-sand) the same way Contact's do.
'use client';

import { useState } from 'react';

import ResourceRequestForm from './ResourceRequestForm';

export default function ResourcesGrid({ resources }) {
  const [selectedSlug, setSelectedSlug] = useState('');

  const handleRequestClick = (slug) => {
    setSelectedSlug(slug);
    document.getElementById('request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <section className="sec">
        <div className="wrap">
          <div className="g3">
            {resources.map((resource) => (
              <div className="card" key={resource.slug}>
                <div className="card-bar" />
                <div className="rsc-card-icon">
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <h3 className="h3" style={{ marginBottom: '8px' }}>{resource.title}</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65', marginBottom: '20px' }}>
                  {resource.description}
                </p>
                <button type="button" onClick={() => handleRequestClick(resource.slug)} className="btn btn-p">
                  Get This Resource
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="request-form" className="sec-sand">
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <p className="eyebrow">Request</p>
            <h2 className="h2">Get Your Free Resource</h2>
            <p className="sub">Tell us which one you want and we&rsquo;ll send it your way.</p>
          </div>
          <div className="rsc-form-wrap">
            <ResourceRequestForm
              resources={resources}
              selectedSlug={selectedSlug}
              onSelectedSlugChange={setSelectedSlug}
            />
          </div>
        </div>
      </section>
    </>
  );
}
