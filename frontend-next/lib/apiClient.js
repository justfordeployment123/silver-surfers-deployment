// Client-only API layer — attaches a bearer token from localStorage to every
// request. NEVER import this into a Server Component or a page.js doing
// server-side data fetching (it references localStorage/axios browser
// assumptions that don't exist during SSR). Use lib/publicApi.js there
// instead. This module is only safe inside Client Components ('use client').
//
// Near-verbatim port of frontend/src/api.js (same ~60 function names,
// signatures, and {data}/{error} return shape) so every existing call site
// only needs an import-path change, not a rewrite.
'use client';

import axios from 'axios';

// Consolidated from api.js's REACT_APP_API_BASE_URL/REACT_APP_API_URL
// fallback chain into one canonical NEXT_PUBLIC_API_BASE_URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_BASE = BACKEND_URL;

// Create a single axios instance so we can attach auth headers automatically
const api = axios.create({ baseURL: BACKEND_URL });

api.interceptors.request.use((config) => {
  // Defensive guard: this module must only ever run client-side, but if it's
  // ever accidentally imported into a server context, fail gracefully (skip
  // the auth header) rather than throwing "localStorage is not defined".
  if (typeof window === 'undefined') return config;
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth helpers
export const login = async (email, password) => {
  try {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('authToken', res.data.token);
    }
    return res.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const adminLogin = async (email, password) => {
  try {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.token) {
      // Verify user is admin
      if (res.data.user.role !== 'admin') {
        return { error: 'Access denied. Admin privileges required.' };
      }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('authToken', res.data.token);
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('adminUser', JSON.stringify(res.data.user));
    }
    return res.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const register = async (email, password) => {
  try {
    const res = await api.post('/auth/register', { email, password });
    // No token expected now; user must verify first.
    return res.data; // { message: 'Registered. Please verify your email.' }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const verifyEmail = async (token) => {
  try {
    const res = await api.post('/auth/verify-email', { token });
    if (res.data?.token) { localStorage.setItem('token', res.data.token); localStorage.setItem('authToken', res.data.token); }
    return res.data; // { token, user }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const resendVerification = async (email) => {
  try {
    const res = await api.post('/auth/resend-verification', { email });
    return res.data; // { message }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getMe = async () => {
  try {
    const res = await api.get('/auth/me');
    return res.data; // { user }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
};

// Precheck URL before audits
export const precheckUrl = async (url) => {
  try {
    const res = await api.post('/precheck-url', { url });
    return res.data; // { success, normalizedUrl, finalUrl, ... }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Existing API calls (now use the axios instance) with precheck
export const startAudit = async (email, url, selectedDevice = null, firstName = '', lastName = '', creditType = null, wcagConfig = {}) => {
  try {
    // Precheck & normalize
    const pre = await precheckUrl(url);
    if (pre?.error || pre?.success === false) {
      return { error: pre?.error || 'URL not reachable. Please check the domain and try again.' };
    }
    const normalized = pre?.finalUrl || pre?.normalizedUrl || url;
    const response = await api.post('/start-audit', {
      email,
      url: normalized,
      selectedDevice,
      firstName,
      lastName,
      creditType, // Pass credit type to backend
      wcagStandard: wcagConfig.wcagStandard,
      conformanceLevel: wcagConfig.conformanceLevel,
    });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const quickAudit = async (email, url, firstName = '', lastName = '', selectedDevice = 'desktop', wcagConfig = {}) => {
  try {
    // Precheck & normalize
    const pre = await precheckUrl(url);
    if (pre?.error || pre?.success === false) {
      return { error: pre?.error || 'URL not reachable. Please check the domain and try again.' };
    }
    const normalized = pre?.finalUrl || pre?.normalizedUrl || url;

    const response = await api.post('/quick-audit', {
      email,
      url: normalized,
      firstName,
      lastName,
      selectedDevice,
      wcagStandard: wcagConfig.wcagStandard,
      conformanceLevel: wcagConfig.conformanceLevel,
    });

    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message || 'Network error occurred' };
  }
};

export const cleanupReport = async (folderPath) => {
  try {
    const response = await api.post('/cleanup', { folderPath });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const createCheckoutSession = async (planId, billingCycle = 'monthly') => {
  try {
    const response = await api.post('/create-checkout-session', { planId, billingCycle });
    return response.data; // { url }
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Subscription management API
export const getSubscription = async () => {
  try {
    const response = await api.get('/subscription');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const updateSubscription = async (planId, billingCycle = 'monthly') => {
  try {
    const response = await api.post('/subscription/update', { planId, billingCycle });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const cancelSubscription = async (cancelAtPeriodEnd = true) => {
  try {
    const response = await api.post('/subscription/cancel', { cancelAtPeriodEnd });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getSubscriptionPlans = async () => {
  try {
    const response = await api.get('/subscription/plans');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const confirmSubscriptionSuccess = async (sessionId) => {
  try {
    const response = await api.get('/subscription-success', { params: { session_id: sessionId } });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Team management API
export const inviteTeamMember = async (email) => {
  try {
    const response = await api.post('/subscription/team/add', { email });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const removeTeamMember = async (email) => {
  try {
    const response = await api.post('/subscription/team/remove', { email });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const leaveTeam = async () => {
  try {
    const response = await api.post('/subscription/team/leave');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getTeamMembers = async () => {
  try {
    const response = await api.get('/subscription/team');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getTeamScans = async () => {
  try {
    const response = await api.get('/subscription/team/scans');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Legal Documents API
export const getLegalDocument = async (type, language = 'en', region = 'US') => {
  try {
    const response = await api.get(`/legal/${type}?language=${language}&region=${region}`);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getAllLegalDocuments = async (language = 'en', region = 'US') => {
  try {
    const response = await api.get(`/admin/legal`);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const acceptLegalDocument = async (type) => {
  try {
    const response = await api.post(`/legal/${type}/accept`);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getUserLegalAcceptances = async () => {
  try {
    const response = await api.get('/legal/acceptances');
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Admin Legal Documents API
export const createLegalDocument = async (documentData) => {
  try {
    const response = await api.post('/admin/legal', documentData);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const updateLegalDocument = async (id, updateData) => {
  try {
    const response = await api.put(`/admin/legal/${id}`, updateData);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const publishLegalDocument = async (id) => {
  try {
    const response = await api.post(`/admin/legal/${id}/publish`);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const getInvitationDetails = async (token) => {
  try {
    const response = await axios.get(`${API_BASE}/subscription/team/invite/${token}`);
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const acceptTeamInvitation = async (token) => {
  try {
    const response = await api.post('/subscription/team/accept', { token });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

export const confirmPayment = async (sessionId) => {
  try {
    const response = await api.get('/confirm-payment', { params: { session_id: sessionId } });
    return response.data;
  } catch (error) {
    return { error: error.response?.data?.error || error.message };
  }
};

// Auth: Forgot/Reset password
export const forgotPassword = async (email) => {
  try { const res = await api.post('/auth/forgot-password', { email }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const resetPassword = async (token, password) => {
  try { const res = await api.post('/auth/reset-password', { token, password }); if (res.data?.token) { localStorage.setItem('token', res.data.token); localStorage.setItem('authToken', res.data.token); } return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Admin API: Blog
export const adminListBlog = async () => {
  try { const res = await api.get('/admin/blog'); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminCreateBlog = async (payload) => {
  try { const res = await api.post('/admin/blog', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminUpdateBlog = async (id, payload) => {
  try { const res = await api.put(`/admin/blog/${id}`, payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminDeleteBlog = async (id) => {
  try { const res = await api.delete(`/admin/blog/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Admin API: Services
export const adminListServices = async () => {
  try { const res = await api.get('/admin/services'); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminCreateService = async (payload) => {
  try { const res = await api.post('/admin/services', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminUpdateService = async (id, payload) => {
  try { const res = await api.put(`/admin/services/${id}`, payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminDeleteService = async (id) => {
  try { const res = await api.delete(`/admin/services/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Admin API: FAQs
export const adminListFaqs = async () => {
  try { const res = await api.get('/admin/faqs'); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminCreateFaq = async (payload) => {
  try { const res = await api.post('/admin/faqs', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminUpdateFaq = async (id, payload) => {
  try { const res = await api.put(`/admin/faqs/${id}`, payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminDeleteFaq = async (id) => {
  try { const res = await api.delete(`/admin/faqs/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Admin API: Analysis records
export const adminListAnalysis = async (params = {}) => {
  try { const res = await api.get('/admin/analysis', { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const adminRerunAnalysis = async (idOrTaskId) => {
  try { const res = await api.post(`/admin/analysis/${idOrTaskId}/rerun`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Public: Contact submit
export const submitContact = async (payload) => {
  try { const res = await api.post('/contact', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// User: list my analysis records (auth)
export const listMyAnalysis = async (params = {}) => {
  try { const res = await api.get('/auth/my-analysis', { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const listMyQuickScans = async (params = {}) => {
  try { const res = await api.get('/auth/my-quick-scans', { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const getMyAnalysisDetail = async (taskId) => {
  try { const res = await api.get(`/auth/my-analysis/${taskId}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const rerunMyAnalysis = async (taskId) => {
  try { const res = await api.post(`/auth/my-analysis/${taskId}/rerun`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const rescanMyAnalysis = async (taskId) => {
  try { const res = await api.post(`/auth/my-analysis/${taskId}/rescan`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const deleteMyAnalysis = async (taskId) => {
  try { const res = await api.delete(`/auth/my-analysis/${taskId}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const getMyQuickScanDetail = async (quickScanId) => {
  try { const res = await api.get(`/auth/my-quick-scans/${quickScanId}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const rerunMyQuickScan = async (quickScanId) => {
  try { const res = await api.post(`/auth/my-quick-scans/${quickScanId}/rerun`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const rescanMyQuickScan = async (quickScanId) => {
  try { const res = await api.post(`/auth/my-quick-scans/${quickScanId}/rescan`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

export const deleteMyQuickScan = async (quickScanId) => {
  try { const res = await api.delete(`/auth/my-quick-scans/${quickScanId}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

function parseFilenameFromContentDisposition(headerValue, fallback = 'report.pdf') {
  if (!headerValue) {
    return fallback;
  }

  const utf8Match = headerValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = headerValue.match(/filename\s*=\s*"?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

export const fetchMyAnalysisReportFile = async (taskId, reportId, disposition = 'attachment') => {
  try {
    const res = await api.get(`/auth/my-analysis/${taskId}/reports/${reportId}`, {
      params: { disposition },
      responseType: 'blob',
    });

    return {
      blob: res.data,
      contentType: res.headers['content-type'] || 'application/pdf',
      filename: parseFilenameFromContentDisposition(
        res.headers['content-disposition'],
        'report.pdf',
      ),
    };
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const fetchMyQuickScanReportFile = async (quickScanId, reportId, disposition = 'attachment') => {
  try {
    const res = await api.get(`/auth/my-quick-scans/${quickScanId}/reports/${reportId}`, {
      params: { disposition },
      responseType: 'blob',
    });

    return {
      blob: res.data,
      contentType: res.headers['content-type'] || 'application/pdf',
      filename: parseFilenameFromContentDisposition(
        res.headers['content-disposition'],
        'quick-scan-report.pdf',
      ),
    };
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

// Admin: User management
export const adminListUsers = async (params = {}) => {
  try {
    const res = await api.get('/admin/users', { params });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminGetUser = async (id) => {
  try {
    const res = await api.get(`/admin/users/${id}`);
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminResetUserUsage = async (userId) => {
  try {
    const res = await api.post(`/admin/users/${userId}/reset-usage`);
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminUpdateUserSubscription = async (userId, planId, billingCycle = 'yearly') => {
  try {
    const res = await api.post('/admin/subscription/update', { userId, planId, billingCycle });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminUpdateUserRole = async (userId, role) => {
  try {
    const res = await api.put(`/admin/users/${userId}/role`, { role });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminUpdateUserStatus = async (userId, status, reason = '') => {
  try {
    const res = await api.put(`/admin/users/${userId}/status`, { status, reason });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const adminToggleInternalFlag = async (userId) => {
  try {
    const res = await api.put(`/admin/users/${userId}/internal`);
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

// User subscription management
export const createPortalSession = async () => {
  try {
    const res = await api.post('/create-portal-session');
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

export const upgradeSubscription = async (planId, billingCycle = 'monthly') => {
  try {
    const res = await api.post('/subscription/upgrade', { planId, billingCycle });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};

// Admin: Contact management
export const adminListContact = async (params = {}) => {
  try { const res = await api.get('/admin/contact', { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminGetContact = async (id) => {
  try { const res = await api.get(`/admin/contact/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Admin: Quick Scans management
export const adminListQuickScans = async (params = {}) => {
  try {
    const res = await api.get('/admin/quick-scans', { params });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};
export const adminBulkQuickScans = async (payload) => {
  try {
    const res = await api.post('/admin/quick-scans/bulk', payload);
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};
export const adminListSubscriptionScans = async (params = {}) => {
  try {
    const res = await api.get('/admin/subscription-scans', { params });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
};
export const adminUpdateContact = async (id, payload) => {
  try { const res = await api.put(`/admin/contact/${id}`, payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const adminDeleteContact = async (id) => {
  try { const res = await api.delete(`/admin/contact/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};

// Monitoring: user-scoped jobs
export const listMonitoringJobs = async (params = {}) => {
  try { const res = await api.get('/monitoring/jobs', { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const createMonitoringJob = async (payload) => {
  try { const res = await api.post('/monitoring/jobs', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const getMonitoringJob = async (id) => {
  try { const res = await api.get(`/monitoring/jobs/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const updateMonitoringJob = async (id, payload) => {
  try { const res = await api.put(`/monitoring/jobs/${id}`, payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const deleteMonitoringJob = async (id) => {
  try { const res = await api.delete(`/monitoring/jobs/${id}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const pauseMonitoringJob = async (id) => {
  try { const res = await api.patch(`/monitoring/jobs/${id}/pause`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const resumeMonitoringJob = async (id) => {
  try { const res = await api.patch(`/monitoring/jobs/${id}/resume`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const triggerMonitoringJob = async (id) => {
  try { const res = await api.patch(`/monitoring/jobs/${id}/trigger`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const listMonitoringRuns = async (id, params = {}) => {
  try { const res = await api.get(`/monitoring/jobs/${id}/runs`, { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const getMonitoringRun = async (id, runId) => {
  try { const res = await api.get(`/monitoring/jobs/${id}/runs/${runId}`); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const previewMonitoringSchedule = async (payload) => {
  try { const res = await api.post('/monitoring/jobs/preview-schedule', payload); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
export const listMonitoringNotifications = async (id, params = {}) => {
  try { const res = await api.get(`/monitoring/jobs/${id}/notifications`, { params }); return res.data; } catch (e) { return { error: e.response?.data?.error || e.message }; }
};
