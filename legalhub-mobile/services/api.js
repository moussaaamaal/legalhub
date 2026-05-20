// services/api.js
import { getStoredToken, getStoredRefresh, storeTokens } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://192.168.1.11:8000';

// ─── Offline Cache Helpers ────────────────────────────────────────────────────
const _setCache = async (key, data) => {
  try { await AsyncStorage.setItem(`lh_c_${key}`, JSON.stringify({ data, ts: Date.now() })); } catch {}
};
const _getCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(`lh_c_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 86400000) return null; // 24h TTL
    return data;
  } catch { return null; }
};

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
  oauthLogin:         (provider, token, token_type = 'id_token') =>
                                               request('POST', '/api/auth/oauth/token',          { provider, token, token_type }),
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
  getNotifPreferences:       ()     => request('GET',    '/api/auth/notification-preferences'),
  updateNotifPreferences:    (body) => request('PUT',    '/api/auth/notification-preferences',  body),
  deleteAccount:             ()     => request('DELETE', '/api/auth/me'),
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
  list: async (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    const cacheKey = `cases_${qs}`;
    try {
      const data = await request('GET', `/api/cases?${qs}`);
      await _setCache(cacheKey, data);
      return data;
    } catch (err) {
      const cached = await _getCache(cacheKey);
      if (cached) return cached;
      throw err;
    }
  },
  create:        (body)          => request('POST',   '/api/cases',                body),
  getById:       (id)            => request('GET',    `/api/cases/${id}`),
  update:        (id, body)      => request('PUT',    `/api/cases/${id}`,          body),
  updateStatus:  (id, status)    => request('PATCH',  `/api/cases/${id}/status`,   { status }),
  restore:       (id)            => request('PATCH',  `/api/cases/${id}/restore`),
  archive:       (id)            => request('DELETE', `/api/cases/${id}`),
  getTimeline:   (id)            => request('GET',    `/api/cases/${id}/timeline`),
  getTeam:       (id)            => request('GET',    `/api/cases/${id}/team`),
  addTeamMember: (id, user_id)   => request('POST',   `/api/cases/${id}/team`,     { user_id }),
  removeTeamMember: (id, uid)    => request('DELETE', `/api/cases/${id}/team/${uid}`),
  getByClient:   (clientId)      => request('GET',    `/api/cases/client/${clientId}`),
  getExportUrl:  async (id) => {
    const token = await getStoredToken();
    return { url: `${BASE_URL}/api/cases/${id}/export`, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  },
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
  updateStatus: (id, status)   => request('PATCH',  `/api/documents/${id}/status?status=${encodeURIComponent(status)}`),
  share:        (id)           => request('POST',   `/api/documents/${id}/share`,  {}),
  summarize:    (id)           => request('POST',   `/api/documents/${id}/ai-summarize`, {}),
  createRequest:(body)         => request('POST',   '/api/documents/request',      body),
  listRequests: (caseId)       => request('GET',    `/api/documents/requests${caseId ? `?case_id=${caseId}` : ''}`),
  cancelRequest:(id)           => request('DELETE', `/api/documents/requests/${id}`),

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
  sendInvoice:        (id) => request('POST',   `/api/invoices/${id}/send`,              {}),
  cancelInvoice:      (id) => request('POST',   `/api/invoices/${id}/cancel`,            {}),
  sendReminder:       (id) => request('POST',   `/api/invoices/${id}/reminder`,          {}),
  sendWhatsapp:       (id) => request('POST',   '/api/whatsapp/send-invoice-notif',      { invoice_id: id }),
  deleteInvoice:      (id) => request('DELETE', `/api/invoices/${id}`),
  getAnalytics:  ()             => request('GET',    '/api/invoices/analytics/summary'),
  getExportUrl:  async (format = 'pdf', status = null) => {
    const token = await getStoredToken();
    const qs = new URLSearchParams({ format, ...(status ? { status } : {}) }).toString();
    return { url: `${BASE_URL}/api/invoices/export?${qs}`, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  },
};

// ─── CALENDAR ─────────────────────────────────────────────────────────────
export const calendarAPI = {
  listEvents: async (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    const cacheKey = `cal_events_${qs}`;
    try {
      const data = await request('GET', `/api/calendar/events?${qs}`);
      await _setCache(cacheKey, data);
      return data;
    } catch (err) {
      const cached = await _getCache(cacheKey);
      if (cached) return cached;
      throw err;
    }
  },
  createEvent:   (body)         => request('POST',   '/api/calendar/events',                body),
  updateEvent:   (id, body)     => request('PUT',    `/api/calendar/events/${id}`,          body),
  deleteEvent:   (id)           => request('DELETE', `/api/calendar/events/${id}`),
  testReminder:  ()             => request('POST',   '/api/calendar/test-reminder'),
  syncGoogle:      (body) => request('POST', '/api/calendar/sync/google',            body),
  saveGoogleToken: (body) => request('POST', '/api/calendar/sync/google/save-token', body),
  getAvailableParticipants: (case_id = null) => {
    const qs = case_id ? `?case_id=${case_id}` : '';
    return request('GET', `/api/calendar/available-participants${qs}`);
  },
  // Meeting-request management (lawyer side)
  listMeetingRequests:   ()              => request('GET',  '/api/calendar/meeting-requests'),
  acceptMeetingRequest:  (id, body)      => request('POST', `/api/calendar/meeting-requests/${id}/accept`, body),
  rejectMeetingRequest:  (id, body)      => request('POST', `/api/calendar/meeting-requests/${id}/reject`, body),
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
  stripeCreate:     (body)      => request('POST',   '/api/payments/stripe/create',            body),
  stripeConfirm:    (body)      => request('POST',   '/api/payments/stripe/confirm',           body),
  sadadInitiate:    (body)      => request('POST',   '/api/payments/sadad/initiate',           body),
  listSavedMethods: ()          => request('GET',    '/api/payments/stripe/methods'),
  saveMethod:       (body)      => request('POST',   '/api/payments/stripe/methods/save',      body),
  deleteMethod:     (method_id) => request('DELETE', `/api/payments/stripe/methods/${method_id}`),
  payWithMethod:    (body)      => request('POST',   '/api/payments/stripe/pay-with-method',   body),
  whatsappSend:     (body)      => request('POST',   '/api/whatsapp/send',                     body),
};

// ─── AI ───────────────────────────────────────────────────────────────────
export const aiAPI = {
  summarize:      (document_id)        => request('POST', '/api/ai/summarize',       { document_id }),
  draftContract:  (body)               => request('POST', '/api/ai/draft-contract',  body),
  suggestActions: (case_id)            => request('POST', '/api/ai/suggest-actions', { case_id }),
  caseAssistant:  (case_id, question)  => request('POST', '/api/ai/case-assistant',  { case_id, question }),
  getHistory:     ()                   => request('GET',  '/api/ai/history'),
};

// ─── RAG / CASE AI ────────────────────────────────────────────────────────
export const ragAPI = {
  ingest:        (case_id)                        => request('POST',   '/api/rag/ingest',            { case_id }),
  ask:           (case_id, question, chat_history) => request('POST',   '/api/rag/ask',               { case_id, question, chat_history: chat_history || [] }),
  sessionTitle:  (question, answer)               => request('POST',   '/api/rag/session-title',     { question, answer }),
  status:        (case_id)                        => request('GET',    `/api/rag/status/${case_id}`),
  history:       (case_id, limit = 30)            => request('GET',    `/api/rag/history/${case_id}?limit=${limit}`),
  deleteIndex:   (case_id)                        => request('DELETE', `/api/rag/index/${case_id}`),
  // Firm-wide
  firmIngest:    ()                               => request('POST',   '/api/rag/firm/ingest'),
  firmAsk:       (question, chat_history)         => request('POST',   '/api/rag/firm/ask',          { question, chat_history: chat_history || [] }),
  firmStatus:    ()                               => request('GET',    '/api/rag/firm/status'),
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
  documents:        (caseId)      => request('GET',  `/api/client/documents${caseId ? `?case_id=${caseId}` : ''}`),
  documentRequests: ()           => request('GET',  '/api/client/document-requests'),
  fulfillRequest: async (requestId, file) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name || 'document.pdf', type: file.mimeType || 'application/pdf' });
    const res = await fetch(`${BASE_URL}/api/client/document-requests/${requestId}/fulfill`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    return data;
  },
  appointments:   (caseId) => request('GET',  `/api/client/appointments${caseId ? `?case_id=${caseId}` : ''}`),
  requestMeeting: (body)   => request('POST', '/api/client/appointments/request', body),
  caseTeam:       (caseId) => request('GET',  `/api/client/cases/${caseId}/team`),
  uploadDocument: async (caseId, file) => {
    const token = await getStoredToken();
    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name || 'document', type: file.mimeType || 'application/octet-stream' });
    formData.append('case_id', caseId);
    if (file.name) formData.append('original_name', file.name);
    const res = await fetch(`${BASE_URL}/api/client/documents/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    return data;
  },
  lawyers:        ()     => request('GET',  '/api/client/lawyers'),
  profile:        ()     => request('GET',  '/api/client/profile'),
  updateProfile:  (body) => request('PUT',  '/api/client/profile', body),
  activity:       ()     => request('GET',  '/api/client/activity'),
};
