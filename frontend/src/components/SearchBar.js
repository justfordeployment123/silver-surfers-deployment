import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SearchBar = ({ isScrolled, onSearchOpenChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filteredResults, setFilteredResults] = useState([]);
  const searchRef = useRef(null);
  const navigate = useNavigate();

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
      navigate(firstResult.path);
      if (firstResult.section) {
        scrollToSection(firstResult.section);
      }
      setSearchQuery('');
      setIsSearchOpen(false);
    }
  };

  const handleResultClick = (result) => {
    navigate(result.path);
    if (result.section) {
      scrollToSection(result.section);
    }
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  const getResultIcon = (type) => {
    switch(type) {
      case 'page': return '📄';
      case 'section': return '📍';
      case 'feature': return '⭐';
      default: return '🔍';
    }
  };

  return (
    <div className="relative z-40" ref={searchRef}>
      <style>{`
        .ss-search-btn { color: var(--ink6); }
        .ss-search-btn:hover { background: var(--sand); color: var(--ink); }

        .ss-search-input {
          background: var(--surface);
          border-color: var(--sandd);
          color: var(--ink);
        }
        .ss-search-input::placeholder { color: var(--ink3); }
        .ss-search-input:focus { border-color: var(--t4); box-shadow: 0 0 0 3px var(--t1); }

        .ss-search-dropdown {
          background: var(--surface);
          border: 1px solid var(--sandd);
        }

        /* button{} does not inherit font-size, so this row and its unsized
           title/desc/meta children all computed to the ~13.3px UA default.
           Setting it here cascades to them. */
        .ss-search-result { color: var(--ink); font-size: 16px; line-height: 1.5; }
        .ss-search-result:hover { background: var(--sand); }
        .ss-search-result-title { color: var(--ink); }
        .ss-search-result-desc { color: var(--ink6); }
        .ss-search-result-meta { color: var(--ink3); }
      `}</style>
      {/* Search Button/Input */}
      <form onSubmit={handleSearch} className="relative">
        <div className={`flex items-center gap-2 transition-all duration-300 ${
          isSearchOpen ? 'w-48 sm:w-56 md:w-64' : 'w-11'
        }`}>
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="ss-search-btn min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-all duration-300"
            aria-label="Search"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
              className="ss-search-input flex-1 px-4 py-2 rounded-lg border outline-none transition-all duration-300"
            />
          )}
        </div>
      </form>

      {/* Search Results Dropdown */}
      {isSearchOpen && filteredResults.length > 0 && (
        <div className="ss-search-dropdown absolute top-full mt-2 w-48 sm:w-56 md:w-80 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="py-2 max-h-96 overflow-y-auto">
            {filteredResults.map((result, index) => (
              <button
                key={index}
                onClick={() => handleResultClick(result)}
                className="ss-search-result w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-200"
              >
                <span className="text-lg flex-shrink-0 mt-0.5">
                  {getResultIcon(result.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="ss-search-result-title font-medium truncate">
                    {result.title}
                  </div>
                  {result.description && (
                    <div className="ss-search-result-desc text-base mt-0.5 line-clamp-2">
                      {result.description}
                    </div>
                  )}
                  <div className="ss-search-result-meta text-base mt-1 flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 rounded text-base font-medium ${
                      result.type === 'page' ? 'bg-blue-100 text-blue-700' :
                      result.type === 'section' ? 'bg-green-100 text-green-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {result.type}
                    </span>
                    <span>→</span>
                    <span className="truncate">{result.path}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {isSearchOpen && searchQuery.trim() !== '' && filteredResults.length === 0 && (
        <div className="ss-search-dropdown absolute top-full mt-2 w-48 sm:w-56 md:w-80 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="ss-search-result-desc px-4 py-3 text-center text-sm">
            <div className="mb-2">🔍</div>
            No results found for "{searchQuery}"
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
