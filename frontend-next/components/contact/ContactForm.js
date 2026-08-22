// Client island: form state + submission. Ported from the form-handling
// half of frontend/src/pages/Contact.js. Uses apiClient.js (client-only,
// auth-token-attaching) since submitContact is a POST action, not a
// Server Component data fetch.
'use client';

import { useState } from 'react';
import { submitContact } from '../../lib/apiClient';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    business: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      if (!formData.message || formData.message.trim().length < 5) {
        setSubmitStatus({ type: 'error', message: 'Please include a message (min 5 characters).' });
        return;
      }
      const payload = {
        name: formData.name,
        email: formData.email,
        subject: formData.subject || `Inquiry from ${formData.business || 'visitor'}`,
        message: formData.message,
      };
      const res = await submitContact(payload);
      if (res?.error) {
        setSubmitStatus({ type: 'error', message: res.error });
      } else {
        setSubmitStatus({ type: 'success', message: 'Thanks! Your message was sent. We will reply shortly.' });
        setFormData({ name: '', business: '', email: '', subject: '', message: '' });
      }
    } catch (err) {
      setSubmitStatus({ type: 'error', message: 'This is a demo version. Please contact us directly.' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 7000);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <div className="contact-form-grid">
          <div>
            <label className="ss-label" htmlFor="cnt-name">Full Name *</label>
            <input
              id="cnt-name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="Your full name"
              className="ss-input"
            />
          </div>
          <div>
            <label className="ss-label" htmlFor="cnt-email">Email Address *</label>
            <input
              id="cnt-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              placeholder="your.email@company.com"
              className="ss-input"
            />
          </div>
        </div>

        <div className="contact-field">
          <label className="ss-label" htmlFor="cnt-business">Business Name</label>
          <input
            id="cnt-business"
            type="text"
            name="business"
            value={formData.business}
            onChange={handleInputChange}
            placeholder="Your company name"
            className="ss-input"
          />
        </div>

        <div className="contact-field">
          <label className="ss-label" htmlFor="cnt-subject">Subject</label>
          <input
            id="cnt-subject"
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleInputChange}
            placeholder="How can we help?"
            className="ss-input"
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label className="ss-label" htmlFor="cnt-message">Message *</label>
          <textarea
            id="cnt-message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            rows="6"
            required
            className="ss-input"
            style={{ resize: 'none' }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-d"
          style={{ width: '100%', justifyContent: 'center', opacity: isSubmitting ? 0.65 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
        >
          {isSubmitting ? (
            <><span className="contact-spinner" aria-hidden="true" />Sending…</>
          ) : 'Send Message'}
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
