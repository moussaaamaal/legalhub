import { Component, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { AuthService, AppUser } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './profile.html',
})
export class Profile {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private sanitizer   = inject(DomSanitizer);

  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;

  currentUser = this.authService.currentUser;

  // Edit form fields
  editName  = signal('');
  editPhone = signal('');
  editTitle = signal('');

  // ── Avatar ────────────────────────────────────────────────────
  /** Fichier sélectionné (conservé pour l'envoi multipart) */
  selectedFile     = signal<File | null>(null);
  /** base64 preview locale avant envoi */
  avatarPreview    = signal<string | null>(null);
  /** true si l'image stockée a échoué à charger */
  avatarLoadFailed = signal(false);
  showLightbox     = signal(false);
  avatarSaving     = signal(false);
  avatarSuccess    = signal(false);
  avatarError      = signal('');

  // ── Password ──────────────────────────────────────────────────
  currentPwd  = signal('');
  newPwd      = signal('');
  confirmPwd  = signal('');
  showCurrent = signal(false);
  showNew     = signal(false);
  showConfirm = signal(false);

  // ── UI state ──────────────────────────────────────────────────
  activeTab   = signal<'info' | 'security'>('info');
  saving      = signal(false);
  saveSuccess = signal(false);
  pwdSaving   = signal(false);
  pwdSuccess  = signal(false);
  error       = signal('');
  pwdError    = signal('');

  // ── Getters ───────────────────────────────────────────────────
  get user(): AppUser | null { return this.currentUser(); }

  get displayAvatar(): SafeUrl | null {
    const preview = this.avatarPreview();
    if (preview) return this.sanitizer.bypassSecurityTrustUrl(preview);
    if (this.avatarLoadFailed()) return null;
    const src = this.user?.avatar ?? null;
    return src ? this.sanitizer.bypassSecurityTrustUrl(src) : null;
  }

  get savedAvatar(): SafeUrl | null {
    if (this.avatarLoadFailed()) return null;
    const src = this.user?.avatar ?? null;
    return src ? this.sanitizer.bypassSecurityTrustUrl(src) : null;
  }

  get hasSavedAvatar(): boolean {
    return !!this.user?.avatar && !this.avatarLoadFailed();
  }

  get initials(): string {
    return (this.user?.name ?? '')
      .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      admin: 'Firm Administrator', lawyer: 'Attorney at Law',
      paralegal: 'Paralegal',      client: 'Client',
    };
    return map[this.user?.role ?? ''] ?? this.user?.role ?? '';
  }

  get roleBadgeClass(): string {
    const map: Record<string, string> = {
      admin:     'bg-red-100 text-red-700',
      lawyer:    'bg-blue-100 text-blue-700',
      paralegal: 'bg-purple-100 text-purple-700',
      client:    'bg-green-100 text-green-700',
    };
    return map[this.user?.role ?? ''] ?? 'bg-gray-100 text-gray-700';
  }

  get pwdMismatch(): boolean {
    return !!this.confirmPwd() && this.newPwd() !== this.confirmPwd();
  }

  // ── Avatar — sélection ────────────────────────────────────────

  triggerAvatarPicker(): void { this.avatarInput.nativeElement.click(); }

  onAvatarSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.avatarError.set('');
    if (!file.type.startsWith('image/')) { this.avatarError.set('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024)    { this.avatarError.set('Image must be smaller than 5 MB.'); return; }
    this.selectedFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  cancelAvatarChange(): void {
    this.avatarPreview.set(null);
    this.selectedFile.set(null);
    this.avatarError.set('');
  }

  /** Upload le fichier vers le backend → URL Supabase persistée en DB */
  async confirmAvatar(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.avatarSaving.set(true);
    this.avatarError.set('');
    try {
      await this.authService.uploadAvatar(file);
      this.avatarPreview.set(null);
      this.selectedFile.set(null);
      this.avatarLoadFailed.set(false);
      this.avatarSuccess.set(true);
      setTimeout(() => this.avatarSuccess.set(false), 2500);
    } catch (err: unknown) {
      this.avatarError.set(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      this.avatarSaving.set(false);
    }
  }

  /** Supprime la photo — met avatar_url à null en base */
  async removeAvatar(): Promise<void> {
    this.avatarPreview.set(null);
    this.selectedFile.set(null);
    try {
      await this.authService.updateProfile({ avatar_url: null });
      this.avatarLoadFailed.set(false);
    } catch {
      // Échec silencieux — on nettoie quand même localement
      const u = this.user;
      if (u) {
        const cleaned = { ...u, avatar: '' };
        this.authService.currentUser.set(cleaned);
        localStorage.setItem('current_user', JSON.stringify(cleaned));
      }
    }
  }

  onAvatarLoadError(): void {
    this.avatarLoadFailed.set(true);
    const u = this.user;
    if (u) {
      const cleaned = { ...u, avatar: '' };
      this.authService.currentUser.set(cleaned);
      localStorage.setItem('current_user', JSON.stringify(cleaned));
    }
  }

  // ── Lightbox ──────────────────────────────────────────────────
  openLightbox():  void { this.showLightbox.set(true); }
  closeLightbox(): void { this.showLightbox.set(false); }

  // ── Profile save ──────────────────────────────────────────────
  async saveProfile(): Promise<void> {
    if (!this.editName().trim()) { this.error.set('Name is required.'); return; }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.authService.updateProfile({
        full_name: this.editName().trim(),
        phone:     this.editPhone() || undefined,
      });
      // title est local uniquement (pas en base)
      const u = this.user;
      if (u && this.editTitle() !== u.title) {
        const updated = { ...u, title: this.editTitle() };
        this.authService.currentUser.set(updated);
        localStorage.setItem('current_user', JSON.stringify(updated));
      }
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Update failed. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Password change ───────────────────────────────────────────
  async changePassword(): Promise<void> {
    if (!this.currentPwd()) { this.pwdError.set('Enter your current password.'); return; }
    if (this.newPwd().length < 8) { this.pwdError.set('New password must be at least 8 characters.'); return; }
    if (this.newPwd() !== this.confirmPwd()) { this.pwdError.set('Passwords do not match.'); return; }
    this.pwdSaving.set(true);
    this.pwdError.set('');
    try {
      await this.authService.changePassword(this.currentPwd(), this.newPwd());
      this.pwdSuccess.set(true);
      this.currentPwd.set(''); this.newPwd.set(''); this.confirmPwd.set('');
      setTimeout(() => this.pwdSuccess.set(false), 3000);
    } catch (err: unknown) {
      this.pwdError.set(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      this.pwdSaving.set(false);
    }
  }

  goBack(): void { this.router.navigate(['/dashboard']); }

  ngOnInit(): void {
    this.editName.set(this.user?.name ?? '');
    this.editPhone.set(this.user?.phone ?? '');
    this.editTitle.set(this.user?.title ?? '');
  }
}
