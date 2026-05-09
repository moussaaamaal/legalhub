// services/auth.js
// All auth operations go through the LegalHub custom JWT backend.
// Supabase Auth is NOT used — the backend issues its own tokens.

import { authAPI } from './api';

// ─── Register a new firm + FIRM_ADMIN account ─────────────────────────────
export const registerFirm = (firmName, email, password, fullName, phone) =>
  authAPI.registerFirm({ firm_name: firmName, email, password, full_name: fullName, phone });

// ─── Login (email + password) ─────────────────────────────────────────────
// Returns { access_token, refresh_token, user: {...} }
export const login = (email, password) =>
  authAPI.login(email, password);

// ─── Join a firm via office code (mobile lawyer flow) ────────────────────
export const validateOfficeCode = (office_code, email, password, full_name, phone) =>
  authAPI.validateOfficeCode({ office_code, email, password, full_name, phone });

// ─── Forgot / Reset password ──────────────────────────────────────────────
export const forgotPassword = (email) =>
  authAPI.forgotPassword(email);

export const resetPassword = (token, new_password) =>
  authAPI.resetPassword(token, new_password);

// ─── Invite helpers ───────────────────────────────────────────────────────
export const inviteLawyer = (email, full_name) =>
  authAPI.inviteLawyer({ email, full_name });

export const inviteClient = (email, full_name, phone) =>
  authAPI.inviteClient({ email, full_name, phone });

// ─── 2FA ──────────────────────────────────────────────────────────────────
export const setup2FA   = ()     => authAPI.setup2FA();
export const verify2FA  = (code) => authAPI.verify2FA(code);
