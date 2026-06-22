import { Component, signal, inject, NgZone } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

type AuthMode = 'login' | 'signup';
type AuthStep = 'credentials' | 'mfa';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './auth.html',
  styleUrl: './auth.css'
})
export class Auth {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private ngZone      = inject(NgZone);

  // ── Mode & authentication step ────────────
  mode     = signal<AuthMode>('login');
  authStep = signal<AuthStep>('credentials');

  switchTo(m: AuthMode): void {
    this.mode.set(m);
    this.error.set('');
    this.signupStep.set(1);
    this.signupType.set(null);
    this.authStep.set('credentials');
    this.mfaCode.set('');
    this.pwdLocked.set(true);
  }

  // ── Shared ────────────────────────────────
  showPassword = signal(false);
  showConfirm  = signal(false);
  loading      = signal(false);
  error        = signal('');

  togglePassword(): void { this.showPassword.update(v => !v); }
  toggleConfirm():  void { this.showConfirm.update(v => !v);  }

  // ── WEB-AUTH-02 — Email/password login ────
  email      = signal('');
  password   = signal('');
  rememberMe = signal(false);
  pwdLocked  = signal(true); // readonly until focus — prevents browser autofill

  // True while we exchange the Supabase OAuth token with the backend
  processingOAuth = signal(false);

