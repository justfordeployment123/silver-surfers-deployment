import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getMe } from '../api';

const STYLES = `
.adl-shell { min-height: 100vh; background: var(--sand); display: flex; }
.adl-sidebar { width: 240px; flex-shrink: 0; background: var(--t9); display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 30; }
.adl-main { flex: 1; padding-left: 240px; display: flex; flex-direction: column; min-height: 100vh; }
.adl-brand { display: flex; align-items: center; gap: 12px; padding: 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; }
.adl-brand-icon { width: 32px; height: 32px; border-radius: var(--r); background: var(--t4); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.adl-brand-title { font-family: var(--ffd); font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; }
.adl-brand-sub { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 1px; }
.adl-nav { flex: 1; padding: 12px 8px; overflow-y: auto; }
.adl-nav-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; border-radius: var(--r); border: none; cursor: pointer; font-family: var(--ff); font-size: 14px; font-weight: 500; text-align: left; transition: background .15s, color .15s; margin-bottom: 2px; }
.adl-nav-btn-active { background: rgba(255,255,255,0.1); color: #fff; }
.adl-nav-btn-inactive { background: transparent; color: rgba(255,255,255,0.6); }
.adl-nav-btn-inactive:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
.adl-user { border-top: 1px solid rgba(255,255,255,0.08); padding: 14px 16px; flex-shrink: 0; position: relative; }
.adl-user-row { display: flex; align-items: center; gap: 10px; }
.adl-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--t4); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
.adl-user-email { font-size: 13px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.adl-user-role { font-size: 11px; color: rgba(255,255,255,0.35); }
.adl-menu-btn { padding: 6px; border-radius: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); cursor: pointer; flex-shrink: 0; }
.adl-menu-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
.adl-dropdown { position: absolute; bottom: calc(100% + 4px); right: 12px; width: 200px; background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--rl); box-shadow: 0 8px 32px rgba(8,80,65,0.12); overflow: hidden; z-index: 50; }
.adl-dd-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; font-family: var(--ff); font-size: 13px; font-weight: 500; color: var(--ink6); background: none; border: none; cursor: pointer; text-align: left; transition: background .15s, color .15s; }
.adl-dd-btn:hover { background: var(--t05); color: var(--t6); }
.adl-dd-btn-danger:hover { background: var(--coralbg); color: var(--coral); }
.adl-dd-div { border-top: 1px solid var(--sandd); }
.adl-topbar { position: sticky; top: 0; z-index: 20; background: var(--sand); border-bottom: 1px solid var(--sandd); padding: 8px 16px; display: flex; align-items: center; }
.adl-hamburger { width: 40px; height: 40px; border-radius: 8px; background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.adl-hamburger:hover { background: var(--sand); }
.adl-content { flex: 1; max-width: 1280px; margin: 0 auto; width: 100%; padding: 32px 40px; }
.adl-overlay { position: fixed; inset: 0; background: rgba(4,46,34,0.45); z-index: 29; }
.adl-mobile-sidebar { position: fixed; top: 0; bottom: 0; left: 0; width: 240px; background: var(--t9); display: flex; flex-direction: column; z-index: 40; box-shadow: 4px 0 24px rgba(0,0,0,0.2); }
.adl-loading { min-height: 100vh; background: var(--sand); display: flex; align-items: center; justify-content: center; }
.adl-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--t1); border-top-color: var(--t4); animation: adl-spin .7s linear infinite; }
@keyframes adl-spin { to { transform: rotate(360deg); } }
@media (min-width: 768px) { .adl-topbar { display: none; } }
@media (max-width: 767px) { .adl-sidebar { display: none; } .adl-main { padding-left: 0; } .adl-content { padding: 24px 16px; } }
`;

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await getMe();
        if (result.user && result.user.role === 'admin') {
          setUser(result.user);
        } else {
          navigate('/admin/login');
        }
      } catch {
        navigate('/admin/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    { name: 'User Management', href: '/admin/users', icon: '👥' },
    { name: 'Blog Management', href: '/admin/blog', icon: '📝' },
    { name: 'FAQ Management', href: '/admin/faqs', icon: '❓' },
    { name: 'Analysis Queue', href: '/admin/analysis', icon: '🔍' },
    { name: 'Bulk Quick Scans', href: '/admin/bulk-quick-scans', icon: '📦' },
    { name: 'Quick Scans', href: '/admin/quick-scans', icon: '⚡' },
    { name: 'Starter Scans', href: '/admin/starter-scans', icon: '🌟' },
    { name: 'Pro Scans', href: '/admin/pro-scans', icon: '💎' },
    { name: 'One-Time Scans', href: '/admin/onetime-scans', icon: '📦' },
    { name: 'Contact Messages', href: '/admin/contact', icon: '📧' },
    { name: 'Legal Documents', href: '/admin/legal', icon: '📋' },
  ].map(item => ({ ...item, current: location.pathname === item.href || (item.href === '/admin/dashboard' && (location.pathname === '/admin' || location.pathname === '/admin/')) }));

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="adl-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="adl-spinner" style={{ margin: '0 auto 16px' }}></div>
            <p style={{ fontSize: '14px', color: 'var(--ink6)' }}>Verifying admin access…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="adl-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="adl-mobile-sidebar">
          <SidebarContent navigation={navigation} onNavigate={() => setSidebarOpen(false)} />
          <UserMenu user={user} onLogout={handleLogout} />
        </div>
      )}

      <div className="adl-shell">
        {/* Desktop sidebar */}
        <aside className="adl-sidebar">
          <SidebarContent navigation={navigation} />
          <UserMenu user={user} onLogout={handleLogout} />
        </aside>

        <div className="adl-main">
          {/* Mobile top bar */}
          <div className="adl-topbar">
            <button className="adl-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <main style={{ flex: 1 }}>
            <div className="adl-content">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

const SidebarContent = ({ navigation, onNavigate }) => {
  const navigate = useNavigate();

  const handleNav = (href) => {
    navigate(href);
    if (onNavigate) onNavigate();
  };

  return (
    <>
      <div className="adl-brand">
        <div className="adl-brand-icon">
          <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div className="adl-brand-title">Admin Panel</div>
          <div className="adl-brand-sub">SilverSurfers</div>
        </div>
      </div>

      <nav className="adl-nav">
        {navigation.map((item) => (
          <button
            key={item.name}
            onClick={() => handleNav(item.href)}
            className={`adl-nav-btn ${item.current ? 'adl-nav-btn-active' : 'adl-nav-btn-inactive'}`}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
            {item.name}
          </button>
        ))}
      </nav>
    </>
  );
};

const UserMenu = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.adl-user')) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <div className="adl-user">
      <div className="adl-user-row">
        <div className="adl-avatar">{user?.email?.charAt(0).toUpperCase() || 'A'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="adl-user-email">{user?.email || 'Admin'}</div>
          <div className="adl-user-role">Administrator</div>
        </div>
        <button className="adl-menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)} title="Admin menu">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {isMenuOpen && (
        <div className="adl-dropdown">
          <button className="adl-dd-btn" onClick={() => { navigate('/'); setIsMenuOpen(false); }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Switch to Website
          </button>
          <div className="adl-dd-div" />
          <button className="adl-dd-btn adl-dd-btn-danger" onClick={() => { onLogout(); setIsMenuOpen(false); }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
