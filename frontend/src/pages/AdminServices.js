import React, { useEffect, useState } from 'react';
import { adminListServices, adminCreateService, adminDeleteService } from '../api';

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

const AdminServices = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', slug: '', description: '', priceCents: 0, active: true });
  const [error, setError] = useState('');

  const load = async () => {
    const res = await adminListServices();
    if (res.error) setError(res.error); else setItems(res.items || []);
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    const res = await adminCreateService({ ...form, priceCents: Number(form.priceCents) || 0 });
    if (res.error) setError(res.error);
    else { setForm({ name: '', slug: '', description: '', priceCents: 0, active: true }); load(); }
  };

  const onDelete = async (id) => {
    const res = await adminDeleteService(id);
    if (res.error) setError(res.error); else load();
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="apanel-bg">
        <div className="apanel-card">
          <h1 className="apanel-h">Manage Services</h1>
          {error && <p style={{ fontSize: '16px', color: 'var(--coral)', marginBottom: '12px' }}>{error}</p>}
          <form onSubmit={onCreate} className="apanel-form">
            <div className="apanel-row">
              <input className="ss-input" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="ss-input" placeholder="Slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
              <input className="ss-input" type="number" placeholder="Price (cents)" value={form.priceCents} onChange={e => setForm({ ...form, priceCents: e.target.value })} style={{ maxWidth: '160px' }} />
            </div>
            <textarea className="ss-input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
              </label>
              <button type="submit" className="btn btn-d">Create Service</button>
            </div>
          </form>
          <ul className="apanel-list">
            {items.map(i => (
              <li key={i._id} className="apanel-item">
                <span className="apanel-item-lbl">
                  <strong>{i.name}</strong> <span style={{ color: 'var(--ink6)', fontSize: '16px' }}>({i.slug})</span> — €{(i.priceCents / 100).toFixed(2)} {i.active ? '✅' : '⏸️'}
                </span>
                <button className="apanel-del" onClick={() => { if (window.confirm('Delete this service?')) onDelete(i._id); }}>Delete</button>
              </li>
            ))}
            {items.length === 0 && <li style={{ fontSize: '16px', color: 'var(--ink6)' }}>No services yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
};

export default AdminServices;
