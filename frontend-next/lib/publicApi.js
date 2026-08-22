// Isomorphic (server + client safe) API helper for PUBLIC, unauthenticated
// endpoints only — no auth header is attached here, ever. This is the only
// API module Server Component page.js files may import (see lib/apiClient.js
// for the client-only, auth-token-attaching counterpart).
//
// Ported from frontend/src/config/apiBase.js, consolidating what used to be
// two separate base-URL env-var fallback chains (api.js read
// REACT_APP_API_BASE_URL/REACT_APP_API_URL, apiBase.js read
// REACT_APP_API_BASE_URL/REACT_APP_API_BASE) into one canonical
// NEXT_PUBLIC_API_BASE_URL.
const raw = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Remove trailing slash for consistency
export const API_BASE = raw.replace(/\/$/, '');

// Helper to perform JSON fetch with graceful HTML/empty handling
export async function fetchJSON(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    return { ok: false, status: 0, data: { error: 'Unable to reach the server. Please check your connection and try again.' } };
  }
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // If HTML returned, convert to error object
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      data = { error: `Unexpected HTML response (status ${res.status}). Check API base URL configuration.` };
    } else {
      data = { error: 'Invalid JSON response from server.' };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

// Public legal document read (terms-of-use, privacy-policy, accessibility-
// guides) — ported from api.js's getLegalDocument, but callable from Server
// Components since the /legal/:type endpoint is genuinely unauthenticated
// (TermsOfUse/PrivacyPolicy/AccessibilityGuides are public pages in the CRA
// app too, rendered without a login). Cached for 5 minutes server-side
// (next.revalidate) since these documents change rarely.
export async function getLegalDocument(type, language = 'en', region = 'US') {
  const { ok, data } = await fetchJSON(
    `/legal/${type}?language=${language}&region=${region}`,
    { next: { revalidate: 300 } },
  );
  if (!ok) {
    return { error: data?.error || 'Failed to load document' };
  }
  return data;
}

export default API_BASE;
