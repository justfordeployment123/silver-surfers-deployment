import React, { useState, useEffect } from 'react';
import { adminListUsers, adminResetUserUsage, adminUpdateUserSubscription, adminUpdateUserRole, adminUpdateUserStatus, adminToggleInternalFlag } from '../../api';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-lbl { font-size: 13px; font-weight: 500; color: var(--ink6); margin-bottom: 6px; display: block; }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.ap-ok { background: #dcfce7; border: 1px solid #86efac; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #166534; }
.ap-stat-mini { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); padding: 14px 18px; }
.ap-stat-mini-val { font-size: 22px; font-weight: 700; color: var(--t4); line-height: 1; }
.ap-stat-mini-lbl { font-size: 12px; color: var(--ink6); margin-top: 3px; }
.ap-tbl { width: 100%; border-collapse: collapse; }
.ap-tbl thead { background: var(--sand); }
.ap-tbl th { padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.ap-tbl td { padding: 12px 16px; font-size: 13px; color: var(--ink); border-top: 1px solid var(--sandd); }
.ap-tbl tr:hover td { background: var(--sand); }
.ap-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--t05); border: 1px solid var(--t1); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: var(--t6); flex-shrink: 0; }
.ap-link-btn { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--t4); padding: 0; transition: color .15s; }
.ap-link-btn:hover { color: var(--t8); }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-r { background: #fee2e2; color: #991b1b; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-a { background: #fef3c7; color: #92400e; }
.pill-gr { background: #f3f4f6; color: #374151; }
.pill-o { background: #ffedd5; color: #9a3412; }
.ap-modal-overlay { position: fixed; inset: 0; background: rgba(4,46,34,0.45); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; }
.ap-modal { background: var(--surface); border-radius: var(--rl); width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
.ap-modal-sm { background: var(--surface); border-radius: var(--rl); width: 100%; max-width: 440px; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
.ap-modal-hdr { padding: 20px 24px; border-bottom: 1px solid var(--sandd); display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }
.ap-modal-close { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: background .15s, color .15s; }
.ap-modal-close:hover { background: var(--sand); color: var(--ink); }
.ap-modal-body { overflow-y: auto; flex: 1; padding: 20px 24px; }
.ap-action-btn { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-size: 13px; font-weight: 600; text-align: left; transition: background .15s, border-color .15s, color .15s; }
.ap-action-btn-teal { background: var(--t4); color: #fff; }
.ap-action-btn-teal:hover:not(:disabled) { background: var(--t8); }
.ap-action-btn-amber { background: var(--amberbg); color: var(--amber); }
.ap-action-btn-amber:hover:not(:disabled) { background: var(--amber); color: #fff; }
.ap-action-btn-neutral { background: var(--sand); border-color: var(--sandd); color: var(--ink); }
.ap-action-btn-neutral:hover:not(:disabled) { background: var(--sandd); }
.ap-action-btn-danger { background: var(--coralbg); color: var(--coral); }
.ap-action-btn-danger:hover:not(:disabled) { background: var(--coral); color: #fff; }
.ap-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ap-detail-lbl { font-size: 11px; font-weight: 600; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
.ap-detail-val { font-size: 14px; color: var(--ink); word-break: break-word; overflow-wrap: anywhere; }
.ap-detail-item { min-width: 0; }
.ap-section-hdr { font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--sandd); }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterSubscription, setFilterSubscription] = useState('all');
  const [filterAccountStatus, setFilterAccountStatus] = useState('all');
  const [filterInternal, setFilterInternal] = useState('external');
  const [showUserDetail, setShowUserDetail] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    loadUsers();
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.userId);
      } catch (e) {
        console.error('Failed to decode token:', e);
      }
    }
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminListUsers();
      if (response.error) {
        setError(response.error);
        setUsers([]);
      } else {
        setUsers(response.users || []);
      }
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesSubscription = filterSubscription === 'all' ||
      (filterSubscription === 'active' && user.subscription?.status === 'active') ||
      (filterSubscription === 'none' && !user.subscription);
    const matchesAccountStatus = filterAccountStatus === 'all' || String(user.accountStatus || 'active') === filterAccountStatus;
    const matchesInternal = filterInternal === 'all' ||
      (filterInternal === 'external' && !user.isInternal) ||
      (filterInternal === 'internal' && user.isInternal);
    return matchesSearch && matchesRole && matchesSubscription && matchesAccountStatus && matchesInternal;
  });

  const handleResetUsage = async (userId) => {
    if (!window.confirm("Are you sure you want to reset this user's yearly usage?")) return;
    try {
      const result = await adminResetUserUsage(userId);
      if (result.error) setError(result.error);
      else { setSuccess('Usage reset successfully'); loadUsers(); setTimeout(() => setSuccess(''), 3000); }
    } catch { setError('Failed to reset usage'); }
  };

  const handleUpdatePlan = async (userId, planId) => {
    try {
      const result = await adminUpdateUserSubscription(userId, planId);
      if (result.error) setError(result.error);
      else {
        setSuccess(result.created ? 'New subscription created successfully' : 'Subscription plan updated successfully');
        loadUsers(); setShowPlanModal(null); setTimeout(() => setSuccess(''), 3000);
      }
    } catch { setError('Failed to update plan'); }
  };

  const handleUpdateRole = async (userId, newRole) => {
    const action = newRole === 'admin' ? 'promote to admin' : 'remove admin privileges';
    if (!window.confirm(`Are you sure you want to ${action} for this user?`)) return;
    try {
      const result = await adminUpdateUserRole(userId, newRole);
      if (result.error) setError(result.error);
      else { setSuccess(`User role updated to ${newRole}`); loadUsers(); setShowUserDetail(null); setTimeout(() => setSuccess(''), 3000); }
    } catch { setError('Failed to update user role'); }
  };

  const handleUpdateStatus = async (userId, newStatus) => {
    const action = newStatus === 'suspended' ? 'suspend' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      const result = await adminUpdateUserStatus(userId, newStatus);
      if (result.error) setError(result.error);
      else {
        setSuccess(`User account ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully`);
        loadUsers(); setShowUserDetail(null); setTimeout(() => setSuccess(''), 3000);
      }
    } catch { setError('Failed to update user status'); }
  };

  const handleToggleInternal = async (userId) => {
    try {
      const result = await adminToggleInternalFlag(userId);
      if (result.error) setError(result.error);
      else {
        setSuccess(`User marked as ${result.isInternal ? 'internal' : 'external'}`);
        loadUsers(); setShowUserDetail(null); setTimeout(() => setSuccess(''), 3000);
      }
    } catch { setError('Failed to update internal flag'); }
  };

  const isSuspended = (user) => String(user.accountStatus || 'active') === 'suspended';

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '240px' }} />
          <div className="ap-card" style={{ padding: '24px' }}>
            <div className="ap-sk" style={{ height: '200px' }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 className="ap-h1">User Management</h1>
          <p className="ap-sub">Manage users, subscriptions, and account details</p>
        </div>

        {/* Filters */}
        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="ap-lbl">Search Users</label>
              <input type="text" placeholder="Search by email or name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="ap-inp" />
            </div>
            <div>
              <label className="ap-lbl">Role</label>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="ap-sel">
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">Subscription</label>
              <select value={filterSubscription} onChange={(e) => setFilterSubscription(e.target.value)} className="ap-sel">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="none">No Subscription</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">Account Status</label>
              <select value={filterAccountStatus} onChange={(e) => setFilterAccountStatus(e.target.value)} className="ap-sel">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label className="ap-lbl">Account Type</label>
              <select value={filterInternal} onChange={(e) => setFilterInternal(e.target.value)} className="ap-sel">
                <option value="all">All</option>
                <option value="external">Clients Only</option>
                <option value="internal">Internal Only</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '20px' }}>
            <div className="ap-stat-mini">
              <div className="ap-stat-mini-val">{users.filter(u => !u.isInternal).length}</div>
              <div className="ap-stat-mini-lbl">Real Clients</div>
            </div>
            <div className="ap-stat-mini">
              <div className="ap-stat-mini-val">{users.filter(u => u.isInternal).length}</div>
              <div className="ap-stat-mini-lbl">Internal</div>
            </div>
            <div className="ap-stat-mini">
              <div className="ap-stat-mini-val">{users.filter(u => !u.isInternal && u.subscription?.status === 'active').length}</div>
              <div className="ap-stat-mini-lbl">Active Subscriptions</div>
            </div>
            <div className="ap-stat-mini">
              <div className="ap-stat-mini-val">{users.filter(u => u.role === 'admin').length}</div>
              <div className="ap-stat-mini-lbl">Admins</div>
            </div>
            <div className="ap-stat-mini">
              <div className="ap-stat-mini-val">{users.filter(u => u.verified).length}</div>
              <div className="ap-stat-mini-lbl">Verified</div>
            </div>
          </div>
        </div>

        {success && <div className="ap-ok">{success}</div>}
        {error && <div className="ap-err">{error}</div>}

        {/* Users Table */}
        <div className="ap-card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sandd)' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
              Users ({filteredUsers.length}{filteredUsers.length !== users.length ? ` of ${users.length}` : ''})
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ap-tbl">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role / Status</th>
                  <th>Subscription</th>
                  <th>Joined</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--ink6)' }}>No users found</td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="ap-avatar">{(user.name?.charAt(0) || user.email.charAt(0)).toUpperCase()}</div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                              {user.name || user.email.split('@')[0] || 'Unknown User'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink6)' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                          <span className={`pill ${user.role === 'admin' ? 'pill-t' : 'pill-gr'}`}>{user.role}</span>
                          {user.isInternal && <span className="pill pill-o">Internal</span>}
                        </div>
                        <span className={`pill ${isSuspended(user) ? 'pill-r' : 'pill-g'}`}>
                          {isSuspended(user) ? 'suspended' : 'active'}
                        </span>
                      </td>
                      <td>
                        {user.subscription ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
                              {user.subscription.planId || user.subscription.plan || 'Unknown Plan'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
                              {user.subscription.currentPeriodEnd && new Date(user.subscription.currentPeriodEnd).getTime() > 0
                                ? `Until ${new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}`
                                : 'No expiry date'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>No subscription</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--ink6)', fontSize: '12px' }}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => setShowUserDetail(user)} className="ap-link-btn">View</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Detail Modal */}
        {showUserDetail && (
          <div className="ap-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUserDetail(null); }}>
            <div className="ap-modal">
              <div className="ap-modal-hdr">
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>User Details</h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink6)' }}>{showUserDetail.email}</p>
                </div>
                <button onClick={() => setShowUserDetail(null)} className="ap-modal-close">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="ap-modal-body">
                {/* Basic info */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Email', val: showUserDetail.email },
                    { label: 'Name', val: showUserDetail.name || showUserDetail.email.split('@')[0] || 'Unknown' },
                    { label: 'Role', val: showUserDetail.role },
                    { label: 'Verified', val: showUserDetail.verified ? 'Yes' : 'No' },
                    { label: 'Account Status', val: showUserDetail.accountStatus || 'active' },
                    { label: 'Account Type', val: showUserDetail.isInternal ? 'Internal' : 'External / Client' },
                  ].map(({ label, val }) => (
                    <div key={label} className="ap-detail-item">
                      <div className="ap-detail-lbl">{label}</div>
                      <div className="ap-detail-val" style={{ textTransform: 'capitalize' }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Subscription */}
                {showUserDetail.subscription && (
                  <div style={{ marginBottom: '24px' }}>
                    <div className="ap-section-hdr">Subscription Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                      {[
                        { label: 'Plan', val: showUserDetail.subscription.planId || showUserDetail.subscription.plan || 'Unknown' },
                        { label: 'Status', val: showUserDetail.subscription.status },
                        { label: 'Period End', val: showUserDetail.subscription.currentPeriodEnd && new Date(showUserDetail.subscription.currentPeriodEnd).getTime() > 0 ? new Date(showUserDetail.subscription.currentPeriodEnd).toLocaleDateString() : 'No expiry' },
                        { label: 'Billing Cycle', val: showUserDetail.subscription.billingCycle || 'Unknown' },
                      ].map(({ label, val }) => (
                        <div key={label} className="ap-detail-item">
                          <div className="ap-detail-lbl">{label}</div>
                          <div className="ap-detail-val" style={{ textTransform: 'capitalize' }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Actions */}
                <div>
                  <div className="ap-section-hdr">Admin Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={() => handleResetUsage(showUserDetail._id)} className="ap-action-btn ap-action-btn-amber">
                      Reset Monthly Usage
                    </button>
                    <button onClick={() => setShowPlanModal(showUserDetail)} className="ap-action-btn ap-action-btn-teal">
                      Update Subscription Plan
                    </button>

                    <div style={{ borderTop: '1px solid var(--sandd)', marginTop: '4px', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink6)', marginBottom: '8px' }}>Account Type</div>
                      <button
                        onClick={() => handleToggleInternal(showUserDetail._id)}
                        disabled={currentUserId === showUserDetail._id}
                        className="ap-action-btn ap-action-btn-neutral"
                      >
                        {showUserDetail.isInternal ? 'Remove Internal Flag' : 'Mark as Internal (Staff/Contractor)'}
                      </button>
                    </div>

                    <div style={{ borderTop: '1px solid var(--sandd)', marginTop: '4px', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink6)', marginBottom: '8px' }}>Role Management</div>
                      {showUserDetail.role === 'user' ? (
                        <button onClick={() => handleUpdateRole(showUserDetail._id, 'admin')} className="ap-action-btn ap-action-btn-teal">
                          Promote to Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateRole(showUserDetail._id, 'user')}
                          disabled={currentUserId === showUserDetail._id}
                          className="ap-action-btn ap-action-btn-danger"
                          title={currentUserId === showUserDetail._id ? 'You cannot demote yourself' : ''}
                        >
                          {currentUserId === showUserDetail._id ? 'Cannot Demote Yourself' : 'Remove Admin Privileges'}
                        </button>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--sandd)', marginTop: '4px', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink6)', marginBottom: '8px' }}>Account Status</div>
                      {isSuspended(showUserDetail) ? (
                        <button onClick={() => handleUpdateStatus(showUserDetail._id, 'active')} className="ap-action-btn ap-action-btn-teal">
                          Reactivate User
                        </button>
                      ) : (
                        <button onClick={() => handleUpdateStatus(showUserDetail._id, 'suspended')} className="ap-action-btn ap-action-btn-danger">
                          Suspend User
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plan Update Modal */}
        {showPlanModal && (
          <div className="ap-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPlanModal(null); }}>
            <div className="ap-modal-sm">
              <div className="ap-modal-hdr">
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>Update Plan</h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink6)' }}>{showPlanModal.email}</p>
                </div>
                <button onClick={() => setShowPlanModal(null)} className="ap-modal-close">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="ap-modal-body">
                <p style={{ fontSize: '13px', color: 'var(--ink6)', marginBottom: '16px' }}>
                  Select a new subscription plan for <strong>{showPlanModal.email}</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={() => handleUpdatePlan(showPlanModal._id, 'starter')} className="ap-action-btn ap-action-btn-green">
                    Set to Starter Plan (60 scans/year)
                  </button>
                  <button onClick={() => handleUpdatePlan(showPlanModal._id, 'pro')} className="ap-action-btn ap-action-btn-teal">
                    Set to Pro Plan (144 scans/year)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminUsers;
