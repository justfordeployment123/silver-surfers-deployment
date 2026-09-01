'use client';

// Ported from frontend/src/pages/AdminContentManager.js — the legacy
// "/admin/content" route. In the old app this rendered outside AdminLayout
// (its own getMe()+role check, no sidebar). Per the migration plan's
// recommendation (confirmed reasonable rather than fighting Next's layout
// inheritance to preserve that one inconsistency), it now lives inside the
// (dashboard) route group and inherits the standard sidebar chrome like
// every other admin page. Its own internal getMe() check below is
// therefore now redundant with the layout's check, but kept for fidelity —
// harmless, and matches the "belt and suspenders" pattern the original
// AdminSubscriptionScans component also uses.
import { useEffect, useState } from 'react';
import {
  adminListBlog, adminCreateBlog, adminDeleteBlog, adminUpdateBlog,
  adminListFaqs, adminCreateFaq, adminDeleteFaq, adminUpdateFaq,
  adminListAnalysis, adminRerunAnalysis, getMe,
  adminListContact, adminUpdateContact, adminDeleteContact
} from '../../../../lib/apiClient';

const STYLES = `
.cm-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; padding-left: 16px; padding-right: 16px; background: var(--t9); color: #fff; }
@media (min-width: 640px) { .cm-pg { padding-left: 40px; padding-right: 40px; } }
.cm-inp { width: 100%; padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 16px; outline: none; }
.cm-inp::placeholder { color: rgba(255,255,255,0.75); }
.cm-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px var(--t05); }
.cm-sel { padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 16px; outline: none; }
.cm-sel:focus { border-color: var(--t4); box-shadow: 0 0 0 2px var(--t05); }
.cm-view-sel { appearance: none; width: 288px; font-size: 18px; font-weight: 600; padding: 16px 48px 16px 24px; border-radius: 16px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.25); color: #fff; outline: none; box-shadow: 0 8px 32px rgba(0,0,0,0.2); letter-spacing: 0.04em; }
@media (min-width: 768px) { .cm-view-sel { width: 384px; } }
.cm-view-sel:focus { border-color: var(--t4); box-shadow: 0 0 0 3px var(--t05); }
.cm-btn-add { padding: 10px 16px; border-radius: 16px; background: var(--t6); color: #fff; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 16px; }
.cm-btn-add:hover { background: var(--t8); }
.cm-btn-clear { padding: 10px 16px; border-radius: 16px; background: rgba(255,255,255,0.1); color: #fff; font-weight: 700; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 16px; }
.cm-btn-clear:hover { background: rgba(255,255,255,0.16); }
.cm-btn-save { padding: 8px 16px; border-radius: 12px; background: var(--t6); color: #fff; font-weight: 700; border: none; cursor: pointer; font-size: 16px; }
.cm-btn-save:hover { background: var(--t8); }
.cm-btn-cancel { padding: 8px 16px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; font-size: 16px; }
.cm-btn-cancel:hover { background: rgba(255,255,255,0.16); }
.cm-btn-create { padding: 8px 16px; border-radius: 12px; background: var(--t6); color: #fff; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-create:hover { background: var(--t8); }
.cm-btn-rerun { padding: 6px 12px; border-radius: 8px; background: rgba(10,168,143,0.5); color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-rerun:hover { background: var(--t4); }
.cm-btn-refresh { padding: 8px 16px; border-radius: 8px; background: rgba(10,168,143,0.5); color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-refresh:hover { background: var(--t4); }
.cm-btn-icon { padding: 8px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; cursor: pointer; }
.cm-btn-icon:hover { background: rgba(255,255,255,0.16); }
.cm-btn-del-icon { padding: 8px; border-radius: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fca5a5; cursor: pointer; }
.cm-btn-del-icon:hover { background: rgba(239,68,68,0.2); }
.cm-pill { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 16px; font-weight: 700; border: 1px solid; }
.cm-pill-pub { background: rgba(10,168,143,0.35); border-color: rgba(10,168,143,0.45); color: var(--t3); }
.cm-pill-draft { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); }
.cm-pill-feat { background: rgba(217,119,6,0.45); border-color: rgba(245,158,11,0.4); color: #fcd34d; }
.cm-pill-gray { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); }
.cm-status-completed { background: rgba(10,168,143,0.45); }
.cm-status-failed { background: rgba(239,68,68,0.5); }
.cm-status-processing { background: rgba(56,189,248,0.35); }
.cm-status-default { background: rgba(255,255,255,0.15); }
.cm-card { border-radius: 24px; padding: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); border: 1px solid rgba(255,255,255,0.1); transition: border-color .15s; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
.cm-card:hover { border-color: rgba(10,168,143,0.35); }
.cm-form-card { border-radius: 24px; padding: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); border: 1px solid rgba(255,255,255,0.1); }
.cm-queue { border-radius: 12px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); padding: 16px; border: 1px solid rgba(255,255,255,0.1); max-height: 36rem; overflow-y: auto; }
.cm-queue-row { padding: 16px; border-radius: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); transition: border-color .15s; }
.cm-queue-row:hover { border-color: rgba(10,168,143,0.4); }
.cm-contact-row { padding: 16px; border-radius: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); transition: border-color .15s; }
.cm-contact-row:hover { border-color: rgba(10,168,143,0.4); }
.cm-btn-mark-read { padding: 6px 12px; border-radius: 8px; background: rgba(10,168,143,0.5); color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-mark-read:hover { background: var(--t4); }
.cm-btn-close-msg { padding: 6px 12px; border-radius: 8px; background: rgba(56,189,248,0.35); color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-close-msg:hover { background: rgba(56,189,248,0.55); }
.cm-btn-del-msg { padding: 6px 12px; border-radius: 8px; background: rgba(239,68,68,0.5); color: #fff; font-size: 16px; font-weight: 700; border: none; cursor: pointer; }
.cm-btn-del-msg:hover { background: rgba(239,68,68,0.7); }
`;

