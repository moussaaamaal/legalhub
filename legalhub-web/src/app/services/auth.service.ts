import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// ── AppUser — type local partagé par toute l'app ──────────────
export interface AppUser {
  id:       string;
  email:    string;
  name:     string;      // full_name du backend
  title:    string;
  avatar:   string;      // avatar_url du backend
  role:     'lawyer' | 'paralegal' | 'admin' | 'client';
  firmName: string;
  firmId:   string;
  phone?:          string;
  twoFaEnabled:    boolean;
  isActive?:       boolean;
  lastLoginAt?:    string;
  createdAt?:      string;
  whatsappNumber?: string;
  gender?:         string;
  nationality?:    string;
  dateOfBirth?:    string;
  address?:        string;
  // Lawyer-specific (stored locally, editable in settings)
  specializations?: string[];
  yearsExperience?: number | null;
  officeLocation?:  string;
}

// ── Réponse de /api/auth/login ────────────────────────────────
interface LoginResponse {
  access_token?:  string;
  refresh_token?: string;
  token_type?:    string;
  requires_2fa?:  boolean;
  temp_token?:    string;
  user?: BackendUser;
}

interface BackendUser {
  id:              string;
  email:           string;
  full_name:       string;
  role:            string;
  firm_id:         string;
  firm_name:       string | null;
  avatar_url?:     string | null;
  phone?:          string | null;
  two_fa_enabled:  boolean;
  is_active?:      boolean;
  last_login_at?:  string | null;
  created_at?:     string | null;
}

