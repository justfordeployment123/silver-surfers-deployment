import React, { useEffect, useState } from 'react';
import { adminListBlog, adminCreateBlog, adminDeleteBlog } from '../api';

const STYLES = `
.apanel-bg { min-height: 100vh; background: var(--t9); padding: 96px 24px 60px; }
.apanel-card { max-width: 800px; margin: 0 auto; background: var(--surface); border-radius: var(--r); padding: 32px; }
.apanel-h { font-family: var(--ffd); font-size: 22px; font-weight: 700; color: var(--t9); margin-bottom: 24px; }
.apanel-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
.apanel-row { display: flex; gap: 12px; flex-wrap: wrap; }
.apanel-row input { flex: 1; min-width: 160px; }
.apanel-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.apanel-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--sandd); border-radius: 10px; }
.apanel-item-lbl { font-size: 14px; color: var(--ink); }
.apanel-del { font-size: 12px; font-weight: 600; color: var(--coral); background: none; border: 1px solid var(--coral); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.apanel-del:hover { background: var(--coral); color: #fff; }
`;

const AdminBlog = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', content: '', published: false });
  const [error, setError] = useState('');

  const load = async () => {
    const res = await adminListBlog();
    if (res.error) setError(res.error); else setItems(res.items || []);
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    const res = await adminCreateBlog(form);
    if (res.error) setError(res.error);
    else { setForm({ title: '', slug: '', excerpt: '', content: '', published: false }); load(); }
  };

  const onDelete = async (id) => {
    const res = await adminDeleteBlog(id);
    if (res.error) setError(res.error); else load();
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="apanel-bg">
        <div className="apanel-card">
          <h1 className="apanel-h">Manage Blog</h1>
          {error && <p style={{ fontSize: '13px', color: 'var(--coral)', marginBottom: '12px' }}>{error}</p>}
          <form onSubmit={onCreate} className="apanel-form">
            <div className="apanel-row">
              <input className="ss-input" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <input className="ss-input" placeholder="Slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
            </div>
            <input className="ss-input" placeholder="Excerpt" value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} />
            <textarea className="ss-input" placeholder="Content" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={6} style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} /> Published
              </label>
              <button type="submit" className="btn btn-d">Create Post</button>
            </div>
          </form>
          <ul className="apanel-list">
            {items.map(i => (
              <li key={i._id} className="apanel-item">
                <span className="apanel-item-lbl"><strong>{i.title}</strong> <span style={{ color: 'var(--ink6)', fontSize: '12px' }}>({i.slug})</span> {i.published ? '✅' : '⏸️'}</span>
                <button className="apanel-del" onClick={() => { if (window.confirm('Delete this post?')) onDelete(i._id); }}>Delete</button>
              </li>
            ))}
            {items.length === 0 && <li style={{ fontSize: '13px', color: 'var(--ink6)' }}>No posts yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
};

export default AdminBlog;
