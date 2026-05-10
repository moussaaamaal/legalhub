// services/api.js
import { getStoredToken, getStoredRefresh, storeTokens } from '../context/AuthContext';

const BASE_URL = 'http://192.168.1.13:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────
const getAuthHeaders = async () => {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Silent token refresh on 401
const tryRefresh = async () => {
  const refresh = await getStoredRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await storeTokens(data.access_token, data.refresh_token ?? refresh);
    return true;
  } catch {
    return false;
  }
};

const requestForm = async (endpoint, formData, retry = true) => {
  const token = await getStoredToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'POST', headers, body: formData });
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return requestForm(endpoint, formData, false);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
};

const request = async (method, endpoint, body = null, retry = true) => {
  const headers = await getAuthHeaders();
  const config  = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, config);

  // Auto-refresh on 401 (once)
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request(method, endpoint, body, false);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
};

// ─── AUTH ─────────────────────────────────────────────────────────────────
export const authAPI = {
  login:              (email, password)      => request('POST', '/api/auth/login',               { email, password }),
  registerFirm:       (body)                 => request('POST', '/api/auth/register-firm',        body),
  refresh:            (refresh_token)        => request('POST', '/api/auth/refresh',              { refresh_token }),
  logout:             ()                     => request('POST', '/api/auth/logout',               {}),
  me:                 ()                     => request('GET',  '/api/auth/me'),
  forgotPassword:     (email)                => request('POST', '/api/auth/forgot-password',      { email }),
  resetPassword:      (token, new_password)  => request('POST', '/api/auth/reset-password',       { token, new_password }),
  validateOfficeCode: (body)                 => request('POST', '/api/auth/office-code/validate', body),
  inviteLawyer:       (body)                 => request('POST', '/api/auth/invite/lawyer',        body),
  inviteClient:       (body)                 => request('POST', '/api/auth/invite/client',        body),
  acceptInvite:       (body)                 => request('POST', '/api/auth/accept-invite',        body),
  setup2FA:           ()                     => request('POST', '/api/auth/2fa/setup',            {}),
  verify2FA:          (code)                 => request('POST', '/api/auth/2fa/verify',           { code }),
  login2FA:           (temp_token, code)     => request('POST', '/api/auth/2fa/login',            { temp_token, code }),
  updateMe:                  (body) => request('PUT',  '/api/auth/me',                          body),
  uploadAvatar:              (formData) => requestForm('/api/auth/avatar', formData),
  changePassword:            (body) => request('PUT',  '/api/auth/change-password',             body),
  loginHistory:              ()     => request('GET',  '/api/auth/login-history'),
  getNotifPreferences:       ()     => request('GET',  '/api/auth/notification-preferences'),
  updateNotifPreferences:    (body) => request('PUT',  '/api/auth/notification-preferences',    body),
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────
export const dashboardAPI = {
  stats:          () => request('GET', '/api/dashboard/stats'),
  today:          () => request('GET', '/api/dashboard/today'),
  recentCases:    () => request('GET', '/api/dashboard/recent-cases'),
  recentActivity: (days = 3) => request('GET', `/api/dashboard/recent-activity?days=${days}`),
};

// ─── CASES ────────────────────────────────────────────────────────────────
export const casesAPI = {
  list:          (filters = {})  => request('GET',    `/api/cases?${new URLSearchParams(filters)}`),
  create:        (body)          => request('POST',   '/api/cases',                body),
  getById:       (id)            => request('GET',    `/api/cases/${id}`),
  update:        (id, body)      => request('PUT',    `/api/cases/${id}`,          body),
  updateStatus:  (id, status)    => request('PATCH',  `/api/cases/${id}/status`,   { status }),
  archive:       (id)            => request('DELETE', `/api/cases/${id}`),
  getTimeline:   (id)            => request('GET',    `/api/cases/${id}/timeline`),
  getTeam:       (id)            => request('GET',    `/api/cases/${id}/team`),
  addTeamMember: (id, user_id)   => request('POST',   `/api/cases/${id}/team`,     { user_id }),
  removeTeamMember: (id, uid)    => request('DELETE', `/api/cases/${id}/team/${uid}`),
  getByClient:   (clientId)      => request('GET',    `/api/cases/client/${clientId}`),
};

// ─── CLIENTS ──────────────────────────────────────────────────────────────
export const clientsAPI = {
  list:       (filters = {}) => request('GET',    `/api/clients?${new URLSearchParams(filters)}`),
  create:     (body)         => request('POST',   '/api/clients',       body),
  getById:    (id)           => request('GET',    `/api/clients/${id}`),
  update:     (id, body)     => request('PUT',    `/api/clients/${id}`, body),
  delete:     (id)           => request('DELETE', `/api/clients/${id}`),
  invite:     (id)           => request('POST',   `/api/clients/${id}/invite`, {}),
  getCases:   (id)           => request('GET',    `/api/clients/${id}/cases`),
  getInvoices:(id)           => request('GET',    `/api/clients/${id}/invoices`),
};

// ─── DOCUMENTS ────────────────────────────────────────────────────────────
export const documentsAPI = {
  list:         (filters = {}) => request('GET',    `/api/documents?${new URLSearchParams(filters)}`),
  getById:      (id)           => request('GET',    `/api/documents/${id}`),
  delete:       (id)           => request('DELETE', `/api/documents/${id}`),
  updateStatus: (id, status)   => request('PATCH',  `/api/documents/${id}/status`, { status }),
  share:        (id)           => request('POST',   `/api/documents/${id}/share`,  {}),
  summarize:    (id)           => request('POST',   `/api/documents/${id}/ai-summarize`, {}),

  upload: async (file, caseId) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name || 'document.pdf', type: file.mimeType || 'application/pdf' });
    formData.append('case_id', caseId);

    const res = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    return data;
  },

  voiceNoteAI: async (audioUri, partialData = null, priorTranscriptions = []) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('file', { uri: audioUri, name: 'voice.m4a', type: 'audio/mp4' });
    if (partialData) formData.append('partial_data', JSON.stringify(partialData));
    if (priorTranscriptions.length > 0)
      formData.append('prior_transcriptions', JSON.stringify(priorTranscriptions));

    const res = await fetch(`${BASE_URL}/api/documents/voice-note-ai`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Voice AI request failed');
    return data;
  },

  voiceNoteConfirm: async (noteData) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('note_data', JSON.stringify(noteData));
    const res = await fetch(`${BASE_URL}/api/documents/voice-note-ai/confirm`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Save failed');
    return data;
  },

  uploadVoice: async (audioUri, caseId) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('file', { uri: audioUri, name: 'voice.m4a', type: 'audio/m4a' });
    formData.append('case_id', caseId);

    const res = await fetch(`${BASE_URL}/api/documents/voice-note`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Voice upload failed');
    return data;
  },
};

