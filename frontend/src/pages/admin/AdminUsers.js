import React, { useState, useEffect } from 'react';
import { adminListUsers, adminGetUser, adminResetUserUsage, adminUpdateUserSubscription, adminUpdateUserRole, adminUpdateUserStatus } from '../../api';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterSubscription, setFilterSubscription] = useState('all');
  const [filterAccountStatus, setFilterAccountStatus] = useState('all');
  const [showUserDetail, setShowUserDetail] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Helper function to get usage count from subscription
  const getUsageCount = (subscription) => {
    if (!subscription || !subscription.usage) return 0;
    return typeof subscription.usage === 'object' 
      ? subscription.usage.scansThisMonth || 0
      : subscription.usage || 0;
  };

  // Helper function to get limit from subscription
  const getUsageLimit = (subscription) => {
    if (!subscription) return 0;
    return subscription.limit || subscription.scansPerMonth || 0;
  };

  useEffect(() => {
    loadUsers();
    // Get current user ID from token
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
        // Fallback to mock data if API fails
        setUsers([
          {
            _id: '1',
            email: 'user1@example.com',
            name: 'John Doe',
            role: 'user',
            verified: true,
            createdAt: '2024-01-15T10:00:00Z',
            subscription: {
              status: 'active',
              plan: 'pro',
              usage: 8,
              limit: 12,
              currentPeriodEnd: '2024-02-15T10:00:00Z'
            }
          },
          {
            _id: '2',
            email: 'user2@example.com',
            name: 'Jane Smith',
            role: 'user',
            verified: true,
            createdAt: '2024-01-10T10:00:00Z',
            subscription: {
              status: 'active',
              plan: 'starter',
              usage: 3,
              limit: 5,
              currentPeriodEnd: '2024-02-10T10:00:00Z'
            }
          },
          {
            _id: '3',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'admin',
            verified: true,
            createdAt: '2024-01-01T10:00:00Z',
            subscription: null
          }
        ]);
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
    return matchesSearch && matchesRole && matchesSubscription && matchesAccountStatus;
  });

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      canceled: 'bg-red-100 text-red-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getRoleBadge = (role) => {
    return role === 'admin' 
      ? 'bg-purple-100 text-purple-800' 
      : 'bg-blue-100 text-blue-800';
  };

  const handleResetUsage = async (userId) => {
    if (!window.confirm('Are you sure you want to reset this user\'s yearly usage?')) {
      return;
    }

    try {
      const result = await adminResetUserUsage(userId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess('Usage reset successfully');
        loadUsers(); // Reload users
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError('Failed to reset usage');
    }
  };

  const handleUpdatePlan = async (userId, planId) => {
    try {
      const result = await adminUpdateUserSubscription(userId, planId);
      if (result.error) {
        setError(result.error);
      } else {
        // Check if this was a new subscription creation or an update
        if (result.created) {
          setSuccess('New subscription created successfully');
        } else {
          setSuccess('Subscription plan updated successfully');
        }
        loadUsers(); // Reload users
        setShowPlanModal(null);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError('Failed to update plan');
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    const action = newRole === 'admin' ? 'promote to admin' : 'remove admin privileges';
    if (!window.confirm(`Are you sure you want to ${action} for this user?`)) {
      return;
    }

    try {
      const result = await adminUpdateUserRole(userId, newRole);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`User role updated to ${newRole}`);
        loadUsers(); // Reload users
        setShowUserDetail(null); // Close detail modal
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError('Failed to update user role');
    }
  };

  const handleUpdateStatus = async (userId, newStatus) => {
    const action = newStatus === 'suspended' ? 'suspend' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    try {
      const result = await adminUpdateUserStatus(userId, newStatus);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`User account ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully`);
        loadUsers();
        setShowUserDetail(null);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError('Failed to update user status');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="bg-white shadow rounded-lg p-6">
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="mt-2 text-sm text-gray-600">Manage users, subscriptions, and account details</p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Users</label>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
            >
              <option value="all" className="text-gray-900">All Roles</option>
              <option value="user" className="text-gray-900">User</option>
              <option value="admin" className="text-gray-900">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Subscription</label>
            <select
              value={filterSubscription}
              onChange={(e) => setFilterSubscription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
            >
              <option value="all" className="text-gray-900">All</option>
              <option value="active" className="text-gray-900">Active</option>
              <option value="none" className="text-gray-900">No Subscription</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Status</label>
            <select
              value={filterAccountStatus}
              onChange={(e) => setFilterAccountStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white"
            >
              <option value="all" className="text-gray-900">All</option>
              <option value="active" className="text-gray-900">Active</option>
              <option value="suspended" className="text-gray-900">Suspended</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mt-6">
          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="text-sm font-medium text-indigo-600">Total Users</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{users.length}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm font-medium text-green-600">Active Subscriptions</div>
            <div className="text-2xl font-bold text-green-900 mt-1">
              {users.filter(u => u.subscription?.status === 'active').length}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm font-medium text-purple-600">Admins</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">
              {users.filter(u => u.role === 'admin').length}
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-600">Verified</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">
              {users.filter(u => u.verified).length}
            </div>
          </div>
        </div>
      </div>

       {/* Success Message */}
       {success && (
         <div className="bg-green-50 border border-green-200 rounded-lg p-4">
           <p className="text-sm text-green-800">{success}</p>
         </div>
       )}

       {/* Error Message */}
       {error && (
         <div className="bg-red-50 border border-red-200 rounded-lg p-4">
           <p className="text-sm text-red-800">{error}</p>
         </div>
       )}

      {/* Users Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscription
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-indigo-600 font-medium text-sm">
                              {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.name || user.email.split('@')[0] || 'Unknown User'}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                      <div className="mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          String(user.accountStatus || 'active') === 'suspended'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {String(user.accountStatus || 'active')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.subscription ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900 capitalize">
                            {user.subscription.planId || user.subscription.plan || 'Unknown Plan'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.subscription.currentPeriodEnd && new Date(user.subscription.currentPeriodEnd).getTime() > 0
                              ? `Until ${new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}`
                              : 'No expiry date'
                            }
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No subscription</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setShowUserDetail(user)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        View
                      </button>
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
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative mx-auto w-full max-w-2xl shadow-lg rounded-lg bg-white max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-medium text-gray-900">User Details</h3>
              <button
                onClick={() => setShowUserDetail(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{showUserDetail.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {showUserDetail.name || showUserDetail.email.split('@')[0] || 'Unknown User'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <p className="mt-1 text-sm text-gray-900">{showUserDetail.role}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Verified</label>
                  <p className="mt-1 text-sm text-gray-900">{showUserDetail.verified ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Account Status</label>
                  <p className="mt-1 text-sm text-gray-900 capitalize">{showUserDetail.accountStatus || 'active'}</p>
                </div>
              </div>
              {showUserDetail.subscription && (
                <div className="border-t pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Subscription Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Plan</label>
                      <p className="mt-1 text-sm text-gray-900 capitalize">
                        {showUserDetail.subscription.planId || showUserDetail.subscription.plan || 'Unknown Plan'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="mt-1 text-sm text-gray-900 capitalize">{showUserDetail.subscription.status}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Period End</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {showUserDetail.subscription.currentPeriodEnd && new Date(showUserDetail.subscription.currentPeriodEnd).getTime() > 0
                          ? new Date(showUserDetail.subscription.currentPeriodEnd).toLocaleDateString()
                          : 'No expiry date'
                        }
                      </p>
                    </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700">Billing Cycle</label>
                       <p className="mt-1 text-sm text-gray-900 capitalize">
                         {showUserDetail.subscription.billingCycle || 'Unknown'}
                       </p>
                     </div>
                   </div>
                 </div>
               )}

               {/* Admin Actions */}
               <div className="border-t pt-4">
                 <h4 className="text-md font-medium text-gray-900 mb-3">Admin Actions</h4>
                 <div className="space-y-2">
                   <button
                     onClick={() => handleResetUsage(showUserDetail._id)}
                     className="w-full px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-colors"
                   >
                     Reset Monthly Usage
                   </button>
                   <button
                     onClick={() => setShowPlanModal(showUserDetail)}
                     className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                   >
                     Update Subscription Plan
                   </button>
                   
                   {/* Role Management */}
                   <div className="border-t pt-3 mt-3">
                     <h5 className="text-sm font-medium text-gray-700 mb-2">Role Management</h5>
                     {showUserDetail.role === 'user' ? (
                       <button
                         onClick={() => handleUpdateRole(showUserDetail._id, 'admin')}
                         className="w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                       >
                         Promote to Admin
                       </button>
                     ) : (
                       <button
                         onClick={() => handleUpdateRole(showUserDetail._id, 'user')}
                         disabled={currentUserId === showUserDetail._id}
                         className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                           currentUserId === showUserDetail._id
                             ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                             : 'bg-red-500 hover:bg-red-600 text-white'
                         }`}
                         title={currentUserId === showUserDetail._id ? 'You cannot demote yourself' : 'Remove admin privileges'}
                       >
                         {currentUserId === showUserDetail._id ? 'Cannot Demote Yourself' : 'Remove Admin Privileges'}
                       </button>
                     )}
                   </div>

                   <div className="border-t pt-3 mt-3">
                     <h5 className="text-sm font-medium text-gray-700 mb-2">Account Status</h5>
                     {String(showUserDetail.accountStatus || 'active') === 'suspended' ? (
                       <button
                         onClick={() => handleUpdateStatus(showUserDetail._id, 'active')}
                         className="w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                       >
                         Reactivate User
                       </button>
                     ) : (
                       <button
                         onClick={() => handleUpdateStatus(showUserDetail._id, 'suspended')}
                         className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                       >
                         Suspend User
                       </button>
                     )}
                   </div>
                 </div>
               </div>
              </div>
            </div>
          </div>
        </div>
      )}

       {/* Plan Update Modal */}
       {showPlanModal && (
         <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
           <div className="relative mx-auto w-full max-w-md shadow-lg rounded-lg bg-white">
             <div className="flex justify-between items-center p-6 border-b border-gray-200">
               <h3 className="text-lg font-medium text-gray-900">Update Plan</h3>
               <button
                 onClick={() => setShowPlanModal(null)}
                 className="text-gray-400 hover:text-gray-600 transition-colors"
               >
                 <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
             </div>
             <div className="p-6 space-y-4">
               <p className="text-sm text-gray-600">
                 Update subscription plan for <strong>{showPlanModal.email}</strong>
               </p>
               <div className="space-y-2">
                 <button
                   onClick={() => handleUpdatePlan(showPlanModal._id, 'starter')}
                   className="w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                 >
                   Set to Starter Plan (60 scans/year)
                 </button>
                 <button
                   onClick={() => handleUpdatePlan(showPlanModal._id, 'pro')}
                   className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                 >
                   Set to Pro Plan (144 scans/year)
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 };
 
 export default AdminUsers;

