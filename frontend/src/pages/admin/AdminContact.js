import React, { useState, useEffect } from 'react';
import { adminListContact, adminUpdateContact, adminDeleteContact } from '../../api';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-btn-green { background: #16a34a; color: #fff; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s; }
.ap-btn-green:hover { background: #15803d; }
.ap-btn-gray { background: #6b7280; color: #fff; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s; }
.ap-btn-gray:hover { background: #4b5563; }
.ap-btn-danger { background: #ef4444; color: #fff; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s; }
.ap-btn-danger:hover { background: #dc2626; }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-g { background: #dcfce7; color: #166534; }
.pill-gr { background: #f3f4f6; color: #374151; }
.ap-msg { background: var(--sand); border-radius: 10px; padding: 16px; font-size: 13px; color: var(--ink); white-space: pre-wrap; }
.ap-spin { animation: ap-spin-kf 0.7s linear infinite; }
@keyframes ap-spin-kf { to { transform: rotate(360deg); } }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const AdminContact = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [statusFilter]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const result = await adminListContact(params);
      let items = result.items || [];
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        items = items.filter(contact =>
          (contact.name || '').toLowerCase().includes(query) ||
          (contact.email || '').toLowerCase().includes(query) ||
          (contact.subject || '').toLowerCase().includes(query) ||
          (contact.message || '').toLowerCase().includes(query)
        );
      }
      setContacts(items);
    } catch (err) {
      setError('Failed to load contact messages');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const result = await adminUpdateContact(id, { status: newStatus });
      if (result.error) { alert(`Error: ${result.error}`); }
      else { loadContacts(); }
    } catch (err) {
      alert('Failed to update contact status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contact message?')) return;
    try {
      const result = await adminDeleteContact(id);
      if (result.error) { alert(`Error: ${result.error}`); }
      else { loadContacts(); }
    } catch (err) {
      alert('Failed to delete contact message');
    }
  };

  const getStatusPill = (status) => {
    if (status === 'new') return <span className="pill pill-t">New</span>;
    if (status === 'read') return <span className="pill pill-g">Read</span>;
    return <span className="pill pill-gr">{status || 'unknown'}</span>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const groupedContacts = contacts.reduce((groups, contact) => {
    const status = contact.status || 'new';
    if (!groups[status]) groups[status] = [];
    groups[status].push(contact);
    return groups;
  }, {});

  const statusOrder = ['new', 'read', 'closed'];
  const sortedGroups = statusOrder.filter(status => groupedContacts[status]);

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '200px' }} />
          {[1, 2, 3].map(i => (
            <div key={i} className="ap-card" style={{ padding: '24px' }}>
              <div className="ap-sk" style={{ height: '16px', width: '60%', marginBottom: '8px' }} />
              <div className="ap-sk" style={{ height: '12px', width: '40%' }} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 className="ap-h1">Contact Messages</h1>
            <p className="ap-sub">Manage customer inquiries and support requests</p>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="ap-btn-p">
            {refreshing ? (
              <>
                <svg className="ap-spin" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" style={{ opacity: 0.25 }} />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" stroke="none" style={{ opacity: 0.75 }} />
                </svg>
                Refreshing...
              </>
            ) : 'Refresh'}
          </button>
        </div>

        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <input
              type="text"
              placeholder="Search by name, email, subject, or message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ap-inp"
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ap-sel">
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="read">Read</option>
              <option value="closed">Closed</option>
            </select>
            <button onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} className="ap-btn-s">
              Clear Filters
            </button>
          </div>
        </div>

        {error && <div className="ap-err">{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {sortedGroups.length > 0 ? (
            sortedGroups.map(status => (
              <div key={status} className="ap-card">
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sandd)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: status === 'new' ? 'var(--t4)' : status === 'read' ? '#16a34a' : '#9ca3af',
                  }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
                    {status} ({groupedContacts[status].length})
                  </h3>
                </div>
                <div>
                  {groupedContacts[status].map((contact, idx) => (
                    <div key={contact._id} style={{
                      padding: '20px 24px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--sandd)',
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>{contact.subject || 'No Subject'}</span>
                            {getStatusPill(contact.status)}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--ink6)', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
                            <span><strong>From:</strong> {contact.name || 'Anonymous'} ({contact.email || 'No email'})</span>
                            <span><strong>Date:</strong> {formatDate(contact.createdAt)}</span>
                          </div>
                          <div className="ap-msg">{contact.message}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                          {contact.status === 'new' && (
                            <button onClick={() => handleStatusUpdate(contact._id, 'read')} className="ap-btn-green">Mark Read</button>
                          )}
                          {contact.status !== 'closed' && (
                            <button onClick={() => handleStatusUpdate(contact._id, 'closed')} className="ap-btn-gray">Close</button>
                          )}
                          <button onClick={() => handleDelete(contact._id)} className="ap-btn-danger">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink6)' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>No contact messages</p>
              <p style={{ fontSize: '13px' }}>No contact messages found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminContact;