// ─── BILLING ──────────────────────────────────────────────────────────────
export const billingAPI = {
  listInvoices:  (filters = {}) => request('GET',  `/api/invoices?${new URLSearchParams(filters)}`),
  createInvoice: (body)         => request('POST', '/api/invoices',                  body),
  getInvoice:    (id)           => request('GET',  `/api/invoices/${id}`),
  updateInvoice: (id, body)     => request('PUT',  `/api/invoices/${id}`,             body),
  sendInvoice:   (id)           => request('POST',   `/api/invoices/${id}/send`,        {}),
  sendReminder:  (id)           => request('POST',   `/api/invoices/${id}/reminder`,    {}),
  deleteInvoice: (id)           => request('DELETE', `/api/invoices/${id}`),
  getAnalytics:  ()             => request('GET',    '/api/invoices/analytics/summary'),
};

// ─── CALENDAR ─────────────────────────────────────────────────────────────
export const calendarAPI = {
  listEvents:   (filters = {}) => request('GET',    `/api/calendar/events?${new URLSearchParams(filters)}`),
  createEvent:  (body)         => request('POST',   '/api/calendar/events',       body),
  updateEvent:  (id, body)     => request('PUT',    `/api/calendar/events/${id}`, body),
  deleteEvent:  (id)           => request('DELETE', `/api/calendar/events/${id}`),
  testReminder: ()             => request('POST',   '/api/calendar/test-reminder'),
};

