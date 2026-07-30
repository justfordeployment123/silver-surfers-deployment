import React, { useState, useEffect } from 'react';
import { adminListFaqs, adminCreateFaq, adminDeleteFaq, adminUpdateFaq } from '../../api';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-lbl { font-size: 13px; font-weight: 500; color: var(--ink6); margin-bottom: 6px; display: block; }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 10px 14px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-textarea { border: 1px solid var(--sandd); border-radius: 8px; padding: 10px 14px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; resize: vertical; box-sizing: border-box; }
.ap-textarea:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-btn-danger-sm { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: color .15s, background .15s; }
.ap-btn-danger-sm:hover { color: #ef4444; background: #fee2e2; }
.ap-btn-edit-sm { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: color .15s, background .15s; }
.ap-btn-edit-sm:hover { color: var(--t4); background: var(--t05); }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.ap-ok { background: #dcfce7; border: 1px solid #86efac; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #166534; }
.ap-stat-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
.ap-stat-icon { width: 38px; height: 38px; border-radius: 8px; background: var(--t05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ap-faq-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 20px; transition: box-shadow .15s; }
.ap-faq-card:hover { box-shadow: 0 4px 16px rgba(4,46,34,0.08); }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-gr { background: #f3f4f6; color: #374151; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-y { background: #fef9c3; color: #713f12; }
.ap-vt-btn { border: 1px solid var(--sandd); background: var(--surface); cursor: pointer; padding: 8px 10px; color: var(--ink6); transition: background .15s, color .15s; display: flex; align-items: center; }
.ap-vt-btn:first-child { border-radius: 8px 0 0 8px; border-right: none; }
.ap-vt-btn:last-child { border-radius: 0 8px 8px 0; }
.ap-vt-btn-active { background: var(--t4); color: #fff; border-color: var(--t4); }
.ap-vt-btn:not(.ap-vt-btn-active):hover { background: var(--sand); }
.ap-modal-overlay { position: fixed; inset: 0; background: rgba(4,46,34,0.45); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
.ap-modal { background: var(--surface); border-radius: var(--rl); width: 100%; max-width: 680px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
.ap-modal-hdr { padding: 20px 28px; border-bottom: 1px solid var(--sandd); display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }
.ap-modal-close { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: background .15s, color .15s; }
.ap-modal-close:hover { background: var(--sand); color: var(--ink); }
.ap-modal-body { overflow-y: auto; flex: 1; padding: 24px 28px; }
.ap-modal-ftr { padding: 16px 28px; border-top: 1px solid var(--sandd); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; }
.ap-chk { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.ap-chk input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--t4); margin-top: 2px; flex-shrink: 0; }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const AdminFAQs = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('order');
  const [viewMode, setViewMode] = useState('list');
  const [formData, setFormData] = useState({ question: '', answer: '', order: 0, published: true, category: '' });

  useEffect(() => { loadFaqs(); }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && showForm) handleCancel(); };
    if (showForm) { document.addEventListener('keydown', handleEsc); document.body.style.overflow = 'hidden'; }
    return () => { document.removeEventListener('keydown', handleEsc); document.body.style.overflow = 'unset'; };
  }, [showForm]);

  const loadFaqs = async () => {
    try {
      setLoading(true);
      const result = await adminListFaqs();
      if (result.error) setError(result.error);
      else setFaqs(result.items || []);
    } catch { setError('Failed to load FAQs'); }
    finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const result = editingId ? await adminUpdateFaq(editingId, formData) : await adminCreateFaq(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(editingId ? 'FAQ updated successfully!' : 'FAQ created successfully!');
        setShowForm(false); setEditingId(null);
        setFormData({ question: '', answer: '', order: 0, published: true, category: '' });
        loadFaqs();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch { setError('Failed to save FAQ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      const result = await adminDeleteFaq(id);
      if (result.error) setError(result.error);
      else { setSuccess('FAQ deleted successfully!'); loadFaqs(); setTimeout(() => setSuccess(''), 3000); }
    } catch { setError('Failed to delete FAQ'); }
  };

  const handleEdit = (faq) => {
    setEditingId(faq._id);
    setFormData({ question: faq.question || '', answer: faq.answer || '', order: faq.order || 0, published: faq.published || false, category: faq.category || '' });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false); setEditingId(null);
    setFormData({ question: '', answer: '', order: 0, published: true, category: '' });
    setError('');
  };

  const getNextOrder = () => Math.max(...faqs.map(f => f.order || 0), 0) + 1;

  const filteredFaqs = faqs.filter(faq => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || faq.question?.toLowerCase().includes(q) || faq.answer?.toLowerCase().includes(q) || faq.category?.toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'published' && faq.published) || (filterStatus === 'draft' && !faq.published);
    return matchesSearch && matchesStatus;
  });

  const sortedFaqs = [...filteredFaqs].sort((a, b) => {
    if (sortBy === 'order') return (a.order || 0) - (b.order || 0);
    if (sortBy === 'date') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === 'question') return (a.question || '').localeCompare(b.question || '');
    return 0;
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  const EditIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );

  const TrashIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '80px', borderRadius: 'var(--r)' }} />
          {[1,2,3,4].map(i => <div key={i} className="ap-sk" style={{ height: '100px', borderRadius: 'var(--r)' }} />)}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ background: 'var(--t9)', borderRadius: 'var(--r)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>FAQ Management</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>Create and manage frequently asked questions</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{faqs.length}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Total FAQs</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {[
            { icon: '✅', label: 'Published', val: faqs.filter(f => f.published).length },
            { icon: '✏️', label: 'Drafts', val: faqs.filter(f => !f.published).length },
            { icon: '🏷️', label: 'Categories', val: new Set(faqs.map(f => f.category).filter(Boolean)).size },
            { icon: '📏', label: 'Avg. Length', val: faqs.length > 0 ? Math.round(faqs.reduce((acc, f) => acc + (f.answer?.length || 0), 0) / faqs.length) : 0 },
          ].map(({ icon, label, val }) => (
            <div key={label} className="ap-stat-card">
              <div className="ap-stat-icon">{icon}</div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink6)', marginTop: '2px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label className="ap-lbl">Search FAQs</label>
              <input
                type="text"
                placeholder="Search by question, answer, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ap-inp"
              />
            </div>
            <div>
              <label className="ap-lbl">Filter by Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="ap-sel">
                <option value="all">All Status</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">Sort by</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ap-sel">
                <option value="order">Display Order</option>
                <option value="date">Date Created</option>
                <option value="question">Question A-Z</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">View</label>
              <div style={{ display: 'flex' }}>
                <button onClick={() => setViewMode('list')} className={`ap-vt-btn${viewMode === 'list' ? ' ap-vt-btn-active' : ''}`} title="List view">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button onClick={() => setViewMode('grid')} className={`ap-vt-btn${viewMode === 'grid' ? ' ap-vt-btn-active' : ''}`} title="Grid view">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {success && <div className="ap-ok">{success}</div>}
        {error && <div className="ap-err">{error}</div>}

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--ink6)' }}>Showing {sortedFaqs.length} of {faqs.length} FAQs</span>
          <button
            onClick={() => { setFormData(prev => ({ ...prev, order: getNextOrder() })); setShowForm(true); }}
            className="ap-btn-p"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add New FAQ
          </button>
        </div>

        {/* FAQ Modal Form */}
        {showForm && (
          <div className="ap-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
            <div className="ap-modal">
              <div className="ap-modal-hdr">
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
                    {editingId ? 'Edit FAQ' : 'Create New FAQ'}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink6)' }}>
                    {editingId ? 'Update the FAQ information below' : 'Fill in the details to create a new FAQ'}
                  </p>
                </div>
                <button onClick={handleCancel} className="ap-modal-close">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="ap-modal-body">
                <form id="faq-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label className="ap-lbl">Question *</label>
                      <input type="text" name="question" value={formData.question} onChange={handleInputChange} className="ap-inp" placeholder="Enter the FAQ question..." required />
                    </div>
                    <div>
                      <label className="ap-lbl">Category</label>
                      <input type="text" name="category" value={formData.category} onChange={handleInputChange} className="ap-inp" placeholder="e.g., General, Billing, Technical" />
                    </div>
                  </div>
                  <div>
                    <label className="ap-lbl">Answer *</label>
                    <textarea name="answer" value={formData.answer} onChange={handleInputChange} rows={8} className="ap-textarea" placeholder="Provide a detailed answer..." required />
                    <p style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>{formData.answer.length} characters</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <label className="ap-lbl">Display Order</label>
                      <input type="number" name="order" value={formData.order} onChange={handleInputChange} min="0" className="ap-inp" />
                      <p style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '4px' }}>Lower numbers appear first</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: '8px' }}>
                      <label className="ap-chk">
                        <input type="checkbox" name="published" checked={formData.published} onChange={handleInputChange} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Published</div>
                          <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Make this FAQ visible to users</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </form>
              </div>
              <div className="ap-modal-ftr">
                <button type="button" onClick={handleCancel} className="ap-btn-s">Cancel</button>
                <button type="submit" form="faq-form" className="ap-btn-p">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {editingId ? 'Update FAQ' : 'Create FAQ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQs */}
        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {sortedFaqs.map((faq) => (
              <div key={faq._id} className="ap-faq-card">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  <span className="pill pill-t">#{faq.order || 0}</span>
                  <span className={`pill ${faq.published ? 'pill-g' : 'pill-gr'}`}>{faq.published ? 'Published' : 'Draft'}</span>
                  {faq.category && <span className="pill pill-y">{faq.category}</span>}
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{faq.question}</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink6)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap' }}>{faq.answer}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--sandd)' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleEdit(faq)} className="ap-btn-edit-sm" title="Edit"><EditIcon /></button>
                    <button onClick={() => handleDelete(faq._id)} className="ap-btn-danger-sm" title="Delete"><TrashIcon /></button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>{faq.answer?.length || 0} chars</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedFaqs.map((faq) => (
              <div key={faq._id} className="ap-faq-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      <span className="pill pill-t">#{faq.order || 0}</span>
                      <span className={`pill ${faq.published ? 'pill-g' : 'pill-gr'}`}>{faq.published ? 'Published' : 'Draft'}</span>
                      {faq.category && <span className="pill pill-y">{faq.category}</span>}
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>{faq.question}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--ink6)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{faq.answer}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => handleEdit(faq)} className="ap-btn-edit-sm" title="Edit"><EditIcon /></button>
                    <button onClick={() => handleDelete(faq._id)} className="ap-btn-danger-sm" title="Delete"><TrashIcon /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--sandd)', fontSize: '11px', color: 'var(--ink3)' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span>Created: {formatDate(faq.createdAt)}</span>
                    {faq.updatedAt && faq.updatedAt !== faq.createdAt && <span>Updated: {formatDate(faq.updatedAt)}</span>}
                  </div>
                  <span>{faq.answer?.length || 0} characters</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedFaqs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>No FAQs found</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink6)', marginBottom: '20px' }}>
              {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters.' : 'Get started by creating your first FAQ.'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button onClick={() => { setFormData(prev => ({ ...prev, order: getNextOrder() })); setShowForm(true); }} className="ap-btn-p">
                Create Your First FAQ
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminFAQs;
