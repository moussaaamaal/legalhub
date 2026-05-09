import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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
  phone?:   string;
  twoFaEnabled: boolean;
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
  last_login_at?:  string | null;
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
  private http   = inject(HttpClient);
  private router = inject(Router);
  private api    = environment.apiUrl;

  // Signal global — consommé par Sidebar, Dashboard, etc.
  currentUser = signal<AppUser | null>(null);

  constructor() {
    // Restaurer la session depuis localStorage au démarrage
    const stored = localStorage.getItem('current_user');
    if (stored && this._tokenValid()) {
      try { this.currentUser.set(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }

  // ── LOGIN ─────────────────────────────────────────────────────
  // Retourne le temp_token si 2FA requis, null sinon.
  async login(email: string, password: string): Promise<string | null> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${this.api}/api/auth/login`, { email, password })
    );

    if (res.requires_2fa && res.temp_token) {
      return res.temp_token;   // passé comme "factorId" au composant
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
    email:       string;
    password:    string;
    firstName:   string;
    lastName:    string;
    phone?:      string;
    firmName:    string;
    role:        AppUser['role'];
    officeCode?: string;
  }): Promise<void> {
    const fullName = `${params.firstName} ${params.lastName}`;

    let res: LoginResponse;

    if (params.role === 'admin') {
      // Crée la firm + compte FIRM_ADMIN
      res = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.api}/api/auth/register-firm`, {
          firm_name:          params.firmName,
          legal_entity_type:  'LLC',
          email:              params.email,
          password:           params.password,
          full_name:          fullName,
          phone:              params.phone ?? null,
        })
      );
    } else {
      // Lawyer rejoint via code bureau
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

  // ── LOGOUT ────────────────────────────────────────────────────
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.api}/api/auth/logout`, {}));
    } catch { /* ignore if token already expired */ }
    this._clearSession();
    this.router.navigate(['/auth']);
  }

  // ── OAuth (Google, Microsoft) ─────────────────────────────────
  // Le backend FastAPI ne gère pas OAuth directement — redirection Supabase conservée
  async loginWithOAuth(_provider: 'google' | 'azure'): Promise<void> {
    throw new Error('OAuth non configuré sur ce backend. Utilisez email/mot de passe.');
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
    localStorage.setItem('current_user', JSON.stringify(updated));
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
    if (res.access_token)  localStorage.setItem('access_token',  res.access_token);
    if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token);

    if (res.user) {
      const appUser = this._mapUser(res.user);
      this.currentUser.set(appUser);
      localStorage.setItem('current_user', JSON.stringify(appUser));
    }
  }

  private _clearSession(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_user');
    this.currentUser.set(null);
  }

  private _tokenValid(): boolean {
    const token = localStorage.getItem('access_token');
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
    };
  }
}