// ─── TASKS ────────────────────────────────────────────────────────────────
export const tasksAPI = {
  list:         (filters = {}) => request('GET',    `/api/tasks?${new URLSearchParams(filters)}`),
  create:       (body)         => request('POST',   '/api/tasks',              body),
  update:       (id, body)     => request('PUT',    `/api/tasks/${id}`,        body),
  updateStatus: (id, status)   => request('PATCH',  `/api/tasks/${id}/status`, { status }),
  delete:       (id)           => request('DELETE', `/api/tasks/${id}`),
};

// ─── NOTES ────────────────────────────────────────────────────────────────
export const notesAPI = {
  list:   (filters = {}) => request('GET',    `/api/notes?${new URLSearchParams(filters)}`),
  create: (body)         => request('POST',   '/api/notes',      body),
  update: (id, body)     => request('PUT',    `/api/notes/${id}`, body),
  delete: (id)           => request('DELETE', `/api/notes/${id}`),
};

// ─── FIRM ─────────────────────────────────────────────────────────────────
export const firmAPI = {
  getProfile:      ()         => request('GET', '/api/firm/profile'),
  updateProfile:   (body)     => request('PUT', '/api/firm/profile',        body),
  getTeam:         ()         => request('GET', '/api/firm/team'),
  updateMemberRole:(uid, role)=> request('PUT', `/api/firm/team/${uid}/role`, { role }),
  removeMember:    (uid)      => request('DELETE', `/api/firm/team/${uid}`),
  getSubscription: ()         => request('GET', '/api/firm/subscription'),
  getBranding:     ()         => request('GET', '/api/firm/branding'),
  updateBranding:  (body)     => request('PUT', '/api/firm/branding',       body),
  getOfficeCode:   ()         => request('GET', '/api/firm/office-code'),
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────
export const paymentsAPI = {
  stripeCreate:  (body) => request('POST', '/api/payments/stripe/create',  body),
  stripeConfirm: (body) => request('POST', '/api/payments/stripe/confirm', body),
  sadadInitiate: (body) => request('POST', '/api/payments/sadad/initiate', body),
};

// ─── AI ───────────────────────────────────────────────────────────────────
export const aiAPI = {
  summarize:      (document_id)        => request('POST', '/api/ai/summarize',       { document_id }),
  draftContract:  (body)               => request('POST', '/api/ai/draft-contract',  body),
  suggestActions: (case_id)            => request('POST', '/api/ai/suggest-actions', { case_id }),
  caseAssistant:  (case_id, question)  => request('POST', '/api/ai/case-assistant',  { case_id, question }),
  getHistory:     ()                   => request('GET',  '/api/ai/history'),
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────
export const notificationsAPI = {
  list:         ()     => request('GET',   '/api/notifications'),
  unreadCount:  ()     => request('GET',   '/api/notifications/unread-count'),
  markAllRead:  ()     => request('PATCH', '/api/notifications/read-all'),
  markOneRead:  (id)   => request('PATCH', `/api/notifications/${id}/read`),
  createTest:   (body) => request('POST',  '/api/notifications/test', body),
};

// ─── CLIENT PORTAL ────────────────────────────────────────────────────────
export const clientPortalAPI = {
  dashboard:    ()                    => request('GET',  '/api/client/dashboard'),
  cases:        ()                    => request('GET',  '/api/client/cases'),
  caseDetail:   (id)                  => request('GET',  `/api/client/cases/${id}`),
  invoices:     (status)              => request('GET',  `/api/client/invoices${status ? `?status=${status}` : ''}`),
  invoiceDetail:(id)                  => request('GET',  `/api/client/invoices/${id}`),
  payInvoice:   (invoiceId, method)   => request('POST', `/api/client/invoices/${invoiceId}/pay`, { payment_method: method }),
  documents:    (caseId)              => request('GET',  `/api/client/documents${caseId ? `?case_id=${caseId}` : ''}`),
  appointments:   ()     => request('GET',  '/api/client/appointments'),
  requestMeeting: (body) => request('POST', '/api/client/appointments/request', body),
  profile:        ()     => request('GET',  '/api/client/profile'),
  activity:       ()     => request('GET',  '/api/client/activity'),
};
