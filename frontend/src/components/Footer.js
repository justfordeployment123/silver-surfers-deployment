import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <>
      <style>{`
        /* ── Footer shell ──────────────────────────────── */
        .ss-footer {
          background: var(--t9);
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 60px 0 0;
          font-family: var(--ff);
        }

        .ss-footer-inner {
          max-width: 1140px;
          margin: 0 auto;
          padding: 0 40px;
        }

        /* ── Top grid ──────────────────────────────────── */
        .ss-footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 48px;
          padding-bottom: 48px;
        }

        /* ── Brand column ──────────────────────────────── */
        .ss-footer-brand-name {
          font-family: var(--ffd);
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          text-decoration: none;
          display: inline-block;
          margin-bottom: 3px;
        }
        .ss-footer-brand-name span { color: var(--t4); }

        .ss-footer-tagline {
          font-size: 11.5px;
          color: rgba(255,255,255,0.35);
          margin-bottom: 16px;
        }

        .ss-footer-desc {
          font-size: 14px;
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
          max-width: 340px;
          margin-bottom: 20px;
          font-weight: 300;
        }

        /* ── Social icons ──────────────────────────────── */
        .ss-footer-socials {
          display: flex;
          gap: 8px;
        }

        .ss-social-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.5);
          transition: background 0.15s, color 0.15s;
          text-decoration: none;
          flex-shrink: 0;
        }
        .ss-social-icon:hover {
          background: rgba(255,255,255,0.15);
          color: #fff;
        }
        .ss-social-icon svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }

        /* ── Link columns ──────────────────────────────── */
        .ss-footer-col-heading {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          margin-bottom: 16px;
        }

        .ss-footer-links {
          display: flex;
          flex-direction: column;
          gap: 10px;
          list-style: none;
        }

        .ss-footer-link {
          font-size: 13.5px;
          color: rgba(255,255,255,0.42);
          text-decoration: none;
          transition: color 0.15s;
          font-weight: 300;
        }
        .ss-footer-link:hover { color: rgba(255,255,255,0.85); }

        /* ── Bottom bar ────────────────────────────────── */
        .ss-footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 20px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .ss-footer-copy {
          font-size: 12px;
          color: rgba(255,255,255,0.28);
        }

        .ss-footer-legal {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }

        .ss-footer-legal a {
          font-size: 12px;
          color: rgba(255,255,255,0.28);
          text-decoration: none;
          transition: color 0.15s;
        }
        .ss-footer-legal a:hover { color: rgba(255,255,255,0.65); }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 1200px) {
          .ss-footer-inner { padding: 0 24px; }
        }
        @media (max-width: 900px) {
          .ss-footer-grid {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
          }
        }
        @media (max-width: 560px) {
          .ss-footer-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .ss-footer-bottom {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <footer className="ss-footer">
        <div className="ss-footer-inner">

          {/* ── Top grid ─────────────────────────────── */}
          <div className="ss-footer-grid">

            {/* Brand column */}
            <div>
              <Link to="/" className="ss-footer-brand-name">
                SilverSurfers<span>.ai</span>
              </Link>
              <p className="ss-footer-tagline">The Authority on Silver Digital Readiness™</p>
              <p className="ss-footer-desc">
                Shaping an age-inclusive digital world. SilverSurfers provides expert digital
                experience assessments, certification, and actionable guidance to help businesses
                delight all generations of users.
              </p>

              <div className="ss-footer-socials">
                {/* LinkedIn */}
                <a
                  href="https://www.linkedin.com/company/silversurfers-ai"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ss-social-icon"
                  title="Follow us on LinkedIn"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://www.instagram.com/silversurfersofficial/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ss-social-icon"
                  title="Follow us on Instagram"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>

                {/* Facebook */}
                <a
                  href="https://www.facebook.com/profile.php?id=61581504520459"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ss-social-icon"
                  title="Follow us on Facebook"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>

                {/* TikTok */}
                <a
                  href="https://www.tiktok.com/@silversurfersofficial"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ss-social-icon"
                  title="Follow us on TikTok"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* Plans column */}
            <div>
              <p className="ss-footer-col-heading">Plans</p>
              <ul className="ss-footer-links">
                <li><Link to="/services#starter" className="ss-footer-link">Starter</Link></li>
                <li><Link to="/services#pro"     className="ss-footer-link">Pro</Link></li>
                <li><Link to="/contact"        className="ss-footer-link">Custom</Link></li>
                <li>
                  <a
                    href="https://calendly.com/silversurfers-info/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ss-footer-link"
                  >
                    Consulting
                  </a>
                </li>
              </ul>
            </div>

            {/* Company column */}
            <div>
              <p className="ss-footer-col-heading">Company</p>
              <ul className="ss-footer-links">
                <li><Link to="/about"   className="ss-footer-link">About Us</Link></li>
                <li><Link to="/contact" className="ss-footer-link">Contact</Link></li>
                <li><Link to="/blog"    className="ss-footer-link">Blog</Link></li>
                <li><Link to="/faq"     className="ss-footer-link">FAQ</Link></li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <p className="ss-footer-col-heading">Resources</p>
              <ul className="ss-footer-links">
                <li><Link to="/accessibility-guides" className="ss-footer-link">Accessibility Guides</Link></li>
                <li><Link to="/blog"                 className="ss-footer-link">Case Studies</Link></li>
                <li><Link to="/contact"              className="ss-footer-link">Support</Link></li>
              </ul>
            </div>

          </div>

          {/* ── Bottom bar ──────────────────────────────── */}
          <div className="ss-footer-bottom">
            <p className="ss-footer-copy">© 2025 SilverSurfers. All rights reserved.</p>
            <div className="ss-footer-legal">
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </div>
          </div>

        </div>
      </footer>
    </>
  );
};

export default Footer;
