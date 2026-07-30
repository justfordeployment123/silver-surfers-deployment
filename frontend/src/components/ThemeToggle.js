import React, { useEffect, useState } from 'react';

const getInitialTheme = () => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
};

const ThemeToggle = ({ className = '' }) => {
  const [theme, setTheme] = useState(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ss-theme', theme); } catch (e) {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <>
      <style>{`
        .ss-theme-toggle {
          position: relative;
          width: 54px;
          height: 30px;
          padding: 3px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.35);
          background: linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.15));
          backdrop-filter: blur(10px) saturate(180%);
          -webkit-backdrop-filter: blur(10px) saturate(180%);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.6),
            inset 0 -1px 2px rgba(0,0,0,0.06),
            0 1px 3px rgba(0,0,0,0.08);
          flex-shrink: 0;
          transition: background 0.3s ease, border-color 0.3s ease;
        }
        :root[data-theme='dark'] .ss-theme-toggle {
          border-color: rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,0.08),
            inset 0 -1px 2px rgba(0,0,0,0.4),
            0 1px 3px rgba(0,0,0,0.3);
        }
        .ss-theme-toggle:active .ss-theme-thumb { transform: scale(0.92); }

        .ss-theme-track-icon {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 14px;
          transform: translateY(-50%);
          color: rgba(0,0,0,0.32);
          transition: opacity 0.25s ease, color 0.3s ease;
        }
        .ss-theme-track-icon--sun  { left: 7px; }
        .ss-theme-track-icon--moon { right: 7px; opacity: 0.35; }
        .ss-theme-toggle[aria-pressed='true'] .ss-theme-track-icon--sun  { opacity: 0.35; }
        .ss-theme-toggle[aria-pressed='true'] .ss-theme-track-icon--moon { opacity: 1; }
        :root[data-theme='dark'] .ss-theme-track-icon { color: rgba(255,255,255,0.55); }

        .ss-theme-thumb {
          position: relative;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #eef0ee);
          box-shadow:
            0 1px 2px rgba(0,0,0,0.15),
            0 2px 6px rgba(0,0,0,0.1),
            inset 0 1px 1px rgba(255,255,255,0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: translateX(0);
          transition: transform 0.38s cubic-bezier(0.34, 1.3, 0.44, 1), background 0.3s ease;
        }
        .ss-theme-toggle[aria-pressed='true'] .ss-theme-thumb {
          transform: translateX(24px);
          background: linear-gradient(145deg, #2c3532, #171d1b);
        }

        .ss-theme-thumb-icon {
          width: 14px;
          height: 14px;
          color: #B06A10;
          transition: transform 0.4s ease, opacity 0.25s ease, color 0.3s ease;
        }
        .ss-theme-toggle[aria-pressed='true'] .ss-theme-thumb-icon {
          color: #E1F5EE;
          transform: rotate(35deg);
        }

        @media (max-width: 1024px) {
          .ss-theme-toggle { width: 48px; height: 26px; }
          .ss-theme-thumb  { width: 20px; height: 20px; }
          .ss-theme-toggle[aria-pressed='true'] .ss-theme-thumb { transform: translateX(22px); }
          .ss-theme-track-icon { width: 12px; height: 12px; }
          .ss-theme-thumb-icon { width: 12px; height: 12px; }
        }
      `}</style>

      <button
        type="button"
        className={`ss-theme-toggle ${className}`}
        onClick={toggle}
        aria-pressed={isDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <svg className="ss-theme-track-icon ss-theme-track-icon--sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg className="ss-theme-track-icon ss-theme-track-icon--moon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>

        <span className="ss-theme-thumb">
          {isDark ? (
            <svg className="ss-theme-thumb-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          ) : (
            <svg className="ss-theme-thumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
        </span>
      </button>
    </>
  );
};

export default ThemeToggle;
