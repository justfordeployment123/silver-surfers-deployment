// Client island: the reusable lead-capture form from
// Docs/SilverSurfers_AI_Lead_Magnet_Recommendation.md ("one reusable form
// across the Resources page and, where technically appropriate, the
// individual resource pages"). Same shape as components/contact/ContactForm.js
// (client component, own state/submit handling, shared .ss-input/.ss-label/
// .alert-* classes) but controlled from outside for the resource selection,
// since ResourcesGrid.js needs to pre-select a resource when a card's
// "Get This Resource" button is clicked.
//
// Phase D (todo.md): wired to the real POST /leads endpoint via
// submitResourceRequest (lib/apiClient.js). GoHighLevel sync itself is
// still a stub server-side (see backend/src/features/leads/ghl-sync.service.ts)
// until Phase F, but the submission, validation, and storage here are real.
'use client';

import { useState } from 'react';

import { submitResourceRequest } from '../../lib/apiClient';

export default function ResourceRequestForm({ resources, selectedSlug, onSelectedSlugChange, lockedResource }) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    marketingConsent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  // Dropdown mode (shared /resources page) vs locked mode (a future
  // dedicated resource page, Phase E, that always requests one fixed
  // resource and hides the picker entirely). No effect needed to keep the
  // <select> in sync when a card changes selectedSlug — it's already a
  // controlled input via the value prop below.
  const isLocked = Boolean(lockedResource);
  const activeResource = isLocked
    ? lockedResource
    : resources.find((r) => r.slug === selectedSlug) || null;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!activeResource) {
      setSubmitStatus({ type: 'error', message: 'Please choose which resource you would like first.' });
      return;
    }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setSubmitStatus({ type: 'error', message: 'Please enter your first and last name.' });
      return;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setSubmitStatus({ type: 'error', message: 'Please enter a valid business email address.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        company: formData.company.trim(),
        // Sent as the resource's slug + its own tag, not the display title —
        // matches what backend/src/models/lead.model.ts stores and what
        // Phase F2's GHL sync will apply as the contact's tag.
        requestedResource: activeResource.slug,
        tag: activeResource.tag,
        marketingConsent: formData.marketingConsent,
      };
      const res = await submitResourceRequest(payload);
      if (res?.error) {
        setSubmitStatus({ type: 'error', message: res.error });
      } else {
        setSubmitStatus({ type: 'success', message: `Thanks! We'll email your copy of "${activeResource.title}" shortly.` });
        setFormData({ firstName: '', lastName: '', email: '', company: '', marketingConsent: false });
      }
    } catch (err) {
      setSubmitStatus({ type: 'error', message: 'Something went wrong. Please try again in a moment.' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 7000);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        {!isLocked && (
          <div className="rsc-form-field">
            <label className="ss-label" htmlFor="ss-request-select">Which resource would you like? *</label>
            <select
              id="ss-request-select"
              name="requestedResource"
              value={selectedSlug || ''}
              onChange={(e) => onSelectedSlugChange(e.target.value)}
              required
              className="ss-input"
            >
              <option value="" disabled>Choose a resource…</option>
              {resources.map((r) => (
                <option key={r.slug} value={r.slug}>{r.title}</option>
              ))}
            </select>
          </div>
        )}

        <div className="rsc-form-grid">
          <div>
            <label className="ss-label" htmlFor="ss-request-first">First Name *</label>
            <input
              id="ss-request-first"
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              required
              placeholder="Jane"
              className="ss-input"
            />
          </div>
          <div>
            <label className="ss-label" htmlFor="ss-request-last">Last Name *</label>
            <input
              id="ss-request-last"
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              required
              placeholder="Doe"
              className="ss-input"
            />
          </div>
        </div>

        <div className="rsc-form-field">
          <label className="ss-label" htmlFor="ss-request-email">Business Email *</label>
          <input
            id="ss-request-email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            placeholder="jane@company.com"
            className="ss-input"
          />
        </div>

        <div className="rsc-form-field">
          <label className="ss-label" htmlFor="ss-request-company">Company Name</label>
          <input
            id="ss-request-company"
            type="text"
            name="company"
            value={formData.company}
            onChange={handleInputChange}
            placeholder="Your company (optional)"
            className="ss-input"
          />
        </div>

        <label className="rsc-consent-row">
          <input
            type="checkbox"
            name="marketingConsent"
            checked={formData.marketingConsent}
            onChange={handleInputChange}
            style={{ accentColor: 'var(--t4)' }}
          />
          <span>I&rsquo;m okay receiving occasional emails about SilverSurfers resources and services.</span>
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-d"
          style={{ width: '100%', justifyContent: 'center', opacity: isSubmitting ? 0.65 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
        >
          {isSubmitting ? (<><span className="rsc-spinner" aria-hidden="true" />Sending…</>) : 'Get This Resource'}
        </button>
      </form>

      {submitStatus?.type === 'success' && (
        <div className="alert-success" style={{ marginTop: '20px' }} role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{submitStatus.message}</span>
        </div>
      )}
      {submitStatus?.type === 'error' && (
        <div className="alert-error" style={{ marginTop: '20px' }} role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{submitStatus.message}</span>
        </div>
      )}
    </>
  );
}
