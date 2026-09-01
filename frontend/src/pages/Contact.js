import React, { useState, useEffect } from 'react';
import { submitContact, getMe } from '../api';

// GoHighLevel booking widget — the client's calendar (synced to their own
// Outlook calendar on GHL's backend, so availability shown here is real).
const GHL_BOOKING_URL = 'https://api.leadconnectorhq.com/widget/bookings/jackie-gross-personal-calendar-qwh_05xzk';

const Contact = () => {
  // The GHL iframe below needs this script to auto-resize itself. Injected
  // via useEffect (not a static <script> tag in public/index.html) since
  // it's only needed on this one page, not site-wide.
  useEffect(() => {
    const existing = document.querySelector('script[src="https://link.msgsndr.com/js/form_embed.js"]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = 'https://link.msgsndr.com/js/form_embed.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Deep-linking straight to #book-a-call (e.g. a shared link) doesn't work
  // out of the box: this is a client-rendered SPA, so the browser tries to
  // scroll to the section before React has actually put it in the DOM, and
  // the scroll silently does nothing. Retrying on mount (once the section
  // exists) fixes that.
  useEffect(() => {
    if (window.location.hash === '#book-a-call') {
      document.getElementById('book-a-call')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // index.html sets <base href="/" />, which makes any plain href="#hash"
  // resolve against "/" instead of the current page — so clicking this from
  // /contact was sending people to the homepage instead of scrolling down.
  // Scrolling manually sidesteps that entirely.
  const scrollToBooking = (e) => {
    e.preventDefault();
    document.getElementById('book-a-call')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [formData, setFormData] = useState({
    name: '',
    business: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const contactInfo = {
    email: "hello@silversurfers.ai",
    phone: "+19146238747",
    phoneDisplay: "+1 914-623-8747",
    address: "2320 E Marshall Ave, Phoenix, AZ 85016",
    officeHours: "Monday - Friday: 9:00 AM - 7:00 PM EST",
    responseTime: "We typically respond within 4-6 hours on weekdays"
  };

  const contactMethods = [
    {
      icon: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
      title: "Email Us",
      description: "Send us a detailed message about your accessibility needs",
      action: "hello@silversurfers.ai",
      link: "https://mail.google.com/mail/?view=cm&fs=1&to=hello@silversurfers.ai",
      target: "_blank"
    },
    {
      icon: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>,
      title: "Call Sales",
      description: "Speak with one of our experts",
      action: "+1 914-623-8747",
      link: "tel:+19146238747"
    },
    {
      icon: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
      title: "Schedule Consultation",
      description: "Book a 30-minute consultation call with our team",
      action: "Book Now",
      link: "#book-a-call"
    }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
      <style>{`
        .contact-glow-1 {
          position: absolute;
          top: -100px;
          right: -60px;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .contact-glow-2 {
          position: absolute;
          bottom: -80px;
          left: -40px;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,143,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .contact-method-icon {
          width: 52px;
          height: 52px;
          background: var(--t05);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--t6);
          margin-bottom: 14px;
        }
        .contact-method-lnk {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          gap: 6px;
          font-size: 16px;
          font-weight: 500;
          color: var(--tlink);
          text-decoration: none;
          margin-top: 14px;
          transition: color 0.15s;
        }
        .contact-method-lnk:hover { color: var(--ink); text-decoration: underline; }
        .contact-info-icon {
          width: 44px;
          height: 44px;
          background: var(--t05);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--t6);
          margin-bottom: 12px;
        }
        .contact-info-val {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          font-size: 16px;
          color: var(--tlink);
          font-weight: 500;
          text-decoration: none;
          transition: color 0.15s;
        }
        a.contact-info-val:hover { color: var(--ink); text-decoration: underline; }
        .contact-form-wrap {
          max-width: 720px;
          margin: 0 auto;
          background: var(--surface);
          border-radius: var(--rl);
          padding: 44px;
          border: 1px solid var(--sandd);
          box-shadow: 0 4px 28px rgba(16,47,69,0.07);
        }
        .contact-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 16px;
        }
        .contact-field { margin-bottom: 16px; }
        .contact-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: cspin 0.7s linear infinite;
          display: inline-block;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes cspin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .contact-form-grid { grid-template-columns: 1fr; }
          .contact-form-wrap { padding: 24px 20px; }
        }
      `}</style>

      <div>

        {/* ── Hero ─────────────────────────────────── */}
        <div className="pg-hero">
          <div className="contact-glow-1" aria-hidden="true" />
          <div className="contact-glow-2" aria-hidden="true" />
          <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Contact</p>
            <h1 className="h1" style={{ color: '#fff' }}>Get in Touch</h1>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: '540px', margin: '0 auto' }}>
              Have questions or need a custom quote? Our friendly, expert team is here to help.
            </p>
          </div>
        </div>

        {/* ── Contact Methods ───────────────────────── */}
        <section id="support" className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p className="eyebrow">Reach Us</p>
              <h2 className="h2">How Can We Help?</h2>
              <p className="sub">Choose the best way to reach us based on your needs</p>
            </div>
            <div className="g3">
              {contactMethods.map((method, i) => (
                <div className="card" key={i}>
                  <div className="card-bar" />
                  <div className="contact-method-icon">{method.icon}</div>
                  <h3 className="h3" style={{ marginBottom: '8px' }}>{method.title}</h3>
                  <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65' }}>
                    {method.description}
                  </p>
                  <a
                    href={method.link}
                    target={method.target || '_self'}
                    rel={method.target === '_blank' ? 'noopener noreferrer' : undefined}
                    onClick={method.link === '#book-a-call' ? scrollToBooking : undefined}
                    className="contact-method-lnk"
                  >
                    {method.action}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Book a Call ────────────────────────────── */}
        <section id="book-a-call" className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <p className="eyebrow">Schedule</p>
              <h2 className="h2">Book a Consultation</h2>
              <p className="sub">Pick a time that works for you — no phone tag required.</p>
            </div>
            <div style={{ maxWidth: '760px', margin: '0 auto' }}>
              <iframe
                src={GHL_BOOKING_URL}
                style={{ width: '100%', minHeight: '780px', border: 'none', overflow: 'hidden', borderRadius: 'var(--rl)' }}
                scrolling="no"
                title="Book a consultation call"
              />
            </div>
          </div>
        </section>

        {/* ── Contact Form ──────────────────────────── */}
        <section id="contact-form" className="sec-sand">
          <div className="wrap">
            <div className="contact-form-wrap">
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <p className="eyebrow">Message</p>
                <h2 className="h2">Send Us a Message</h2>
                <p className="sub">Tell us about your business and what you hope to achieve. We'll respond promptly.</p>
              </div>

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
                <div className="alert-success" style={{ marginTop: '20px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{submitStatus.message}</span>
                </div>
              )}
              {submitStatus?.type === 'error' && (
                <div className="alert-error" style={{ marginTop: '20px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{submitStatus.message}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Contact Information ───────────────────── */}
        <section id="contact-info" className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p className="eyebrow">Details</p>
              <h2 className="h2">Contact Information</h2>
              <p className="sub">Reach out to our friendly, expert team</p>
            </div>
            <div className="g3">

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Email</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>For general inquiries and support</p>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${contactInfo.email}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-info-val"
                >
                  {contactInfo.email}
                </a>
              </div>

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Phone</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>For sales and urgent inquiries</p>
                <a href={`tel:${contactInfo.phone}`} className="contact-info-val">
                  {contactInfo.phoneDisplay}
                </a>
              </div>

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Office Address</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>Our headquarters</p>
                <span style={{ fontSize: '16px', color: 'var(--ink)', fontWeight: 500 }}>{contactInfo.address}</span>
              </div>

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Office Hours</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>When we're available</p>
                <span style={{ fontSize: '16px', color: 'var(--ink)', fontWeight: 500 }}>{contactInfo.officeHours}</span>
              </div>

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Response Time</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>How quickly we'll get back to you</p>
                <span style={{ fontSize: '16px', color: 'var(--ink)', fontWeight: 500 }}>{contactInfo.responseTime}</span>
              </div>

              <div className="card">
                <div className="card-bar" />
                <div className="contact-info-icon"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></div>
                <h3 className="h3" style={{ marginBottom: '4px' }}>Custom Solutions</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>Need something specific?</p>
                <span style={{ fontSize: '16px', color: 'var(--ink)' }}>
                  We can create custom solutions for your digital business. Contact us today.
                </span>
              </div>

            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────── */}
        <section className="cta-sec">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <h2 className="h2" style={{ color: '#fff', marginBottom: '16px' }}>
              Ready to Improve Your Digital Experience?
            </h2>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '36px', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto' }}>
              Join hundreds of businesses that are already enhancing their digital experience
              to capture the SilverSurfers market. Our expert team is ready to help!
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <a href="/" className="btn btn-p">Quick Scan Report</a>
              <a href="/services" className="btn btn-g">View Services</a>
              <a href="#book-a-call" onClick={scrollToBooking} className="btn btn-g">
                Schedule Call
              </a>
            </div>
          </div>
        </section>

      </div>
    </>
  );
};

export default Contact;