export default function AdminContentManager() {
  const [view, setView] = useState('blog'); // 'blog' | 'faqs' | 'analysis' | 'contact'
  const [, setUser] = useState(null);
  const [blog, setBlog] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [error, setError] = useState('');
  const [blogForm, setBlogForm] = useState({ title: '', slug: '', excerpt: '', content: '', category: '', author: '', date: '', readTime: '', featured: false, published: false });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', order: 0, published: true });
  const [analysis, setAnalysis] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('all');
  // Blog view UI state
  const [postQuery, setPostQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', slug: '', excerpt: '', content: '', category: '', author: '', date: '', readTime: '', featured: false, published: false });
  // FAQ view UI state
  const [faqQuery, setFaqQuery] = useState('');
  const [showFaqCreate, setShowFaqCreate] = useState(false);
  const [faqEditingId, setFaqEditingId] = useState(null);
  const [faqEditForm, setFaqEditForm] = useState({ question: '', answer: '', order: 0, published: true });
  // Contact view state
  const [contact, setContact] = useState([]);
  const [contactStatus, setContactStatus] = useState('all');
  const [contactQuery, setContactQuery] = useState('');

  const loadContact = async () => {
    const params = {};
    if (contactStatus !== 'all') params.status = contactStatus;
    const res = await adminListContact(params);
    let items = res.items || [];
    if (contactQuery) {
      const q = contactQuery.toLowerCase();
      items = items.filter(m => [m.name,m.email,m.subject,m.message].some(v => (v||'').toLowerCase().includes(q)));
    }
    setContact(items);
  };

  const loadBlog = async () => {
    const res = await adminListBlog();
    if (res.error) setError(res.error); else setBlog(res.items || []);
  };
  const loadFaqs = async () => {
    const res = await adminListFaqs();
    if (res.error) setError(res.error); else setFaqs(res.items || []);
  };
  const loadAnalysis = async (status = analysisStatus) => {
    try {
      setAnalysisLoading(true); setAnalysisError('');
      const params = { limit: 200 };
      if (status && status !== 'all') params.status = status;
      const res = await adminListAnalysis(params);
      if (res.error) { setAnalysisError(res.error); setAnalysis([]); }
      else {
        let items = Array.isArray(res.items) ? res.items : [];
        if (analysisQuery) {
          const q = analysisQuery.toLowerCase();
          items = items.filter(r => (r.url||'').toLowerCase().includes(q) || (r.email||'').toLowerCase().includes(q) || (r.taskId||'').toLowerCase().includes(q));
        }
        setAnalysis(items);
      }
    } finally { setAnalysisLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (me?.user) setUser(me.user);
      if (!me?.user || me?.user?.role !== 'admin') {
        setError(me?.error || 'Not admin');
        return;
      }
      await Promise.allSettled([loadBlog(), loadFaqs(), loadContact()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === 'analysis') loadAnalysis();
    if (view === 'contact') loadContact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, analysisStatus]);

  useEffect(() => {
    if (view === 'analysis') {
      loadAnalysis(analysisStatus);
    }
    if (view === 'contact') loadContact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisQuery]);

  const submitBlog = async (e) => {
    e.preventDefault(); setError('');
    const payload = { ...blogForm };
    if (payload.date) payload.date = new Date(payload.date).toISOString();
    const res = await adminCreateBlog(payload);
    if (res.error) setError(res.error); else { setBlogForm({ title: '', slug: '', excerpt: '', content: '', category: '', author: '', date: '', readTime: '', featured: false, published: false }); setShowCreate(false); loadBlog(); }
  };
  const removeBlog = async (id) => {
    const res = await adminDeleteBlog(id); if (res.error) setError(res.error); else loadBlog();
  };
  const startEdit = (item) => {
    setEditingId(item._id);
    setEditForm({
      title: item.title || '',
      slug: (item.slug || '').toLowerCase(),
      excerpt: item.excerpt || '',
      content: item.content || '',
      category: item.category || '',
      author: item.author || '',
      date: item.date ? new Date(item.date).toISOString().slice(0,10) : '',
      readTime: item.readTime || '',
      featured: !!item.featured,
      published: !!item.published,
    });
  };
  const cancelEdit = () => { setEditingId(null); };
  const saveEdit = async (id) => {
    setError('');
    const payload = { ...editForm, slug: (editForm.slug || '').toLowerCase() };
    if (payload.date) payload.date = new Date(payload.date).toISOString();
    const res = await adminUpdateBlog(id, payload);
    if (res?.error) { setError(res.error); return; }
    setEditingId(null);
    await loadBlog();
  };

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const submitFaq = async (e) => {
    e.preventDefault(); setError('');
    const res = await adminCreateFaq({ ...faqForm, order: Number(faqForm.order) || 0 });
    if (res.error) setError(res.error); else { setFaqForm({ question: '', answer: '', order: 0, published: true }); setShowFaqCreate(false); loadFaqs(); }
  };
  const removeFaq = async (id) => {
    const res = await adminDeleteFaq(id); if (res.error) setError(res.error); else loadFaqs();
  };
  const startFaqEdit = (item) => {
    setFaqEditingId(item._id);
    setFaqEditForm({
      question: item.question || '',
      answer: item.answer || '',
      order: Number(item.order) || 0,
      published: !!item.published,
    });
  };
  const cancelFaqEdit = () => { setFaqEditingId(null); };
  const saveFaqEdit = async (id) => {
    setError('');
    const payload = { ...faqEditForm, order: Number(faqEditForm.order) || 0 };
    const res = await adminUpdateFaq(id, payload);
    if (res?.error) { setError(res.error); return; }
    setFaqEditingId(null);
    await loadFaqs();
  };

  const statusClass = (s) => {
    if (s === 'completed') return 'cm-status-completed';
    if (s === 'failed') return 'cm-status-failed';
    if (s === 'processing') return 'cm-status-processing';
    return 'cm-status-default';
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="cm-pg">
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
            <div>
              <h1 className="h1" style={{ color: 'var(--t4)', marginBottom: '8px' }}>Content Administration</h1>
              <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Manage blog posts & FAQs. Review analysis queue and re-run jobs.</p>
            </div>
          </div>

          <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <select value={view} onChange={e => setView(e.target.value)} className="cm-view-sel">
                <option value='blog' className='text-gray-900'>Blog Posts</option>
                <option value='faqs' className='text-gray-900'>FAQs</option>
                <option value='analysis' className='text-gray-900'>Analysis Queue</option>
                <option value='contact' className='text-gray-900'>Contact Messages</option>
              </select>
              <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, right: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: 'var(--t3)' }}>
                <svg style={{ width: '20px', height: '20px' }} viewBox='0 0 24 24' stroke='currentColor' fill='none' strokeWidth='2'><path strokeLinecap='round' strokeLinejoin='round' d='M6 9l6 6 6-6'/></svg>
              </div>
            </div>
          </div>

          {error && <p style={{ fontSize: '16px', color: '#fca5a5', marginBottom: '24px', textAlign: 'center' }}>{error}</p>}

          {view === 'blog' && (() => {
            const items = (postQuery
              ? blog.filter(b => (
                  (b.title||'').toLowerCase().includes(postQuery.toLowerCase()) ||
                  (b.slug||'').toLowerCase().includes(postQuery.toLowerCase()) ||
                  (b.excerpt||'').toLowerCase().includes(postQuery.toLowerCase()) ||
                  (b.content||'').toLowerCase().includes(postQuery.toLowerCase())
                ))
              : blog);
            return (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <header style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Posts</h2>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                      <input value={postQuery} onChange={e => setPostQuery(e.target.value)} placeholder="Search posts..." className="cm-inp" style={{ paddingLeft: '36px' }} />
                      <span style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.75)' }}>
                        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103 10.5a7.5 7.5 0 0013.65 6.15z"/></svg>
                      </span>
                    </div>
                    <button onClick={() => setShowCreate(s => !s)} className="cm-btn-add">
                      <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14"/></svg>
                      <span>Add</span>
                    </button>
                    <button onClick={() => { setPostQuery(''); setShowCreate(false); setEditingId(null); }} className="cm-btn-clear">
                      <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      <span>Clear</span>
                    </button>
                  </div>
                </header>

                {showCreate && (
                  <div className="cm-form-card">
                    <h3 style={{ fontWeight: 700, marginBottom: '12px' }}>Create Blog Post</h3>
                    <form onSubmit={submitBlog} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '12px' }}>
                      <input className="cm-inp" placeholder="Title" value={blogForm.title} onChange={e => setBlogForm({...blogForm, title: e.target.value})} />
                      <input className="cm-inp" placeholder="Slug" value={blogForm.slug} onChange={e => setBlogForm({...blogForm, slug: e.target.value.toLowerCase()})} />
                      <input className="cm-inp" placeholder="Excerpt" value={blogForm.excerpt} onChange={e => setBlogForm({...blogForm, excerpt: e.target.value})} style={{ gridColumn: '1 / -1' }} />
                      <textarea rows={6} className="cm-inp" placeholder="Content" value={blogForm.content} onChange={e => setBlogForm({...blogForm, content: e.target.value})} style={{ gridColumn: '1 / -1' }} />
                      <input className="cm-inp" placeholder="Category" value={blogForm.category} onChange={e => setBlogForm({...blogForm, category: e.target.value})} />
                      <input className="cm-inp" placeholder="Author" value={blogForm.author} onChange={e => setBlogForm({...blogForm, author: e.target.value})} />
                      <input type="date" className="cm-inp" value={blogForm.date} onChange={e => setBlogForm({...blogForm, date: e.target.value})} />
                      <input className="cm-inp" placeholder="Read time (e.g., '6 min read')" value={blogForm.readTime} onChange={e => setBlogForm({...blogForm, readTime: e.target.value})} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={blogForm.featured} onChange={e => setBlogForm({...blogForm, featured: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Featured
                        </label>
                        <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={blogForm.published} onChange={e => setBlogForm({...blogForm, published: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Published
                        </label>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                          <button type="button" onClick={() => setShowCreate(false)} className="cm-btn-cancel">Close</button>
                          <button type="submit" className="cm-btn-create">Create</button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '20px' }}>
                  {items.map(b => (
                    <div key={b._id} className="cm-card">
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {editingId === b._id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input className="cm-inp" placeholder="Title" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} />
                              <input className="cm-inp" placeholder="Slug" value={editForm.slug} onChange={e => setEditForm({...editForm, slug: e.target.value.toLowerCase()})} />
                              <textarea rows={3} className="cm-inp" placeholder="Excerpt" value={editForm.excerpt} onChange={e => setEditForm({...editForm, excerpt: e.target.value})} />
                              <input className="cm-inp" placeholder="Category" value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} />
                              <input className="cm-inp" placeholder="Author" value={editForm.author} onChange={e => setEditForm({...editForm, author: e.target.value})} />
                              <input type="date" className="cm-inp" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} />
                              <input className="cm-inp" placeholder="Read time (e.g., '6 min read')" value={editForm.readTime} onChange={e => setEditForm({...editForm, readTime: e.target.value})} />
                              <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!editForm.published} onChange={e => setEditForm({...editForm, published: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Published
                              </label>
                              <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!editForm.featured} onChange={e => setEditForm({...editForm, featured: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Featured
                              </label>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => saveEdit(b._id)} className="cm-btn-save">Save</button>
                                <button onClick={cancelEdit} className="cm-btn-cancel">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.title}>{b.title}</h3>
                              <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                <span className="cm-pill cm-pill-gray">{(b.slug||'').toUpperCase()}</span>
                                <span className={`cm-pill ${b.published ? 'cm-pill-pub' : 'cm-pill-draft'}`}>{b.published ? 'PUBLISHED' : 'DRAFT'}</span>
                                {b.featured && <span className="cm-pill cm-pill-feat">FEATURED</span>}
                                {b.createdAt && <span className="cm-pill cm-pill-gray">{formatDate(b.createdAt)}</span>}
                              </div>
                              {b.excerpt && <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255,255,255,0.75)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.excerpt}</p>}
                              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {b.category && <span className="cm-pill cm-pill-gray">{b.category}</span>}
                                {b.author && <span className="cm-pill cm-pill-gray">By {b.author}</span>}
                                {b.date && <span className="cm-pill cm-pill-gray">{formatDate(b.date)}</span>}
                                {b.readTime && <span className="cm-pill cm-pill-gray">{b.readTime}</span>}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {editingId === b._id ? null : (
                            <>
                              <button onClick={() => startEdit(b)} className="cm-btn-icon" title="Edit">
                                <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487l3.651 3.651M4.5 19.5l4.2-.6 11.813-11.812a2.1 2.1 0 10-2.97-2.97L5.73 15.93l-.6 4.2z"/></svg>
                              </button>
                              <button onClick={() => { if (window.confirm('Delete this post?')) removeBlog(b._id); }} className="cm-btn-del-icon" title="Delete">
                                <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-8 0v12a2 2 0 002 2h4a2 2 0 002-2V7"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No posts</div>}
                </div>
              </section>
            );
          })()}

          {view === 'faqs' && (() => {
            const items = (faqQuery
              ? faqs.filter(f => (
                  (f.question||'').toLowerCase().includes(faqQuery.toLowerCase()) ||
                  (String(f.order)||'').toLowerCase().includes(faqQuery.toLowerCase()) ||
                  (f.answer||'').toLowerCase().includes(faqQuery.toLowerCase())
                ))
              : faqs);
            return (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <header style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700 }}>FAQs</h2>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                      <input value={faqQuery} onChange={e => setFaqQuery(e.target.value)} placeholder="Search FAQs..." className="cm-inp" style={{ paddingLeft: '36px' }} />
                      <span style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.75)' }}>
                        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103 10.5a7.5 7.5 0 0013.65 6.15z"/></svg>
                      </span>
                    </div>
                    <button onClick={() => setShowFaqCreate(s => !s)} className="cm-btn-add">
                      <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14"/></svg>
                      <span>Add</span>
                    </button>
                    <button onClick={() => { setFaqQuery(''); setShowFaqCreate(false); setFaqEditingId(null); }} className="cm-btn-clear">
                      <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      <span>Clear</span>
                    </button>
                  </div>
                </header>

                {showFaqCreate && (
                  <div className="cm-form-card">
                    <h3 style={{ fontWeight: 700, marginBottom: '12px' }}>Create FAQ</h3>
                    <form onSubmit={submitFaq} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '12px' }}>
                      <input className="cm-inp" placeholder="Question" value={faqForm.question} onChange={e => setFaqForm({...faqForm, question: e.target.value})} style={{ gridColumn: '1 / -1' }} />
                      <input type="number" className="cm-inp" placeholder="Order" value={faqForm.order} onChange={e => setFaqForm({...faqForm, order: e.target.value})} />
                      <textarea rows={4} className="cm-inp" placeholder="Answer" value={faqForm.answer} onChange={e => setFaqForm({...faqForm, answer: e.target.value})} style={{ gridColumn: '1 / -1' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={faqForm.published} onChange={e => setFaqForm({...faqForm, published: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Published
                        </label>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                          <button type="button" onClick={() => setShowFaqCreate(false)} className="cm-btn-cancel">Close</button>
                          <button type="submit" className="cm-btn-create">Create</button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '20px' }}>
                  {items.map(f => (
                    <div key={f._id} className="cm-card">
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {faqEditingId === f._id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <input className="cm-inp" placeholder="Question" value={faqEditForm.question} onChange={e => setFaqEditForm({...faqEditForm, question: e.target.value})} />
                              <input type="number" className="cm-inp" placeholder="Order" value={faqEditForm.order} onChange={e => setFaqEditForm({...faqEditForm, order: e.target.value})} />
                              <textarea rows={3} className="cm-inp" placeholder="Answer" value={faqEditForm.answer} onChange={e => setFaqEditForm({...faqEditForm, answer: e.target.value})} />
                              <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!faqEditForm.published} onChange={e => setFaqEditForm({...faqEditForm, published: e.target.checked})} style={{ accentColor: 'var(--t4)' }} /> Published
                              </label>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => saveFaqEdit(f._id)} className="cm-btn-save">Save</button>
                                <button onClick={cancelFaqEdit} className="cm-btn-cancel">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.3 }} title={f.question}>#{f.order} {f.question}</h3>
                              <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                <span className={`cm-pill ${f.published ? 'cm-pill-pub' : 'cm-pill-draft'}`}>{f.published ? 'PUBLISHED' : 'DRAFT'}</span>
                                {f.createdAt && <span className="cm-pill cm-pill-gray">{formatDate(f.createdAt)}</span>}
                              </div>
                              {f.answer && <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255,255,255,0.75)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.answer}</p>}
                            </>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {faqEditingId === f._id ? null : (
                            <>
                              <button onClick={() => startFaqEdit(f)} className="cm-btn-icon" title="Edit">
                                <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487l3.651 3.651M4.5 19.5l4.2-.6 11.813-11.812a2.1 2.1 0 10-2.97-2.97L5.73 15.93l-.6 4.2z"/></svg>
                              </button>
                              <button onClick={() => { if (window.confirm('Delete this FAQ?')) removeFaq(f._id); }} className="cm-btn-del-icon" title="Delete">
                                <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-8 0v12a2 2 0 002 2h4a2 2 0 002-2V7"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No FAQs</div>}
                </div>
              </section>
            );
          })()}

          {view === 'analysis' && (
            <section style={{ marginBottom: '56px' }}>
              <header style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--t4)', display: 'inline-block' }}></span>
                  Analysis Requests
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                  <input value={analysisQuery} onChange={e => setAnalysisQuery(e.target.value)} placeholder='Search (url, email, taskId)...' className="cm-inp" style={{ flex: 1, minWidth: '200px' }} />
                  <select value={analysisStatus} onChange={e => setAnalysisStatus(e.target.value)} className="cm-sel">
                    <option value='all' className='text-black'>All</option>
                    <option value='queued' className='text-black'>Queued</option>
                    <option value='processing' className='text-black'>Processing</option>
                    <option value='completed' className='text-black'>Completed</option>
                    <option value='failed' className='text-black'>Failed</option>
                  </select>
                  <button onClick={() => loadAnalysis()} className="cm-btn-refresh">Refresh</button>
                </div>
              </header>
              {analysisError && <div style={{ fontSize: '16px', color: '#fca5a5', marginBottom: '8px' }}>{analysisError}</div>}
              <div className="cm-queue">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {analysis.map(rec => {
                    const computedStatus = (rec.status || '');
                    return (
                      <div key={rec._id || rec.taskId} className="cm-queue-row">
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{rec.url}</span>
                              <span className="cm-pill cm-pill-gray">{rec.email}</span>
                              <span className={`cm-pill ${statusClass(computedStatus)}`} style={{ border: 'none' }}>{(computedStatus||'').toUpperCase()}</span>
                              <span className={`cm-pill ${statusClass(rec.emailStatus === 'sent' ? 'completed' : rec.emailStatus === 'failed' ? 'failed' : rec.emailStatus === 'sending' ? 'processing' : '')}`} style={{ border: 'none' }}>EMAIL {(rec.emailStatus||'').toUpperCase()}</span>
                            </div>
                            <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                              <span>Task: {rec.taskId}</span>
                              <span>Created {rec.createdAt ? new Date(rec.createdAt).toLocaleString() : ''}</span>
                              {typeof rec.attachmentCount === 'number' && <span>PDFs: {rec.attachmentCount}</span>}
                              {rec.reportDirectory && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>Dir: {rec.reportDirectory}</span>}
                            </div>
                            {rec.failureReason && <div style={{ marginTop: '4px', fontSize: '16px', color: '#fca5a5' }}>Reason: {rec.failureReason}</div>}
                            {rec.emailError && <div style={{ marginTop: '4px', fontSize: '16px', color: '#fca5a5' }}>Email Error: {rec.emailError}</div>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                            {rec.email && rec.url && (
                              <button onClick={async () => {
                                if (!window.confirm('Re-run this analysis now?')) return;
                                const idOrTaskId = rec._id || rec.taskId;
                                const resp = await adminRerunAnalysis(idOrTaskId);
                                if (resp?.error) { alert(resp.error); }
                                else { alert('Re-run queued for existing record'); loadAnalysis(); }
                              }} className="cm-btn-rerun">Re-run</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {analysis.length === 0 && !analysisLoading && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', fontStyle: 'italic' }}>No records.</div>}
                  {analysisLoading && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', fontStyle: 'italic' }}>Loading...</div>}
                </div>
              </div>
            </section>
          )}

          {view === 'contact' && (
            <section style={{ marginBottom: '56px' }}>
              <header style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--t3)', display: 'inline-block' }}></span>
                  Contact Messages
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                  <input value={contactQuery} onChange={e => setContactQuery(e.target.value)} placeholder='Search (name, email, subject, message)...' className="cm-inp" style={{ flex: 1, minWidth: '200px' }} />
                  <select value={contactStatus} onChange={e => setContactStatus(e.target.value)} className="cm-sel">
                    <option value='all' className='text-black'>All</option>
                    <option value='new' className='text-black'>New</option>
                    <option value='read' className='text-black'>Read</option>
                    <option value='closed' className='text-black'>Closed</option>
                  </select>
                  <button onClick={() => loadContact()} className="cm-btn-refresh">Refresh</button>
                </div>
              </header>
              <div className="cm-queue">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {contact.map(msg => (
                    <div key={msg._id} className="cm-contact-row">
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, wordBreak: 'break-all' }}>{msg.subject || 'No subject'}</span>
                            <span className="cm-pill cm-pill-gray">{msg.email || 'Anonymous'}</span>
                            <span className={`cm-pill ${statusClass(msg.status === 'new' ? 'processing' : msg.status === 'read' ? 'completed' : '')}`} style={{ border: 'none' }}>{(msg.status||'new').toUpperCase()}</span>
                            {msg.createdAt && <span className="cm-pill cm-pill-gray">{new Date(msg.createdAt).toLocaleString()}</span>}
                          </div>
                          {msg.name && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', marginBottom: '4px' }}>From: {msg.name}</div>}
                          <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.message}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                          {msg.status !== 'read' && <button onClick={async () => { await adminUpdateContact(msg._id, { status: 'read' }); loadContact(); }} className="cm-btn-mark-read">Mark Read</button>}
                          {msg.status !== 'closed' && <button onClick={async () => { await adminUpdateContact(msg._id, { status: 'closed' }); loadContact(); }} className="cm-btn-close-msg">Close</button>}
                          <button onClick={async () => { if (!window.confirm('Delete this message?')) return; await adminDeleteContact(msg._id); loadContact(); }} className="cm-btn-del-msg">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {contact.length === 0 && <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', fontStyle: 'italic' }}>No messages.</div>}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
