'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGrantCourseAccess, adminListCourseAccess, adminRevokeCourseAccess } from '../../lib/apiClient';

// Milestone 3.2 Developer Plan, Module 5. Grant or revoke a course by email
// for buyers who checked out with a different email, refunds and comps.
// Uses the acm-* styles defined on the Course Management page.
const SOURCE_LABELS = { stripe: 'Stripe', ghl: 'GHL', admin: 'Admin' };
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export default function CourseAccessPanel({ courseId }) {
  const [access, setAccess] = useState({ owners: [], pending: [] });
  const [email, setEmail] = useState('');
  const [item, setItem] = useState('course');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const result = await adminListCourseAccess(courseId);
    if (result.error) setMessage({ type: 'error', text: result.error });
    else setAccess({ owners: result.owners || [], pending: result.pending || [] });
  }, [courseId]);

  useEffect(() => { setMessage(null); load(); }, [load]);

  const grant = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage(null);
    const result = await adminGrantCourseAccess(courseId, email.trim(), item);
    setBusy(false);
    if (result.error) { setMessage({ type: 'error', text: result.error }); return; }
    setMessage({
      type: 'success',
      text: result.status === 'granted'
        ? `Access granted to ${email.trim()}.`
        : `${email.trim()} has no verified account yet. Access will unlock when they sign up and verify with this email.`,
    });
    setEmail('');
    await load();
  };

  const revoke = async (targetEmail) => {
    if (!window.confirm(`Remove access to this course for ${targetEmail}? Their progress is kept if access is granted again.`)) return;
    setBusy(true); setMessage(null);
    const result = await adminRevokeCourseAccess(courseId, targetEmail);
    setBusy(false);
    if (result.error) { setMessage({ type: 'error', text: result.error }); return; }
    setMessage({ type: 'success', text: `Access removed for ${targetEmail}.` });
    await load();
  };

  return (
    <section className="acm-card" aria-labelledby="course-access-title">
      <h2 id="course-access-title" style={{ fontFamily: 'var(--ffd)', fontSize: 21, color: 'var(--ink)', margin: '0 0 8px' }}>Customer access</h2>
      <p className="acm-copy" style={{ marginBottom: 16 }}>Grant this course to a buyer who checked out with a different email, or remove access after a refund.</p>
      {message && <div role="status" className={`acm-status acm-${message.type}`}>{message.text}</div>}
      <form className="acm-row" onSubmit={grant} style={{ marginBottom: 20 }}>
        <div className="acm-field"><label htmlFor="access-email">Customer email</label><input id="access-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="buyer@example.com" /></div>
        <div className="acm-field" style={{ flex: '0 0 180px' }}><label htmlFor="access-item">Grant</label><select id="access-item" className="acm-select" value={item} onChange={(e) => setItem(e.target.value)}><option value="course">Course</option><option value="workbook">Workbook</option></select></div>
        <button type="submit" className="acm-btn acm-primary" disabled={busy || !email.trim()}>Grant access</button>
      </form>

      <h3 style={{ fontSize: 17, color: 'var(--ink)', margin: '0 0 10px' }}>Customers with access ({access.owners.length})</h3>
      {access.owners.length === 0 ? <p className="acm-copy" style={{ marginBottom: 16 }}>No one has access yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}>
          {access.owners.map((owner) => (
            <li key={owner.purchaseId} className="acm-row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{owner.email} <small>· {SOURCE_LABELS[owner.source] || owner.source} · {formatDate(owner.purchasedAt)}{owner.addons?.includes('workbook') ? ' · Workbook' : ''}</small></span>
              <button type="button" className="acm-btn acm-danger" disabled={busy} onClick={() => revoke(owner.email)}>Remove access</button>
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ fontSize: 17, color: 'var(--ink)', margin: '0 0 10px' }}>Waiting for sign-up ({access.pending.length})</h3>
      {access.pending.length === 0 ? <p className="acm-copy">No unclaimed purchases.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {access.pending.map((grant) => (
            <li key={grant.id} className="acm-row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{grant.email} <small>· {grant.item === 'workbook' ? 'Workbook' : 'Course'} · {SOURCE_LABELS[grant.source] || grant.source} · {formatDate(grant.createdAt)}</small></span>
              <button type="button" className="acm-btn acm-danger" disabled={busy} onClick={() => revoke(grant.email)}>Cancel</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
