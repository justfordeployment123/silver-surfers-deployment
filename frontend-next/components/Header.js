'use client';

// Ported from frontend/src/components/Header.js, including the nav-overflow
// fix already applied there (decoupled .ss-nav-inner max-width from .wrap's
// 1140px to 1360px, matching breakpoint raised to 1360px — the logged-in
// 7-link row plus 44px WCAG tap targets never fit inside 1140px). Swaps
// react-router-dom's Link/useLocation/useNavigate for next/link and
// next/navigation's usePathname/useRouter; getMe/logout come from
// lib/apiClient.js instead of api.js.
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getMe, logout as apiLogout } from '../lib/apiClient';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled]             = useState(false);
  const [user, setUser]                         = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen]     = useState(false);
  const [isSearchOpen, setIsSearchOpen]         = useState(false);
  const userMenuRef        = useRef(null);
  const desktopUserMenuRef = useRef(null);
  const pathname  = usePathname();
  const router    = useRouter();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await getMe();
      setUser(res?.user ?? null);
    })();
  }, [pathname]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!isUserMenuOpen) return;
      const outsideDesktop = desktopUserMenuRef.current && !desktopUserMenuRef.current.contains(e.target);
      const outsideMobile  = userMenuRef.current        && !userMenuRef.current.contains(e.target);
      if (outsideDesktop && outsideMobile) setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isUserMenuOpen]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const handleLogout    = () => { apiLogout(); setUser(null); router.replace('/'); };
  const isActive        = (path) => pathname === path;

  const navLinks = [
    { to: '/',         label: 'Home'     },
    { to: '/services', label: 'Services & Pricing' },
    { to: '/about',    label: 'About'    },
    { to: '/contact',  label: 'Contact'  },
    { to: '/faq',      label: 'FAQ'      },
    { to: '/blog',     label: 'Blog'     },
  ];

  return (
    <>
      <style>{`
        /* ── Nav shell ─────────────────────────────────── */
        .ss-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 1000;
          background: var(--nav-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--sandd);
          height: 64px;
          display: flex;
          align-items: center;
          transition: box-shadow 0.2s, background 0.25s;
        }
        .ss-nav.scrolled {
          box-shadow: 0 4px 24px rgba(0,0,0,0.07);
        }

        .ss-nav-inner {
          /* Wider than .wrap (1140px) on purpose: the logged-in nav row
             (7 links incl. "Subscription", plus search/theme/CTA/avatar,
             all with 44px WCAG tap targets) measures ~1212px of real
             content before padding — it literally cannot fit inside
             1140px on any screen size, logged-in or not. Decoupling the
             nav's max-width from the page-content max-width fixes that;
             see the matching 1360px collapse breakpoint below. */
          max-width: 1360px;
          margin: 0 auto;
          padding: 0 40px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        /* ── Logo ──────────────────────────────────────── */
        .ss-logo {
          display: flex;
          align-items: center;
          min-height: 44px;
          gap: 8px;
          font-family: var(--ffd);
          font-size: 20px;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.02em;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ss-logo span { color: var(--t4); }
        .ss-logo-mark { height: 28px; width: 28px; flex-shrink: 0; object-fit: contain; }

        /* ── Desktop links ─────────────────────────────── */
        .ss-nav-links {
          display: flex;
          gap: 12px;
          list-style: none;
          align-items: center;
        }
        .ss-nav-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          min-height: 44px;
          font-size: 16px;
          font-weight: 500;
          color: var(--ink6);
          cursor: pointer;
          padding: 10px 8px;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap;
          text-decoration: none;
        }
        .ss-nav-link:hover,
        .ss-nav-link.active {
          color: var(--tlink);
          border-bottom-color: var(--t4);
        }

        /* ── CTA button ────────────────────────────────── */
        .ss-nav-cta {
          background: var(--t8);
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: var(--r);
          cursor: pointer;
          border: none;
          white-space: nowrap;
          transition: background 0.15s;
          text-decoration: none;
          display: inline-block;
          flex-shrink: 0;
        }
        .ss-nav-cta:hover { background: var(--t6); color: #fff; }

        /* ── Right cluster ─────────────────────────────── */
        .ss-nav-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        /* ── Avatar / user menu ────────────────────────── */
        .ss-avatar-btn {
          display: flex;
          align-items: center;
          min-height: 44px;
          gap: 5px;
          padding: 8px 10px 8px 8px;
          border-radius: 22px;
          border: 1px solid var(--sandd);
          background: var(--surface);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .ss-avatar-btn:hover {
          border-color: var(--t4);
          background: var(--t05);
        }

        .ss-avatar-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--t6);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--ff);
          font-size: 16px;
          font-weight: 600;
        }

        .ss-avatar-chevron {
          width: 14px;
          height: 14px;
          color: var(--ink3);
        }

        .ss-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 200px;
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          box-shadow: 0 8px 32px rgba(8,80,65,0.09);
          z-index: 100;
          overflow: hidden;
        }

        .ss-dropdown-email {
          padding: 10px 16px;
          font-size: 16px;
          color: var(--ink3);
          border-bottom: 1px solid var(--sandd);
        }

        .ss-dropdown-item {
          display: block;
          padding: 10px 16px;
          font-size: 16px;
          color: var(--ink6);
          text-decoration: none;
          transition: background 0.12s, color 0.12s;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--ff);
        }
        .ss-dropdown-item:hover {
          background: var(--t05);
          color: var(--t8);
        }
        .ss-dropdown-item--danger { color: var(--coral); }
        .ss-dropdown-item--danger:hover { background: var(--coralbg); color: var(--coral); }
        .ss-dropdown-item--highlight {
          background: var(--t8);
          color: #fff;
        }
        .ss-dropdown-item--highlight:hover {
          background: var(--t6);
          color: #fff;
        }

        /* ── Hamburger ─────────────────────────────────── */
        .ss-hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          width: 44px;
          height: 44px;
          padding: 8px;
          cursor: pointer;
          background: none;
          border: none;
          border-radius: var(--r);
          transition: background 0.15s;
        }
        .ss-hamburger:hover { background: var(--sand); }
        .ss-hamburger-bar {
          width: 100%;
          height: 2px;
          background: var(--ink);
          border-radius: 2px;
          transition: transform 0.25s, opacity 0.25s;
        }
        .ss-hamburger[aria-expanded="true"] .bar1 { transform: rotate(45deg) translateY(7px); }
        .ss-hamburger[aria-expanded="true"] .bar2 { opacity: 0; }
        .ss-hamburger[aria-expanded="true"] .bar3 { transform: rotate(-45deg) translateY(-7px); }

        /* ── Mobile drawer ─────────────────────────────── */
        .ss-mobile-nav {
          position: fixed;
          top: 64px;
          left: 0; right: 0;
          background: var(--surface);
          border-bottom: 1px solid var(--sandd);
          box-shadow: 0 8px 24px rgba(8,80,65,0.08);
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.3s ease;
          z-index: 999;
        }
        .ss-mobile-nav.open { max-height: 90vh; overflow-y: auto; }

        .ss-mobile-nav-inner {
          padding: 16px 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ss-mobile-link {
          display: block;
          padding: 11px 14px;
          font-size: 16px;
          font-weight: 500;
          color: var(--ink6);
          border-radius: var(--r);
          text-decoration: none;
          transition: background 0.12s, color 0.12s;
        }
        .ss-mobile-link:hover  { background: var(--sand); color: var(--ink); }
        .ss-mobile-link.active { background: var(--t05); color: var(--t6); font-weight: 600; }

        .ss-mobile-divider {
          border: none;
          border-top: 1px solid var(--sandd);
          margin: 10px 0;
        }

        .ss-mobile-search { padding: 0 0 8px; }

        /* ── Desktop hidden at ≤1360px ─────────────────────
           Was 1024px, then 1240px. First bump only accounted for the
           logged-OUT row (6 links). Logged-in adds a 7th "Subscription"
           link, and the ≥44px WCAG tap targets on every item push the
           real minimum content width to ~1212px + padding — it was still
           clipping the avatar on ordinary desktop widths (measured
           overflowing even at 1280–1400px). Matches .ss-nav-inner's
           1360px max-width above: below that, there just isn't room for
           the full row, logged in or out, so collapse to the hamburger. */
        @media (max-width: 1360px) {
          .ss-nav-links        { display: none; }
          .ss-nav-cta          { display: none; }
          .ss-search-desktop   { display: none; }
          .ss-theme-desktop    { display: none; }
          .ss-hamburger        { display: flex; }
        }
        @media (max-width: 1200px) {
          .ss-nav-inner { padding: 0 24px; }
        }

        /* ── Skip link (WCAG 2.4.1 Bypass Blocks) ───────── */
        .ss-skip-link {
          position: absolute;
          top: -80px;
          left: 12px;
          z-index: 2000;
          background: var(--t8);
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          padding: 12px 20px;
          border-radius: var(--r);
          text-decoration: none;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          transition: top 0.15s ease;
        }
        .ss-skip-link:focus {
          top: 12px;
        }
      `}</style>

      <a href="#main-content" className="ss-skip-link">Skip to main content</a>

      {/* ── Fixed navbar ───────────────────────────────── */}
      <header className={`ss-nav${isScrolled ? ' scrolled' : ''}`} role="banner">
        <div className="ss-nav-inner">

          {/* Logo */}
          <Link href="/" className="ss-logo" onClick={closeMobileMenu}>
            <img src="/Logo.png" alt="" className="ss-logo-mark" />
            SilverSurfers<span>.ai</span>
          </Link>

          {/* Desktop links */}
          <nav aria-label="Main navigation">
          <ul className="ss-nav-links">
            {navLinks.map(({ to, label }) => (
              <li key={to}>
                <Link
                  href={to}
                  className={`ss-nav-link${isActive(to) ? ' active' : ''}`}
                >
                  {label}
                </Link>
              </li>
            ))}
            {user && (
              <li>
                <Link
                  href="/subscription"
                  className={`ss-nav-link${isActive('/subscription') ? ' active' : ''}`}
                >
                  Subscription
                </Link>
              </li>
            )}
          </ul>
          </nav>

          {/* Right cluster */}
          <div className="ss-nav-right">
            {/* Search — desktop only */}
            <div className="ss-search-desktop">
              <SearchBar isScrolled={isScrolled} onSearchOpenChange={setIsSearchOpen} />
            </div>

            <div className="ss-theme-desktop">
              <ThemeToggle />
            </div>

            {/* CTA */}
            {!isSearchOpen && (
              <Link href="/services" className="ss-nav-cta">
                Get Your Audit
              </Link>
            )}

            {/* User avatar / dropdown */}
            <div style={{ position: 'relative' }} ref={desktopUserMenuRef}>
              <button
                className="ss-avatar-btn"
                onClick={() => setIsUserMenuOpen((s) => !s)}
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
                aria-label="User menu"
              >
                <div className="ss-avatar-circle">
                  {user?.email
                    ? user.email.charAt(0).toUpperCase()
                    : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A4 4 0 018 16h8a4 4 0 012.879 1.804M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    )
                  }
                </div>
                <svg className="ss-avatar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/>
                </svg>
              </button>

              {isUserMenuOpen && (
                <div className="ss-dropdown" role="menu">
                  {user ? (
                    <>
                      <div className="ss-dropdown-email">{user.email}</div>
                      {user.role === 'admin' && (
                        <Link
                          href="/admin/dashboard"
                          className="ss-dropdown-item"
                          onClick={() => setIsUserMenuOpen(false)}
                          role="menuitem"
                        >
                          Admin Dashboard
                        </Link>
                      )}
                      <Link
                        href="/account"
                        className="ss-dropdown-item"
                        onClick={() => setIsUserMenuOpen(false)}
                        role="menuitem"
                      >
                        Account
                      </Link>
                      <Link
                        href="/monitoring"
                        className="ss-dropdown-item"
                        onClick={() => setIsUserMenuOpen(false)}
                        role="menuitem"
                      >
                        Monitoring
                      </Link>
                      <button
                        className="ss-dropdown-item ss-dropdown-item--danger"
                        onClick={() => { setIsUserMenuOpen(false); handleLogout(); }}
                        role="menuitem"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="ss-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          const cur = window.location.pathname + window.location.search + window.location.hash;
                          if (cur && cur !== '/' && !cur.includes('/login')) localStorage.setItem('lastRoute', cur);
                          setIsUserMenuOpen(false);
                        }}
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        className="ss-dropdown-item ss-dropdown-item--highlight"
                        role="menuitem"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Get Started
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="ss-hamburger"
              onClick={() => setIsMobileMenuOpen((s) => !s)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              <div className="ss-hamburger-bar bar1" />
              <div className="ss-hamburger-bar bar2" />
              <div className="ss-hamburger-bar bar3" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ───────────────────────────────── */}
      <nav className={`ss-mobile-nav${isMobileMenuOpen ? ' open' : ''}`} aria-label="Mobile navigation">
        <div className="ss-mobile-nav-inner">
          {/* Mobile search */}
          <div className="ss-mobile-search">
            <SearchBar isScrolled={true} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px' }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink6)' }}>Appearance</span>
            <ThemeToggle />
          </div>

          <hr className="ss-mobile-divider" />

          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              href={to}
              className={`ss-mobile-link${isActive(to) ? ' active' : ''}`}
              onClick={closeMobileMenu}
            >
              {label}
            </Link>
          ))}
          {user && (
            <Link
              href="/subscription"
              className={`ss-mobile-link${isActive('/subscription') ? ' active' : ''}`}
              onClick={closeMobileMenu}
            >
              Subscription
            </Link>
          )}

          <hr className="ss-mobile-divider" />

          {/* Mobile CTA */}
          <Link
            href="/services"
            onClick={closeMobileMenu}
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '12px',
              background: 'var(--t8)',
              color: '#fff',
              borderRadius: 'var(--r)',
              fontWeight: 600,
              fontSize: 16,
              marginTop: 4,
              textDecoration: 'none',
            }}
          >
            Get Your Audit
          </Link>

          {/* Mobile auth */}
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link href="/admin/dashboard" className="ss-mobile-link" onClick={closeMobileMenu}>
                  Admin Dashboard
                </Link>
              )}
              <Link href="/account" className="ss-mobile-link" onClick={closeMobileMenu}>Account</Link>
              <Link href="/monitoring" className="ss-mobile-link" onClick={closeMobileMenu}>Monitoring</Link>
              <button
                onClick={() => { handleLogout(); closeMobileMenu(); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  padding: '12px',
                  background: 'var(--coralbg)',
                  color: 'var(--coral)',
                  borderRadius: 'var(--r)',
                  fontWeight: 600,
                  fontSize: 16,
                  marginTop: 4,
                  border: '1px solid #F5C4B8',
                  cursor: 'pointer',
                  fontFamily: 'var(--ff)',
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Link
                href="/login"
                onClick={() => {
                  const cur = window.location.pathname + window.location.search + window.location.hash;
                  if (cur && cur !== '/' && !cur.includes('/login')) localStorage.setItem('lastRoute', cur);
                  closeMobileMenu();
                }}
                style={{
                  flex: 1, textAlign: 'center', padding: '12px',
                  background: 'var(--sand)', color: 'var(--ink)',
                  borderRadius: 'var(--r)', fontWeight: 600, fontSize: 16,
                  border: '1px solid var(--sandd)', textDecoration: 'none',
                }}
              >
                Login
              </Link>
              <Link
                href="/register"
                onClick={closeMobileMenu}
                style={{
                  flex: 1, textAlign: 'center', padding: '12px',
                  background: 'var(--t9)', color: '#fff',
                  borderRadius: 'var(--r)', fontWeight: 600, fontSize: 16,
                  textDecoration: 'none',
                }}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};

export default Header;
