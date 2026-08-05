import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminListBlog, adminListFaqs, adminListAnalysis, adminListContact } from '../../api';
import { IconPencil, IconQuestion, IconSearch, IconMail, IconUsers, IconClipboard, IconDocument } from '../../components/AdminIcons';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-stat-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 20px; display: flex; align-items: center; gap: 16px; }
.ap-stat-icon { width: 44px; height: 44px; border-radius: 10px; background: var(--t05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--t6); }
.ap-stat-val { font-size: 28px; font-weight: 700; color: var(--ink); line-height: 1; }
.ap-stat-lbl { font-size: 13px; color: var(--ink6); margin-top: 2px; }
.ap-stat-sub { font-size: 12px; color: var(--ink6); margin-top: 1px; }
.ap-quick-btn { display: flex; flex-direction: column; align-items: center; padding: 20px 16px; border: 2px solid var(--sandd); border-radius: var(--r); background: var(--surface); cursor: pointer; transition: border-color .15s, background .15s; text-align: center; gap: 8px; }
.ap-quick-btn:hover { border-color: var(--t4); background: var(--t05); }
.ap-quick-btn-icon { display: flex; align-items: center; justify-content: center; color: var(--t4); }
.ap-quick-btn-lbl { font-size: 13px; font-weight: 600; color: var(--ink); }
.ap-quick-btn:hover .ap-quick-btn-lbl { color: var(--t6); }
.ap-activity-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--sandd); }
.ap-activity-row:last-child { border-bottom: none; }
.ap-activity-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--ink6); }
.ap-activity-title { font-size: 13px; color: var(--ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-activity-date { font-size: 11px; color: var(--ink6); white-space: nowrap; }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-a { background: #fef3c7; color: #92400e; }
.pill-r { background: #fee2e2; color: #991b1b; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-y { background: #fef9c3; color: #713f12; }
.pill-gr { background: #f3f4f6; color: #374151; }
.ap-sys-dot { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; flex-shrink: 0; }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalBlogs: 0, publishedBlogs: 0, totalFaqs: 0, publishedFaqs: 0,
    pendingAnalysis: 0, completedAnalysis: 0, newContacts: 0, totalContacts: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [blogsResult, faqsResult, analysisResult, contactsResult] = await Promise.allSettled([
        adminListBlog(), adminListFaqs(), adminListAnalysis({ limit: 100 }), adminListContact()
      ]);
      const blogs = blogsResult.status === 'fulfilled' ? blogsResult.value.items || [] : [];
      const faqs = faqsResult.status === 'fulfilled' ? faqsResult.value.items || [] : [];
      const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value.items || [] : [];
      const contacts = contactsResult.status === 'fulfilled' ? contactsResult.value.items || [] : [];

      const recent = [
        ...blogs.slice(0, 3).map(b => ({ type: 'blog', title: b.title, date: b.createdAt, status: b.published ? 'published' : 'draft' })),
        ...analysis.slice(0, 5).map(a => ({ type: 'analysis', title: a.url, date: a.createdAt, status: a.status })),
        ...contacts.slice(0, 2).map(c => ({ type: 'contact', title: c.subject || 'Contact Message', date: c.createdAt, status: c.status }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

      setStats({
        totalBlogs: blogs.length,
        publishedBlogs: blogs.filter(b => b.published).length,
        totalFaqs: faqs.length,
        publishedFaqs: faqs.filter(f => f.published).length,
        pendingAnalysis: analysis.filter(a => a.status === 'queued' || a.status === 'processing').length,
        completedAnalysis: analysis.filter(a => a.status === 'completed' || a.status === 'completed_with_warnings').length,
        newContacts: contacts.filter(c => c.status === 'new').length,
        totalContacts: contacts.length
      });
      setRecentActivity(recent);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusPill = (status) => {
    if (status === 'published' || status === 'completed') return <span className="pill pill-g">{status}</span>;
    if (status === 'completed_with_warnings') return <span className="pill pill-a">completed w/ warnings</span>;
    if (status === 'draft' || status === 'queued') return <span className="pill pill-y">{status}</span>;
    if (status === 'processing') return <span className="pill pill-t">{status}</span>;
    if (status === 'failed' || status === 'new') return <span className="pill pill-r">{status}</span>;
    return <span className="pill pill-gr">{status || 'unknown'}</span>;
  };

  const typeIcon = (type) => ({ blog: IconPencil, analysis: IconSearch, contact: IconMail }[type] || IconDocument);

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="ap-sk" style={{ height: '80px', borderRadius: 'var(--r)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[1,2,3,4].map(i => <div key={i} className="ap-sk" style={{ height: '90px', borderRadius: 'var(--r)' }} />)}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ background: 'var(--t9)', borderRadius: 'var(--r)', padding: '28px 32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Admin Dashboard</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>Welcome back! Here's your SilverSurfers administration overview.</p>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div className="ap-stat-card">
            <div className="ap-stat-icon"><IconPencil size={20} /></div>
            <div>
              <div className="ap-stat-val">{stats.totalBlogs}</div>
              <div className="ap-stat-lbl">Blog Posts</div>
              <div className="ap-stat-sub">{stats.publishedBlogs} published</div>
            </div>
          </div>
          <div className="ap-stat-card">
            <div className="ap-stat-icon"><IconQuestion size={20} /></div>
            <div>
              <div className="ap-stat-val">{stats.totalFaqs}</div>
              <div className="ap-stat-lbl">FAQs</div>
              <div className="ap-stat-sub">{stats.publishedFaqs} published</div>
            </div>
          </div>
          <div className="ap-stat-card">
            <div className="ap-stat-icon"><IconSearch size={20} /></div>
            <div>
              <div className="ap-stat-val">{stats.pendingAnalysis}</div>
              <div className="ap-stat-lbl">Pending Analysis</div>
              <div className="ap-stat-sub">{stats.completedAnalysis} completed</div>
            </div>
          </div>
          <div className="ap-stat-card">
            <div className="ap-stat-icon"><IconMail size={20} /></div>
            <div>
              <div className="ap-stat-val">{stats.newContacts}</div>
              <div className="ap-stat-lbl">New Contacts</div>
              <div className="ap-stat-sub">{stats.totalContacts} total</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="ap-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '20px' }}>Quick Actions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {[
              { icon: IconPencil, label: 'New Blog Post', href: '/admin/blog' },
              { icon: IconQuestion, label: 'Add FAQ', href: '/admin/faqs' },
              { icon: IconUsers, label: 'Manage Users', href: '/admin/users' },
              { icon: IconClipboard, label: 'Legal Docs', href: '/admin/legal' },
            ].map(({ icon: ActionIcon, label, href }) => (
              <button key={href} onClick={() => navigate(href)} className="ap-quick-btn">
                <span className="ap-quick-btn-icon"><ActionIcon size={26} /></span>
                <span className="ap-quick-btn-lbl">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* Recent Activity */}
          <div className="ap-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>Recent Activity</h3>
            {recentActivity.length > 0 ? (
              <div>
                {recentActivity.map((item, index) => {
                  const ActivityIcon = typeIcon(item.type);
                  return (
                  <div key={index} className="ap-activity-row">
                    <span className="ap-activity-icon"><ActivityIcon size={18} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ap-activity-title">{item.title}</div>
                      <div className="ap-activity-date">{new Date(item.date).toLocaleDateString()}</div>
                    </div>
                    {getStatusPill(item.status)}
                  </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--ink6)', textAlign: 'center', padding: '16px 0' }}>No recent activity</p>
            )}
          </div>

          {/* System Status */}
          <div className="ap-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>System Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'API Status', status: 'Operational' },
                { label: 'Database', status: 'Connected' },
                { label: 'Email Service', status: 'Active' },
              ].map(({ label, status }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--t05)', borderRadius: '8px', border: '1px solid var(--t1)' }}>
                  <div className="ap-sys-dot" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t8)' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: '#16a34a' }}>{status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