const ROLE_MAP: Record<string, AppUser['role']> = {
  FIRM_ADMIN:  'admin',
  SUPER_ADMIN: 'admin',
  LAWYER:      'lawyer',
  PARALEGAL:   'paralegal',
  CLIENT:      'client',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http      = inject(HttpClient);
  private router    = inject(Router);
  private api       = environment.apiUrl;
  private supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    { auth: { flowType: 'implicit' } },
  );

  currentUser = signal<AppUser | null>(null);
  private _rememberMe = true; // default: persistent session

  constructor() {
    // When the interceptor clears the session (401 / refresh failure), clear the signal too.
    // Using a DOM event avoids a circular DI dependency (HttpClient ↔ interceptor ↔ AuthService).
    window.addEventListener('lh:session-cleared', () => this.currentUser.set(null));

    // Restore session from localStorage or sessionStorage (whichever holds the tokens).
    const stored = localStorage.getItem('current_user') ?? sessionStorage.getItem('current_user');
    const token  = localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token');
    if (stored && token && this._tokenValid()) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user    = JSON.parse(stored) as AppUser;
        if (payload.sub === user.id) {
          this.currentUser.set(user);
        } else {
          this._clearSession();
        }
      } catch { /* corrupted data — leave logged-out */ }
    }
  }

  // ── LOGIN ─────────────────────────────────────────────────────
  // Retourne le temp_token si 2FA requis, null sinon.
  async login(email: string, password: string, rememberMe = true): Promise<string | null> {
    this._rememberMe = rememberMe;
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.api}/api/auth/login`, { email, password })
    );

    if (res.requires_2fa && res.temp_token) {
      return res.temp_token;
    }

    this._storeSession(res);
    return null;
  }

  // ── MFA verification ─────────────────────────────────────────
  // factorId = temp_token reçu lors du login
  async verifyMfa(tempToken: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.api}/api/auth/2fa/login`, {
        temp_token: tempToken,
        code,
      })
    );
    this._storeSession(res);
  }

  // ── SIGN UP ───────────────────────────────────────────────────
  async signUp(params: {
    email:        string;
    password:     string;
    firstName:    string;
    lastName:     string;
    phone?:       string;
    firmName:     string;
    role:         AppUser['role'];
    officeCode?:  string;
    joinMethod?:  'code' | 'token';
    inviteToken?: string;
  }): Promise<void> {
    const fullName = `${params.firstName} ${params.lastName}`;
    let res: LoginResponse;

    if (params.role === 'admin') {
      res = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.api}/api/auth/register-firm`, {
          firm_name:         params.firmName,
          legal_entity_type: 'LLC',
          email:             params.email,
          password:          params.password,
          full_name:         fullName,
          phone:             params.phone ?? null,
        })
      );
    } else if (params.joinMethod === 'token') {
      // Lawyer joins via invitation token sent by admin
      res = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.api}/api/auth/accept-invite/lawyer`, {
          invite_token: params.inviteToken ?? '',
          email:        params.email,
          new_password: params.password,
        })
      );
    } else {
      // Lawyer joins via office code
      res = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.api}/api/auth/office-code/validate`, {
          code:      (params.officeCode ?? '').toUpperCase(),
          email:     params.email,
          password:  params.password,
          full_name: fullName,
        })
      );
    }

    this._storeSession(res);
  }

  // ── RESET PASSWORD ────────────────────────────────────────────
  async sendPasswordReset(email: string, _workspace?: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/api/auth/forgot-password`, { email })
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/api/auth/reset-password`, { token, new_password: newPassword })
    );
  }

  // ── DELETE ACCOUNT ───────────────────────────────────────────
  async deleteAccount(): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/auth/me`)
    );
    this._clearSession();
    this.router.navigate(['/auth']);
  }

  // ── LOGOUT ────────────────────────────────────────────────────
  async logout(): Promise<void> {
    this._clearSession();
    this.router.navigate(['/auth']);
    this.http.post(`${this.api}/api/auth/logout`, {}).subscribe({ error: () => {} });
  }

  // ── OAuth (Google, Microsoft) via Supabase ────────────────────
  // Flow: Supabase OAuth redirect → returns to /auth with #access_token in fragment
  // → handleOAuthCallback() sends that token to FastAPI → gets LegalHub JWT
  async loginWithOAuth(provider: 'google' | 'azure'): Promise<void> {
    // Persist provider before the full-page redirect so handleOAuthCallback can read it back
    sessionStorage.setItem('oauth_provider', provider === 'azure' ? 'microsoft' : provider);
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: provider === 'azure' ? 'azure' : 'google',
      options: {
        redirectTo: `${window.location.origin}/auth`,
        ...(provider === 'azure' ? { scopes: 'email profile openid' } : {}),
      },
    });
    if (error) throw new Error(error.message);
    // Supabase triggers a full-page redirect — execution stops here
  }

  // Called on /auth load when returning from Google OAuth redirect.
  // Implicit flow: Supabase puts #access_token=... directly in the URL hash.
  // Returns { handled: true } on success, or { handled: true, requires2fa: true, tempToken } if 2FA is required.
  async handleOAuthCallback(): Promise<{ handled: boolean; requires2fa?: boolean; tempToken?: string }> {
    if (!window.location.hash.includes('access_token')) return { handled: false };

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const oauthError = hashParams.get('error_description') || hashParams.get('error');
    if (oauthError) throw new Error(decodeURIComponent(oauthError));

    const { data: { session }, error } = await this.supabase.auth.getSession();
    if (error) throw new Error(`Supabase session error: ${error.message}`);
    if (!session?.access_token) {
      throw new Error('No Supabase session found after OAuth redirect. Make sure Google provider is enabled and the redirect URL is whitelisted in Supabase.');
    }

    // Read the provider that was set before the OAuth redirect (most reliable source)
    const sourceProvider = sessionStorage.getItem('oauth_provider');
    sessionStorage.removeItem('oauth_provider');

    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.api}/api/auth/oauth/token`, {
        provider:        'supabase',
        token:           session.access_token,
        token_type:      'access_token',
        source_provider: sourceProvider,
      })
    );

    await this.supabase.auth.signOut();
    history.replaceState(null, '', window.location.pathname);

    if (res.requires_2fa && res.temp_token) {
      return { handled: true, requires2fa: true, tempToken: res.temp_token };
    }

    this._storeSession(res);
    return { handled: true };
  }

  // ── Helpers exposés ───────────────────────────────────────────
  isLoggedIn(): boolean {
    return this.currentUser() !== null && this._tokenValid();
  }

  getUserRole(): string {
    return this.currentUser()?.role ?? '';
  }

  /** Compatibilité avec auth.ts — vérifie la session locale */
  async getSession(): Promise<{ data: { session: { user: AppUser } | null } }> {
    const user = this.currentUser();
    if (user && this._tokenValid()) {
      return { data: { session: { user } } };
    }
    return { data: { session: null } };
  }

  // ── Profile update ───────────────────────────────────────────

  /** Upload un fichier image vers le backend → renvoie l'URL publique Supabase */
  async uploadAvatar(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ avatar_url: string }>(`${this.api}/api/auth/avatar`, form)
    );
    this._patchCurrentUser({ avatar: res.avatar_url });
    return res.avatar_url;
  }

  /** Met à jour full_name, phone et/ou avatar_url sur le backend */
  async updateProfile(data: { full_name?: string; phone?: string; avatar_url?: string | null }): Promise<void> {
    const res = await firstValueFrom(
      this.http.put<{ full_name: string; phone: string | null; avatar_url: string | null }>(
        `${this.api}/api/auth/me`, data
      )
    );
    this._patchCurrentUser({
      name:   res.full_name,
      phone:  res.phone ?? undefined,
      avatar: res.avatar_url ?? '',
    });
  }

  /** Change l'email (vérifié côté backend) — force la déconnexion après succès */
  async changeEmail(newEmail: string, currentPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.put<{ message: string }>(
        `${this.api}/api/auth/change-email`,
        { new_email: newEmail, current_password: currentPassword }
      )
    );
    this._clearSession();
    this.router.navigate(['/auth']);
  }

  /** Change le mot de passe (vérifié côté backend) */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.api}/api/auth/change-password`, {
        current_password: currentPassword,
        new_password:     newPassword,
      })
    );
  }

  /** Met à jour partiellement le currentUser signal + localStorage */
  private _patchCurrentUser(patch: Partial<AppUser>): void {
    const u = this.currentUser();
    if (!u) return;
    const updated = { ...u, ...patch };
    this.currentUser.set(updated);
    // Write to whichever storage holds the current session
    const storage = sessionStorage.getItem('access_token') ? sessionStorage : localStorage;
    storage.setItem('current_user', JSON.stringify(updated));
  }

  // ── Login history ─────────────────────────────────────────────
  async getLoginHistory(): Promise<{ id: string; logged_in_at: string; login_method?: string | null }[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<{ id: string; logged_in_at: string; login_method?: string | null }[]>(
          `${this.api}/api/auth/login-history`
        )
      );
      return data ?? [];
    } catch {
      return [];
    }
  }

  // ── Notification preferences ──────────────────────────────────
  async getNotificationPreferences(): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.http.get<Record<string, unknown>>(`${this.api}/api/auth/notification-preferences`)
    );
  }

  async updateNotificationPreferences(prefs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.http.put<Record<string, unknown>>(`${this.api}/api/auth/notification-preferences`, prefs)
    );
  }

  // ── 2FA ───────────────────────────────────────────────────────
  async setup2FA(): Promise<{ secret: string; qr_code_url: string }> {
    return firstValueFrom(
      this.http.post<{ secret: string; qr_code_url: string }>(`${this.api}/api/auth/2fa/setup`, {})
    );
  }

  async verify2FA(code: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/auth/2fa/verify`, { code })
    );
  }

  async disable2FA(code: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.request<{ message: string }>('DELETE', `${this.api}/api/auth/2fa/disable`, {
        body: { code }
      })
    );
  }

  // ── Lawyer profile ────────────────────────────────────────────
  async getLawyerProfile(): Promise<{
    title?: string | null;
    bar_license_number?: string | null;
    bar_license_state?: string | null;
    specializations?: string[] | null;
    years_experience?: number | null;
    office_location?: string | null;
  }> {
    return firstValueFrom(
      this.http.get<{
        title?: string | null;
        bar_license_number?: string | null;
        bar_license_state?: string | null;
        specializations?: string[] | null;
        years_experience?: number | null;
        office_location?: string | null;
      }>(`${this.api}/api/auth/lawyer-profile`)
    );
  }

  async updateLawyerProfile(data: {
    title?: string | null;
    specializations?: string[] | null;
    years_experience?: number | null;
    office_location?: string | null;
  }): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.api}/api/auth/lawyer-profile`, data)
    );
  }

  // ── Invite ────────────────────────────────────────────────────
  async inviteLawyer(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/api/auth/invite/lawyer`, { email, full_name: email })
    );
  }

  async inviteClient(email: string, phone?: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/api/auth/invite/client`, {
        email,
        full_name: email,
        phone: phone ?? null,
      })
    );
  }

  // ── Session helpers ───────────────────────────────────────────
  private _storeSession(res: LoginResponse): void {
    const storage = this._rememberMe ? localStorage : sessionStorage;
    const other   = this._rememberMe ? sessionStorage : localStorage;
    // Remove from the other storage to avoid stale tokens
    ['access_token', 'refresh_token', 'current_user'].forEach(k => other.removeItem(k));

    if (res.access_token)  storage.setItem('access_token',  res.access_token);
    if (res.refresh_token) storage.setItem('refresh_token', res.refresh_token);

    if (res.user) {
      const appUser = this._mapUser(res.user);
      this.currentUser.set(appUser);
      storage.setItem('current_user', JSON.stringify(appUser));
      this._recordLoginEntry(appUser.id);
    }
  }

  private _loginHistoryKey(userId: string): string {
    return `lh_login_history_${userId}`;
  }

  private _recordLoginEntry(userId: string): void {
    const key     = this._loginHistoryKey(userId);
    const raw     = localStorage.getItem(key);
    const entries: { id: string; logged_in_at: string }[] = raw ? JSON.parse(raw) : [];
    entries.unshift({ id: `local_${Date.now()}`, logged_in_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(entries.slice(0, 100)));
  }

  getLocalLoginHistory(userId: string): { id: string; logged_in_at: string }[] {
    const raw = localStorage.getItem(this._loginHistoryKey(userId));
    return raw ? JSON.parse(raw) : [];
  }

  private _clearSession(): void {
    ['access_token', 'refresh_token', 'current_user'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    this.currentUser.set(null);
  }

  private _tokenValid(): boolean {
    const token = localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  private _mapUser(u: BackendUser): AppUser {
    return {
      id:           u.id,
      email:        u.email,
      name:         u.full_name || u.email,
      title:        ROLE_MAP[u.role] === 'admin' ? 'Firm Administrator'
                  : ROLE_MAP[u.role] === 'lawyer' ? 'Attorney at Law'
                  : u.role,
      avatar:       u.avatar_url ?? '',
      role:         ROLE_MAP[u.role] ?? 'lawyer',
      firmName:     u.firm_name ?? '',
      firmId:       u.firm_id,
      phone:        u.phone ?? undefined,
      twoFaEnabled: u.two_fa_enabled,
      isActive:     u.is_active,
      lastLoginAt:  u.last_login_at ?? undefined,
      createdAt:    u.created_at ?? undefined,
    };
  }

  async refreshCurrentUser(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<BackendUser & { created_at?: string | null }>(`${this.api}/api/auth/me`)
      );
      this._patchCurrentUser({
        name:         res.full_name || res.email,
        phone:        res.phone ?? undefined,
        avatar:       res.avatar_url ?? '',
        twoFaEnabled: res.two_fa_enabled,
        isActive:     res.is_active,
        lastLoginAt:  res.last_login_at ?? undefined,
        createdAt:    res.created_at ?? undefined,
      });
    } catch { /* silent — keep cached data */ }
  }
}
