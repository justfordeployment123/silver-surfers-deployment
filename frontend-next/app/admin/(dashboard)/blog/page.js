'use client';

// Ported from frontend/src/pages/admin/AdminBlog.js.
import { useState, useEffect, useRef } from 'react';
import { adminListBlog, adminCreateBlog, adminDeleteBlog, adminUpdateBlog } from '../../../../lib/apiClient';
import RichTextEditor from '../../../../components/RichTextEditor';
import { IconCheckCircle, IconPencil, IconStar, IconTag, IconBolt } from '../../../../components/admin/AdminIcons';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 16px; color: var(--ink6); }
.ap-lbl { font-size: 16px; font-weight: 500; color: var(--ink6); margin-bottom: 6px; display: block; }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 10px 14px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(10,168,143,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t6); color: #fff; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-btn-danger-sm { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: color .15s, background .15s; }
.ap-btn-danger-sm:hover { color: #ef4444; background: #fee2e2; }
.ap-btn-edit-sm { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: color .15s, background .15s; }
.ap-btn-edit-sm:hover { color: var(--t4); background: var(--t05); }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 16px; color: #991b1b; }
.ap-ok { background: #dcfce7; border: 1px solid #86efac; border-radius: var(--r); padding: 12px 16px; font-size: 16px; color: #166534; }
.ap-stat-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
.ap-stat-icon { width: 38px; height: 38px; border-radius: 8px; background: var(--t05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--t6); }
.ap-blog-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 20px; transition: box-shadow .15s; }
.ap-blog-card:hover { box-shadow: 0 4px 16px rgba(16,47,69,0.08); }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 16px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-gr { background: #f3f4f6; color: #374151; }
.pill-a { background: #fef3c7; color: #92400e; }
.pill-t { background: var(--t05); color: var(--t6); }
.ap-vt-btn { border: 1px solid var(--sandd); background: var(--surface); cursor: pointer; padding: 8px 10px; color: var(--ink6); transition: background .15s, color .15s; display: flex; align-items: center; }
.ap-vt-btn:first-child { border-radius: 8px 0 0 8px; border-right: none; }
.ap-vt-btn:last-child { border-radius: 0 8px 8px 0; }
.ap-vt-btn-active { background: var(--t6); color: #fff; border-color: var(--t4); }
.ap-vt-btn:not(.ap-vt-btn-active):hover { background: var(--sand); }
.ap-modal-overlay { position: fixed; inset: 0; background: rgba(16,47,69,0.45); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
.ap-modal { background: var(--surface); border-radius: var(--rl); width: 100%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
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

const getEmptyFormData = () => ({
  title: '', slug: '', excerpt: '', content: '', category: '',
  author: '', date: '', readTime: '', featured: false, published: false
});

export default function AdminBlog() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [viewMode, setViewMode] = useState('grid');
  const [formData, setFormData] = useState(getEmptyFormData());
  const [initialFormData, setInitialFormData] = useState(getEmptyFormData());
  const [formError, setFormError] = useState('');
  const modalContentRef = useRef(null);

  const hasUnsavedChanges = () => JSON.stringify(formData) !== JSON.stringify(initialFormData);

  useEffect(() => { loadBlogs(); }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && showForm) handleCancel(); };
    if (showForm) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => { document.removeEventListener('keydown', handleEsc); document.body.style.overflow = 'unset'; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  useEffect(() => {
    if (formError && modalContentRef.current) modalContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [formError]);

  const loadBlogs = async () => {
    try {
      setLoading(true);
      const result = await adminListBlog();
      if (result.error) setError(result.error);
      else setBlogs(result.items || []);
    } catch { setError('Failed to load blog posts'); }
    finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleTitleChange = (e) => {
    const title = e.target.value;
    setFormData(prev => ({ ...prev, title, slug: prev.slug || generateSlug(title) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setFormError('');
    try {
      const payload = { ...formData };
      if (payload.date) payload.date = new Date(payload.date).toISOString();
      const result = editingId ? await adminUpdateBlog(editingId, payload) : await adminCreateBlog(payload);
      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccess(editingId ? 'Blog post updated successfully!' : 'Blog post created successfully!');
        setShowForm(false); setEditingId(null);
        const empty = getEmptyFormData();
        setFormData(empty); setInitialFormData(empty); setFormError('');
        loadBlogs();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch { setFormError('Failed to save blog post'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this blog post?')) return;
    try {
      const result = await adminDeleteBlog(id);
      if (result.error) setError(result.error);
      else { setSuccess('Blog post deleted successfully!'); loadBlogs(); setTimeout(() => setSuccess(''), 3000); }
    } catch { setError('Failed to delete blog post'); }
  };

  const handleEdit = (blog) => {
    const data = {
      title: blog.title || '', slug: blog.slug || '', excerpt: blog.excerpt || '',
      content: blog.content || '', category: blog.category || '', author: blog.author || '',
      date: blog.date ? new Date(blog.date).toISOString().slice(0, 10) : '',
      readTime: blog.readTime || '', featured: blog.featured || false, published: blog.published || false
    };
    setEditingId(blog._id); setFormData(data); setInitialFormData(data); setFormError(''); setShowForm(true);
  };

  const handleCancel = () => {
    if (hasUnsavedChanges() && !window.confirm('You have unsaved changes. Discard them?')) return;
    const empty = getEmptyFormData();
    setShowForm(false); setEditingId(null); setFormData(empty); setInitialFormData(empty);
    setFormError(''); setError('');
  };

  const handleOpenCreate = () => {
    const empty = getEmptyFormData();
    setEditingId(null); setFormData(empty); setInitialFormData(empty); setFormError(''); setShowForm(true);
  };

  const generateSlug = (title) =>
    title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  const getCategories = () => [...new Set(blogs.map(b => b.category).filter(Boolean))];

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  const filteredBlogs = blogs.filter(blog => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || blog.title?.toLowerCase().includes(q) || blog.slug?.toLowerCase().includes(q) ||
      blog.category?.toLowerCase().includes(q) || blog.author?.toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'published' && blog.published) ||
      (filterStatus === 'draft' && !blog.published) ||
      (filterStatus === 'featured' && blog.featured);
    const matchesCategory = filterCategory === 'all' || blog.category === filterCategory;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const sortedBlogs = [...filteredBlogs].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
    if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
    return 0;
  });

  const EditIcon = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );

  const TrashIcon = ({ size = 16 }) => (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '80px', borderRadius: 'var(--r)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[1,2,3,4,5].map(i => <div key={i} className="ap-sk" style={{ height: '80px', borderRadius: 'var(--r)' }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {[1,2,3,4,5,6].map(i => <div key={i} className="ap-sk" style={{ height: '160px', borderRadius: 'var(--r)' }} />)}
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
        <div style={{ background: 'var(--t9)', borderRadius: 'var(--r)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Blog Management</h1>
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>Create and manage blog posts</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{blogs.length}</div>
            <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>Total Posts</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {[
            { icon: IconCheckCircle, label: 'Published', val: blogs.filter(b => b.published).length },
            { icon: IconPencil, label: 'Drafts', val: blogs.filter(b => !b.published).length },
            { icon: IconStar, label: 'Featured', val: blogs.filter(b => b.featured).length },
            { icon: IconTag, label: 'Categories', val: getCategories().length },
            { icon: IconBolt, label: 'Avg. Words', val: blogs.length > 0 ? Math.round(blogs.reduce((acc, b) => acc + (b.content?.split(' ').length || 0), 0) / blogs.length) : 0 },
          ].map(({ icon: StatIcon, label, val }) => (
            <div key={label} className="ap-stat-card">
              <div className="ap-stat-icon"><StatIcon size={18} /></div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: '16px', color: 'var(--ink6)', marginTop: '2px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label className="ap-lbl">Search Posts</label>
              <input
                type="text"
                placeholder="Search by title, slug, category, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ap-inp"
              />
            </div>
            <div>
              <label className="ap-lbl">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="ap-sel">
                <option value="all">All Status</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
                <option value="featured">Featured</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">Category</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="ap-sel">
                <option value="all">All Categories</option>
                {getCategories().map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="ap-lbl">Sort by</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ap-sel">
                <option value="date">Date</option>
                <option value="title">Title A-Z</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">View</label>
              <div style={{ display: 'flex' }}>
                <button onClick={() => setViewMode('grid')} className={`ap-vt-btn${viewMode === 'grid' ? ' ap-vt-btn-active' : ''}`} title="Grid view">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button onClick={() => setViewMode('list')} className={`ap-vt-btn${viewMode === 'list' ? ' ap-vt-btn-active' : ''}`} title="List view">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
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
          <span style={{ fontSize: '16px', color: 'var(--ink6)' }}>Showing {sortedBlogs.length} of {blogs.length} posts</span>
          <button onClick={handleOpenCreate} className="ap-btn-p">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create New Post
          </button>
        </div>

        {/* Blog Modal Form */}
        {showForm && (
          <div className="ap-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
            <div className="ap-modal" ref={modalContentRef}>
              <div className="ap-modal-hdr">
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
                    {editingId ? 'Edit Blog Post' : 'Create New Blog Post'}
                  </h3>
                  <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>
                    {editingId ? 'Update the blog post information below' : 'Fill in the details to create a new blog post'}
                  </p>
                </div>
                <button onClick={handleCancel} className="ap-modal-close">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {formError && <div style={{ padding: '12px 28px 0' }}><div className="ap-err">{formError}</div></div>}

              <div className="ap-modal-body">
                <form id="blog-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label className="ap-lbl">Title *</label>
                      <input type="text" name="title" value={formData.title} onChange={handleTitleChange} className="ap-inp" placeholder="Enter blog post title..." required />
                    </div>
                    <div>
                      <label className="ap-lbl">Slug *</label>
                      <input type="text" name="slug" value={formData.slug} onChange={handleInputChange} className="ap-inp" placeholder="url-friendly-slug" required />
                      <p style={{ fontSize: '16px', color: 'var(--ink3)', marginTop: '4px' }}>URL: /blog/{formData.slug}</p>
                    </div>
                  </div>

                  <div>
                    <label className="ap-lbl">Excerpt</label>
                    <RichTextEditor
                      value={formData.excerpt}
                      onChange={(value) => setFormData(prev => ({ ...prev, excerpt: value }))}
                      placeholder="Brief description of the post..."
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="ap-lbl">Content *</label>
                    <RichTextEditor
                      value={formData.content}
                      onChange={(value) => setFormData(prev => ({ ...prev, content: value }))}
                      placeholder="Write your blog post content here..."
                      rows={15}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                    <div>
                      <label className="ap-lbl">Category</label>
                      <input type="text" name="category" value={formData.category} onChange={handleInputChange} className="ap-inp" placeholder="e.g., Technology" />
                    </div>
                    <div>
                      <label className="ap-lbl">Author</label>
                      <input type="text" name="author" value={formData.author} onChange={handleInputChange} className="ap-inp" placeholder="Author name" />
                    </div>
                    <div>
                      <label className="ap-lbl">Publish Date</label>
                      <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="ap-inp" />
                    </div>
                    <div>
                      <label className="ap-lbl">Read Time</label>
                      <input type="text" name="readTime" value={formData.readTime} onChange={handleInputChange} className="ap-inp" placeholder="e.g., 5 min read" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                    <label className="ap-chk">
                      <input type="checkbox" name="featured" checked={formData.featured} onChange={handleInputChange} />
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>Featured Post</div>
                        <div style={{ fontSize: '16px', color: 'var(--ink3)' }}>Highlight this post</div>
                      </div>
                    </label>
                    <label className="ap-chk">
                      <input type="checkbox" name="published" checked={formData.published} onChange={handleInputChange} />
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>Published</div>
                        <div style={{ fontSize: '16px', color: 'var(--ink3)' }}>Make this post public</div>
                      </div>
                    </label>
                  </div>
                </form>
              </div>

              <div className="ap-modal-ftr">
                <button type="button" onClick={handleCancel} className="ap-btn-s">Cancel</button>
                <button type="submit" form="blog-form" className="ap-btn-p">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {editingId ? 'Update Post' : 'Create Post'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Blog Posts - Grid */}
        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {sortedBlogs.map((blog) => (
              <div key={blog._id} className="ap-blog-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{blog.title}</h3>
                    <p style={{ fontSize: '16px', color: 'var(--ink6)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{blog.excerpt}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => handleEdit(blog)} className="ap-btn-edit-sm" title="Edit"><EditIcon /></button>
                    <button onClick={() => handleDelete(blog._id)} className="ap-btn-danger-sm" title="Delete"><TrashIcon /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  <span className={`pill ${blog.published ? 'pill-g' : 'pill-gr'}`}>{blog.published ? 'Published' : 'Draft'}</span>
                  {blog.featured && <span className="pill pill-a">Featured</span>}
                  {blog.category && <span className="pill pill-t">{blog.category}</span>}
                </div>
                <div style={{ fontSize: '16px', color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>Slug: {blog.slug}</span>
                  {blog.author && <span>Author: {blog.author}</span>}
                  {blog.date && <span>Date: {formatDate(blog.date)}</span>}
                  <span>Words: {blog.content?.split(' ').filter(w => w.length > 0).length || 0}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedBlogs.map((blog) => (
              <div key={blog._id} className="ap-blog-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>{blog.title}</h3>
                    <span className={`pill ${blog.published ? 'pill-g' : 'pill-gr'}`}>{blog.published ? 'Published' : 'Draft'}</span>
                    {blog.featured && <span className="pill pill-a">Featured</span>}
                  </div>
                  <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '8px' }}>{blog.excerpt}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '16px', color: 'var(--ink3)' }}>
                    {blog.category && <span>Category: {blog.category}</span>}
                    {blog.author && <span>Author: {blog.author}</span>}
                    {blog.date && <span>Date: {formatDate(blog.date)}</span>}
                    <span>{blog.content?.split(' ').filter(w => w.length > 0).length || 0} words</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => handleEdit(blog)} className="ap-btn-edit-sm" title="Edit"><EditIcon /></button>
                  <button onClick={() => handleDelete(blog._id)} className="ap-btn-danger-sm" title="Delete"><TrashIcon size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {sortedBlogs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>No blog posts found</h3>
            <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '20px' }}>
              {searchQuery || filterStatus !== 'all' || filterCategory !== 'all' ? 'Try adjusting your search or filters.' : 'Get started by creating your first blog post.'}
            </p>
            {!searchQuery && filterStatus === 'all' && filterCategory === 'all' && (
              <button onClick={handleOpenCreate} className="ap-btn-p">Create Your First Post</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
