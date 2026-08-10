import React from 'react';
import { Link } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/admin/content-manager', label: 'Content Manager', desc: 'Manage blog posts, FAQs, analysis queue & contact messages', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { to: '/admin/legal', label: 'Legal Documents', desc: 'Edit Terms of Service, Privacy Policy, and Accessibility Guides', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { to: '/admin/blog', label: 'Blog (Legacy)', desc: 'Simple blog CRUD — use Content Manager for full features', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { to: '/admin/services', label: 'Services', desc: 'Manage service offerings and pricing', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { to: '/admin/faqs', label: 'FAQs (Legacy)', desc: 'Simple FAQ CRUD — use Content Manager for full features', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const STYLES = `
.adm-bg { min-height: 100vh; background: var(--t9); padding: 96px 24px 60px; }
.adm-inner { max-width: 900px; margin: 0 auto; }
.adm-header { margin-bottom: 40px; }
.adm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.adm-card { display: block; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: var(--r); padding: 20px 20px 18px; text-decoration: none; transition: border-color .15s, background .15s; }
.adm-card:hover { background: rgba(255,255,255,0.12); border-color: var(--t4); }
.adm-card-icon { width: 40px; height: 40px; background: var(--t05); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.adm-card-label { font-family: var(--ffd); font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.adm-card-desc { font-size: 16px; color: rgba(255,255,255,0.75); line-height: 1.5; }
`;

const AdminDashboard = () => (
  <>
    <style>{STYLES}</style>
    <div className="adm-bg">
      <div className="adm-inner">
        <div className="adm-header">
          <h1 className="h1" style={{ color: '#fff', marginBottom: '8px' }}>Admin Dashboard</h1>
          <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>SilverSurfers administration hub</p>
        </div>
        <div className="adm-grid">
          {NAV_LINKS.map(({ to, label, desc, icon }) => (
            <Link key={to} to={to} className="adm-card">
              <div className="adm-card-icon">
                <svg width="20" height="20" fill="none" stroke="var(--t4)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
              </div>
              <div className="adm-card-label">{label}</div>
              <div className="adm-card-desc">{desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  </>
);

export default AdminDashboard;
