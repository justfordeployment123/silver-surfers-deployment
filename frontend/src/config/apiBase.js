// Centralized API base URL resolution.
// Prefer REACT_APP_API_BASE_URL, fallback to REACT_APP_API_BASE, then localhost:8000.
const raw = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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

export default API_BASE;