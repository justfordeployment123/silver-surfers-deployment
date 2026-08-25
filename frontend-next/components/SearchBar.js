'use client';

// Ported from frontend/src/components/SearchBar.js. One of the 6 files
// identified in the migration plan as using Tailwind utility classes with
// no Tailwind build configured in frontend-next — converted to the
// design-token CSS system here, same approach as SimpleTextFormatter.js
// and the RichTextPreview*.js components. useNavigate -> next/navigation's
// useRouter is the only other change; all search logic/data is unchanged.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const STYLES = `
.ss-search-root { position: relative; z-index: 40; }
.ss-search-row {
  display: flex; align-items: center; gap: 8px;
  width: 44px; transition: width 0.3s;
}
.ss-search-row.open { width: 220px; }
@media (min-width: 640px) { .ss-search-row.open { width: 260px; } }
@media (min-width: 768px) { .ss-search-row.open { width: 300px; } }
.ss-search-btn {
  min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--r); transition: background 0.3s, color 0.3s; background: none; border: none; cursor: pointer;
  color: var(--ink6);
}
.ss-search-btn:hover { background: var(--sand); color: var(--ink); }
.ss-search-btn svg { width: 20px; height: 20px; }
.ss-search-input {
  flex: 1; min-width: 0; padding: 8px 16px; border-radius: var(--r); outline: none;
  transition: border-color 0.3s, box-shadow 0.3s; font-family: var(--ff); font-size: 16px;
  background: var(--surface); border: 1px solid var(--sandd); color: var(--ink);
}
.ss-search-input::placeholder { color: var(--ink3); }
.ss-search-input:focus { border-color: var(--t4); box-shadow: 0 0 0 3px var(--t1); }
.ss-search-dropdown {
  position: absolute; top: 100%; margin-top: 8px; width: 220px;
  border-radius: var(--rl); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; z-index: 50;
  background: var(--surface); border: 1px solid var(--sandd);
}
@media (min-width: 640px) { .ss-search-dropdown { width: 280px; } }
@media (min-width: 768px) { .ss-search-dropdown { width: 340px; } }
.ss-search-results-list { padding: 8px 0; max-height: 384px; overflow-y: auto; }
.ss-search-result {
  width: 100%; text-align: left; padding: 12px 16px; display: flex; align-items: flex-start; gap: 12px;
  transition: background 0.2s; background: none; border: none; cursor: pointer; color: var(--ink);
}
.ss-search-result:hover { background: var(--sand); }
.ss-search-result-icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
.ss-search-result-body { flex: 1; min-width: 0; }
.ss-search-result-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.ss-search-result-desc {
  font-size: 16px; margin-top: 2px; color: var(--ink6);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.ss-search-result-meta { font-size: 16px; margin-top: 4px; display: flex; align-items: center; gap: 4px; color: var(--ink3); }
.ss-search-result-badge { padding: 2px 6px; border-radius: 4px; font-size: 16px; font-weight: 500; }
.ss-search-result-badge--page    { background: #DBEAFE; color: #1D4ED8; }
.ss-search-result-badge--section { background: #D1FAE5; color: #047857; }
.ss-search-result-badge--feature { background: #EDE9FE; color: #6D28D9; }
.ss-search-result-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-search-no-results { padding: 12px 16px; text-align: center; font-size: 16px; color: var(--ink6); }
`;

const SearchBar = ({ isScrolled, onSearchOpenChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filteredResults, setFilteredResults] = useState([]);
  const searchRef = useRef(null);
  const router = useRouter();

  // Notify parent when search open state changes
  useEffect(() => {
    onSearchOpenChange?.(isSearchOpen);
  }, [isSearchOpen, onSearchOpenChange]);

  // Define all searchable pages, features, and content sections
  const searchableContent = [
    // Main Pages
    { title: 'Home', path: '/', keywords: ['home', 'main', 'landing', 'start'], type: 'page' },
    { title: 'Services', path: '/services', keywords: ['services', 'packages', 'pricing', 'plans', 'audit', 'quick scan', 'full audit'], type: 'page' },
    { title: 'About Us', path: '/about', keywords: ['about', 'company', 'team', 'mission', 'who we are'], type: 'page' },
    { title: 'Contact', path: '/contact', keywords: ['contact', 'support', 'help', 'email', 'reach us'], type: 'page' },
    { title: 'Subscription', path: '/subscription', keywords: ['subscription', 'plan', 'billing', 'payment', 'manage subscription'], type: 'page' },
    { title: 'FAQ', path: '/faq', keywords: ['faq', 'questions', 'help', 'answers', 'support'], type: 'page' },
    { title: 'Blog', path: '/blog', keywords: ['blog', 'articles', 'news', 'posts', 'updates'], type: 'page' },
    { title: 'Account', path: '/account', keywords: ['account', 'profile', 'settings', 'user', 'my account'], type: 'page' },
    { title: 'Login', path: '/login', keywords: ['login', 'sign in', 'authenticate'], type: 'page' },
    { title: 'Register', path: '/register', keywords: ['register', 'sign up', 'create account', 'join'], type: 'page' },
    { title: 'Privacy Policy', path: '/privacy', keywords: ['privacy', 'policy', 'data', 'protection'], type: 'page' },
    { title: 'Terms of Use', path: '/terms', keywords: ['terms', 'conditions', 'legal', 'agreement'], type: 'page' },
    { title: 'Accessibility Guides', path: '/accessibility-guides', keywords: ['accessibility', 'guides', 'wcag', 'standards', 'compliance'], type: 'page' },
    { title: 'Reset Password', path: '/forgot-password', keywords: ['reset', 'forgot', 'password', 'recover'], type: 'page' },

    // Services Page Sections
    { title: 'Starter Package', path: '/services', section: 'starter', keywords: ['starter', 'package', 'small business', 'basic plan', '10 scans', '$297'], type: 'section', description: 'Perfect for small businesses - 10 scans/month' },
    { title: 'Pro Package', path: '/services', section: 'pro', keywords: ['pro', 'professional', 'business', 'advanced', '50 scans', '$697', 'multi-user'], type: 'section', description: 'For growing businesses - 50 scans/month, 5 users' },
    { title: 'One-Time Report', path: '/services', section: 'oneTime', keywords: ['one time', 'single', 'report', '$497', 'one audit'], type: 'section', description: 'Single comprehensive audit report' },
    { title: 'Custom Package', path: '/services', section: 'custom', keywords: ['custom', 'enterprise', 'large scale', 'unlimited', 'white label'], type: 'section', description: 'Custom solutions for enterprises' },

    // About Page Sections
    { title: 'Our Mission', path: '/about', section: 'mission', keywords: ['mission', 'purpose', 'goal', 'accessibility for everyone', 'digital divide'], type: 'section', description: 'Making the web accessible for everyone' },
    { title: 'Our Approach', path: '/about', section: 'approach', keywords: ['approach', 'methodology', 'how we work', 'accessibility first', 'user-focused'], type: 'section', description: 'Accessibility-first, user-focused methodology' },
    { title: 'Our Stats', path: '/about', section: 'stats', keywords: ['statistics', 'numbers', 'impact', '124m', 'sites audited', 'success rate'], type: 'section', description: 'Our impact and success metrics' },
    { title: 'Our Team', path: '/about', section: 'team', keywords: ['team', 'people', 'staff', 'who we are', 'experts'], type: 'section', description: 'Meet our expert team' },

    // Features & Benefits
    { title: 'Quick Scan', path: '/services', section: 'quickscan', keywords: ['quick scan', 'free', 'instant', 'fast audit', 'basic check'], type: 'section', description: 'Free instant accessibility check' },
    { title: 'Full Audit', path: '/services', section: 'fullaudit', keywords: ['full audit', 'comprehensive', 'detailed report', 'in-depth analysis'], type: 'section', description: 'Comprehensive accessibility audit' },
    { title: 'SilverSurfers Score', path: '/services', keywords: ['score', 'rating', 'accessibility score', 'metrics'], type: 'feature', description: 'Proprietary accessibility scoring system' },
    { title: 'PDF Reports', path: '/services', keywords: ['pdf', 'download', 'report', 'documentation'], type: 'feature', description: 'Downloadable PDF audit reports' },
    { title: 'SilverSurfers Seal', path: '/services', keywords: ['seal', 'badge', 'certification', 'compliance badge'], type: 'feature', description: 'Display your accessibility commitment' },
    { title: 'Email Support', path: '/contact', keywords: ['email support', 'customer service', 'help desk'], type: 'feature', description: 'Get help via email' },
    { title: 'Priority Support', path: '/subscription', keywords: ['priority', 'fast response', 'urgent help'], type: 'feature', description: 'Fast-tracked customer support' },

    // Contact & Support
    { title: 'Contact Form', path: '/contact', section: 'form', keywords: ['contact form', 'message', 'get in touch', 'send message'], type: 'section', description: 'Send us a message' },
    { title: 'Support Options', path: '/contact', section: 'support', keywords: ['support options', 'help channels', 'customer service'], type: 'section', description: 'All available support channels' },
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = searchableContent.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.keywords.some(keyword => keyword.includes(query)) ||
      (item.description && item.description.toLowerCase().includes(query))
    ).slice(0, 8); // Limit to 8 results

    setFilteredResults(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const scrollToSection = (sectionId) => {
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        const headerOffset = 100; // Account for fixed header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 100); // Small delay to ensure page is loaded
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (filteredResults.length > 0) {
      const firstResult = filteredResults[0];
      router.push(firstResult.path);
      if (firstResult.section) {
        scrollToSection(firstResult.section);
      }
      setSearchQuery('');
      setIsSearchOpen(false);
    }
  };

  const handleResultClick = (result) => {
    router.push(result.path);
    if (result.section) {
      scrollToSection(result.section);
    }
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  const getResultIcon = (type) => {
    const common = { width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2, viewBox: '0 0 24 24', 'aria-hidden': true };
    switch (type) {
      case 'page':
        return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
      case 'section':
        return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" /></svg>;
      case 'feature':
        return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
      default:
        return <svg {...common}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>;
    }
  };

  return (
    <div className="ss-search-root" ref={searchRef}>
      <style>{STYLES}</style>
      {/* Search Button/Input */}
      <form onSubmit={handleSearch} style={{ position: 'relative' }}>
        <div className={`ss-search-row${isSearchOpen ? ' open' : ''}`}>
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="ss-search-btn"
            aria-label="Search"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {isSearchOpen && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search..."
              aria-label="Search the site"
              autoFocus
              className="ss-search-input"
            />
          )}
        </div>
      </form>

      {/* Search Results Dropdown */}
      {isSearchOpen && filteredResults.length > 0 && (
        <div className="ss-search-dropdown">
          <div className="ss-search-results-list">
            {filteredResults.map((result, index) => (
              <button
                key={index}
                onClick={() => handleResultClick(result)}
                className="ss-search-result"
              >
                <span className="ss-search-result-icon">
                  {getResultIcon(result.type)}
                </span>
                <div className="ss-search-result-body">
                  <div className="ss-search-result-title">
                    {result.title}
                  </div>
                  {result.description && (
                    <div className="ss-search-result-desc">
                      {result.description}
                    </div>
                  )}
                  <div className="ss-search-result-meta">
                    <span className={`ss-search-result-badge ss-search-result-badge--${result.type}`}>
                      {result.type}
                    </span>
                    <span>→</span>
                    <span className="ss-search-result-path">{result.path}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {isSearchOpen && searchQuery.trim() !== '' && filteredResults.length === 0 && (
        <div className="ss-search-dropdown">
          <div className="ss-search-no-results">
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            No results found for &quot;{searchQuery}&quot;
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
