import React, { useEffect, useState } from 'react';
import { adminListFaqs, adminCreateFaq, adminDeleteFaq } from '../api';

const STYLES = `
.apanel-bg { min-height: 100vh; background: var(--t9); padding: 96px 24px 60px; }
.apanel-card { max-width: 800px; margin: 0 auto; background: var(--surface); border-radius: var(--r); padding: 32px; }
.apanel-h { font-family: var(--ffd); font-size: 22px; font-weight: 700; color: var(--t9); margin-bottom: 24px; }
.apanel-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
.apanel-row { display: flex; gap: 12px; flex-wrap: wrap; }
.apanel-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.apanel-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--sandd); border-radius: 10px; }
.apanel-item-lbl { font-size: 16px; color: var(--ink); }
.apanel-del { font-size: 16px; font-weight: 600; color: var(--coral); background: none; border: 1px solid var(--coral); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.apanel-del:hover { background: var(--coral); color: #fff; }
`;

const AdminFaqs = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ question: '', answer: '', order: 0, published: true });
  const [error, setError] = useState('');

  const load = async () => {
    const res = await adminListFaqs();
    if (res.error) setError(res.error); else setItems(res.items || []);
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    const res = await adminCreateFaq({ ...form, order: Number(form.order) || 0 });
    if (res.error) setError(res.error);
    else { setForm({ question: '', answer: '', order: 0, published: true }); load(); }
  };

  const onDelete = async (id) => {
    const res = await adminDeleteFaq(id);
    if (res.error) setError(res.error); else load();
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="apanel-bg">
        <div className="apanel-card">
          <h1 className="apanel-h">Manage FAQs</h1>
          {error && <p style={{ fontSize: '16px', color: 'var(--coral)', marginBottom: '12px' }}>{error}</p>}
          <form onSubmit={onCreate} className="apanel-form">
            <div className="apanel-row">
              <input className="ss-input" placeholder="Question" value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} style={{ flex: 3 }} />
              <input className="ss-input" type="number" placeholder="Order" value={form.order} onChange={e => setForm({ ...form, order: e.target.value })} style={{ flex: 1, minWidth: '80px' }} />
            </div>
            <textarea className="ss-input" placeholder="Answer" value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={4} style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} /> Published
              </label>
              <button type="submit" className="btn btn-d">Create FAQ</button>
            </div>
          </form>
          <ul className="apanel-list">
            {items.map(i => (
              <li key={i._id} className="apanel-item">
                <span className="apanel-item-lbl"><strong>#{i.order}</strong> {i.question} {i.published ? '✅' : '⏸️'}</span>
                <button className="apanel-del" onClick={() => { if (window.confirm('Delete this FAQ?')) onDelete(i._id); }}>Delete</button>
              </li>
            ))}
            {items.length === 0 && <li style={{ fontSize: '16px', color: 'var(--ink6)' }}>No FAQs yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
};

export default AdminFaqs;