  private oauthTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const hasOAuthReturn = window.location.hash.includes('access_token');
    if (hasOAuthReturn) {
      this.processingOAuth.set(true);
      // Guarantee change detection fires even if the callback runs outside Angular's zone
      this.oauthTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          this.processingOAuth.set(false);
          this.error.set('Google sign-in timed out. Please try again or sign in with email.');
          history.replaceState(null, '', window.location.pathname);
        });
      }, 10000);

      this.authService.handleOAuthCallback()
        .then(result => {
          this.ngZone.run(() => {
            if (this.oauthTimeout) { clearTimeout(this.oauthTimeout); this.oauthTimeout = null; }
            if (!result.handled) {
              this.processingOAuth.set(false);
              this.error.set('Google sign-in could not be completed. Please try again.');
              history.replaceState(null, '', window.location.pathname);
            } else if (result.requires2fa && result.tempToken) {
              this.processingOAuth.set(false);
              this.mfaFactorId.set(result.tempToken);
              this.authStep.set('mfa');
            } else {
              this.router.navigate(['/dashboard']);
            }
          });
        })
        .catch(err => {
          this.ngZone.run(() => {
            if (this.oauthTimeout) { clearTimeout(this.oauthTimeout); this.oauthTimeout = null; }
            this.processingOAuth.set(false);
            const detail = err?.error?.detail ?? err?.message ?? 'Google sign-in failed. Please try again.';
            this.error.set(detail);
            history.replaceState(null, '', window.location.pathname);
          });
        });
    } else {
      this.authService.getSession().then(({ data }) => {
        if (data.session) this.router.navigate(['/dashboard']);
      });
    }
  }

  cancelOAuth(): void {
    if (this.oauthTimeout) { clearTimeout(this.oauthTimeout); this.oauthTimeout = null; }
    this.processingOAuth.set(false);
    history.replaceState(null, '', window.location.pathname);
  }

  private _errMsg(err: unknown): string {
    if (err && typeof err === 'object') {
      // HttpErrorResponse: extract backend detail
      const detail = (err as { error?: { detail?: string } }).error?.detail;
      if (detail) return detail;
      // Network / connection refused
      const status = (err as { status?: number }).status;
      if (status === 0) return 'Cannot connect to server. Is the backend running?';
      const msg = (err as { message?: string }).message;
      if (msg) return msg;
    }
    if (err instanceof Error) return err.message;
    return 'An error occurred.';
  }

  async login(): Promise<void> {
    if (!this.email() || !this.password()) { this.error.set('Please fill in all fields.'); return; }
    this.loading.set(true); this.error.set('');
    try {
      const tempToken = await this.authService.login(this.email(), this.password(), this.rememberMe());
      if (tempToken) {
        this.mfaFactorId.set(tempToken);
        this.authStep.set('mfa');
      } else {
        this.router.navigate(['/dashboard']);
      }
    } catch (err: unknown) {
      const msg = this._errMsg(err);
      if (msg.includes('Wrong password') || msg.includes('User not found')) {
        this.error.set('Invalid email or password. Please try again.');
      } else {
        this.error.set(msg);
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ── WEB-AUTH-03 — OAuth SSO ───────────────
  async loginWithGoogle(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      await this.authService.loginWithOAuth('google');
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Google sign-in failed.');
      this.loading.set(false);
    }
  }

  async loginWithMicrosoft(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      await this.authService.loginWithOAuth('azure');
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Microsoft sign-in failed.');
      this.loading.set(false);
    }
  }

  // ── WEB-AUTH-04 — Two-factor authentication
  mfaCode     = signal('');
  mfaFactorId = signal('');

  async verifyMfa(): Promise<void> {
    const code = this.mfaCode().replace(/\D/g, '');
    if (code.length !== 6) { this.error.set('Please enter the 6-digit code.'); return; }
    this.loading.set(true); this.error.set('');
    try {
      await this.authService.verifyMfa(this.mfaFactorId(), code);
      this.router.navigate(['/dashboard']);
    } catch {
      this.mfaCode.set('');
      this.error.set('Invalid code. Open your authenticator app and enter the current code.');
    } finally {
      this.loading.set(false);
    }
  }

  backFromMfa(): void {
    this.authStep.set('credentials');
    this.mfaCode.set('');
    this.error.set('');
  }

  // ── WEB-AUTH-05 — Password reset ──────────
  showForgotModal  = signal(false);
  resetEmail       = signal('');
  resetSent        = signal(false);
  resetCode        = signal('');
  resetNewPwd      = signal('');
  resetConfirmPwd  = signal('');
  resetError       = signal('');
  resetSuccess     = signal(false);
  resetLoading     = signal(false);
  showResetPwd     = signal(false);

  openForgotModal(): void {
    this.showForgotModal.set(true);
    this.resetSent.set(false);
    this.resetEmail.set('');
    this.resetCode.set('');
    this.resetNewPwd.set('');
    this.resetConfirmPwd.set('');
    this.resetError.set('');
    this.resetSuccess.set(false);
    this.showResetPwd.set(false);
  }

  closeForgotModal(): void { this.showForgotModal.set(false); }

  async sendReset(): Promise<void> {
    if (!this.resetEmail()) return;
    try {
      await this.authService.sendPasswordReset(this.resetEmail());
    } catch { /* avoid email enumeration */ }
    this.resetSent.set(true);
    this.resetError.set('');
  }

  async submitResetPassword(): Promise<void> {
    if (this.resetCode().length !== 6) { this.resetError.set('Please enter the 6-digit code from your email.'); return; }
    if (this.resetNewPwd().length < 8) { this.resetError.set('Password must be at least 8 characters.'); return; }
    if (this.resetNewPwd() !== this.resetConfirmPwd()) { this.resetError.set('Passwords do not match.'); return; }
    this.resetLoading.set(true);
    this.resetError.set('');
    try {
      await this.authService.resetPassword(this.resetCode(), this.resetNewPwd());
      this.resetSuccess.set(true);
    } catch (err: unknown) {
      this.resetError.set(this._errMsg(err));
    } finally {
      this.resetLoading.set(false);
    }
  }

  // ── SIGN UP ───────────────────────────────
  // Step 0 → type selector; step 1 → personal info; step 2 → firm info
  signupType          = signal<'admin' | 'lawyer' | null>(null);
  signupStep          = signal<1 | 2>(1);
  signupSuccess       = signal(false);
  generatedOfficeCode = signal('');   // revealed to admin after registration

  // Personal info (shared by both types)
  su_firstName = signal('');
  su_lastName  = signal('');
  su_email     = signal('');
  su_phone     = signal('');          // required for both
  su_password  = signal('');
  su_confirm   = signal('');

  // Firm info
  su_firmName    = signal('');
  su_officeCode  = signal('');
  su_joinMethod  = signal<'code' | 'token'>('code');
  su_inviteToken = signal('');

  // Consents
  su_agreeTerms  = signal(false);
  su_gdprConsent = signal(false);

  selectSignupType(t: 'admin' | 'lawyer'): void {
    this.signupType.set(t);
    this.signupStep.set(1);
    this.su_joinMethod.set('code');
    this.error.set('');
  }

  backToTypeSelector(): void {
    this.signupType.set(null);
    this.signupStep.set(1);
    this.su_joinMethod.set('code');
    this.su_inviteToken.set('');
    this.error.set('');
  }

  // Step 1 validation
  get step1Valid(): boolean {
    return !!this.su_firstName().trim() && !!this.su_lastName().trim() &&
           !!this.su_email().trim()     && !!this.su_phone().trim()    &&
           this.su_password().length >= 8 && this.su_password() === this.su_confirm();
  }
  get passwordMismatch(): boolean {
    return !!this.su_confirm() && this.su_password() !== this.su_confirm();
  }
  get passwordStrength(): 'weak' | 'medium' | 'strong' {
    const p = this.su_password();
    if (p.length < 8) return 'weak';
    if (p.length < 12 || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) return 'medium';
    return 'strong';
  }
  get strengthColor(): string {
    return { weak: 'bg-red-500', medium: 'bg-amber-500', strong: 'bg-green-500' }[this.passwordStrength];
  }
  get strengthWidth(): string {
    return { weak: 'w-1/3', medium: 'w-2/3', strong: 'w-full' }[this.passwordStrength];
  }

  // Step 2 validation
  get step2Valid(): boolean {
    const consents = this.su_agreeTerms() && this.su_gdprConsent();
    if (this.signupType() === 'admin') return consents && !!this.su_firmName().trim();
    if (this.su_joinMethod() === 'token') return consents && !!this.su_inviteToken().trim();
    return consents && !!this.su_officeCode().trim();
  }

  nextStep(): void {
    if (!this.step1Valid) { this.error.set('Please complete all required fields correctly.'); return; }
    this.error.set('');
    this.signupStep.set(2);
  }

  private generateOfficeCode(): string {
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (n: number) =>
      Array.from({ length: n }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
    return `LF-${seg(4)}-${seg(4)}`;
  }

  async signup(): Promise<void> {
    if (!this.step2Valid) { this.error.set('Please complete all required fields and accept the terms.'); return; }
    this.loading.set(true); this.error.set('');
    const isAdmin = this.signupType() === 'admin';
    try {
      await this.authService.signUp({
        email:       this.su_email(),
        password:    this.su_password(),
        firstName:   this.su_firstName(),
        lastName:    this.su_lastName(),
        phone:       this.su_phone(),
        firmName:    this.su_firmName(),
        role:        isAdmin ? 'admin' : 'lawyer',
        officeCode:  isAdmin ? this.generateOfficeCode() : this.su_officeCode().trim().toUpperCase(),
        joinMethod:  this.su_joinMethod(),
        inviteToken: this.su_inviteToken().trim(),
      });
      if (isAdmin) this.generatedOfficeCode.set(this.authService.currentUser()?.firmName ?? '');
      // Show firm name on success screen for lawyer
      if (!isAdmin) {
        const firmName = this.authService.currentUser()?.firmName;
        if (firmName) this.su_firmName.set(firmName);
      }
      this.signupSuccess.set(true);
    } catch (err: unknown) {
      const msg = this._errMsg(err);
      this.error.set(msg.includes('already registered') || msg.includes('Email already registered')
        ? 'This email is already registered. Please sign in instead.' : msg);
    } finally {
      this.loading.set(false);
    }
  }
}
