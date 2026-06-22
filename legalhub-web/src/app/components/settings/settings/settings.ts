import { Component, signal, computed, inject, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { NgClass, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SettingsService } from '../../../services/settings.service';
import { StaffService, StaffMember } from '../../../services/staff.service';
import { AuthService, AppUser } from '../../../services/auth.service';
import { DashboardService } from '../../../services/dashboard.service';
import { ClientService } from '../../../services/client.service';

interface PermRow {
  feature: string;
  admin:  'check' | 'partial' | 'none';
  lawyer: 'check' | 'partial' | 'none';
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [NgClass, FormsModule, DatePipe],
  templateUrl: './settings.html',
})
export class Settings implements OnInit, OnDestroy {

  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;
  @ViewChild('logoInput')   logoInput!:   ElementRef<HTMLInputElement>;

  private settingsService  = inject(SettingsService);
  private staffService     = inject(StaffService);
  private authService      = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private clientService    = inject(ClientService);
  private sanitizer        = inject(DomSanitizer);

  currentUser = this.authService.currentUser;
  isAdmin     = computed(() => this.currentUser()?.role === 'admin');
  isLawyer    = computed(() => this.currentUser()?.role === 'lawyer');

  // ── Toast ─────────────────────────────────────────────
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  private _showToast(type: 'success' | 'error', msg: string) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this.toast.set({ type, msg });
    this._toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  // ── Global loading ────────────────────────────────────
  loading = signal(true);

  // ── Nav tabs ─────────────────────────────────────────
  activeTab = signal('Profile');

  private readonly ADMIN_TABS = [
    { label: 'Profile',             icon: 'fa-solid fa-user' },
    { label: 'Office profile',      icon: 'fa-solid fa-building' },
    { label: 'Roles & Permissions', icon: 'fa-solid fa-user-shield' },
    { label: 'Notifications',       icon: 'fa-solid fa-bell' },
    { label: 'Security',            icon: 'fa-solid fa-shield-halved' },
    { label: 'Integrations',        icon: 'fa-solid fa-plug' },
  ];

  private readonly LAWYER_TABS = [
    { label: 'Profile',        icon: 'fa-solid fa-user' },
    { label: 'Office profile', icon: 'fa-solid fa-building' },
    { label: 'Notifications',  icon: 'fa-solid fa-bell' },
    { label: 'Security',       icon: 'fa-solid fa-shield-halved' },
    { label: 'Integrations',   icon: 'fa-solid fa-plug' },
  ];

  visibleTabs = computed(() => this.isAdmin() ? this.ADMIN_TABS : this.LAWYER_TABS);

  setTab(t: string) {
    this.activeTab.set(t);
    if (t === 'Integrations')        this.loadIntegrations();
    if (t === 'Profile')             this.loadLoginHistory();
    if (t === 'Roles & Permissions') this.staffService.loadStaff().catch(() => {});
    if (t === 'Security')            this.loadLoginHistory();
  }

  // ── Firm Stats (Office Profile header) ───────────────
  statCases   = signal<number | null>(null);
  statClients = signal<number | null>(null);
  statTeam    = signal<number | null>(null);

  // ── Edit mode (admin only) ────────────────────────────
  editMode = signal(false);

  // ── Office Profile ────────────────────────────────────
  officeName   = signal('');
  entityType   = signal('LLP – Limited Liability Partnership');
  regNumber    = signal('');
  taxId        = signal('');
  address      = signal('');
  city         = signal('');
  state        = signal('');
  zip          = signal('');
  phone        = signal('');
  email        = signal('');
  description  = signal('');
  officeCode      = signal('');
  firmCreatedAt   = signal('');
  practiceAreas   = signal<string[]>([]);
  practiceAreaColors  = ['bg-blue-100 text-blue-700','bg-green-100 text-green-700','bg-amber-100 text-amber-700','bg-purple-100 text-purple-700','bg-red-100 text-red-700'];
  newPracticeArea     = signal('');
  entityTypes         = ['LLP – Limited Liability Partnership','PC – Professional Corporation','Sole Proprietorship','Partnership'];

  profileSaving = signal(false);

  addPracticeArea() {
    const v = this.newPracticeArea().trim();
    if (v) { this.practiceAreas.update(a => [...a, v]); this.newPracticeArea.set(''); }
  }
  removePracticeArea(i: number) { this.practiceAreas.update(a => a.filter((_, idx) => idx !== i)); }

  async saveFirmProfile() {
    this.profileSaving.set(true);
    try {
      await this.settingsService.updateFirmProfile({
        name:                this.officeName(),
        legal_entity_type:   this.entityType(),
        registration_number: this.regNumber(),
        tax_id:              this.taxId(),
        address:             this.address(),
        city:                this.city(),
        country:             this.state(),
        phone:               this.phone(),
        email:               this.email(),
        description:         this.description(),
        practice_areas:      this.practiceAreas(),
      });
      this._showToast('success', 'Office profile saved successfully');
      this.editMode.set(false);
    } catch {
      this._showToast('error', 'Failed to save office profile');
    } finally {
      this.profileSaving.set(false);
    }
  }

  quickStats = computed(() => [
    { label: 'Active Lawyers',    value: String(this.staffService.staff().filter(m => m.status === 'Active' && m.role === 'LAWYER').length || '—') },
    { label: 'Support Staff',     value: String(this.staffService.staff().filter(m => m.role === 'FIRM_ADMIN').length || '—') },
    { label: 'Total Team',        value: String(this.staffService.staff().length || '—') },
    { label: 'Office Code',       value: this.officeCode() || '—' },
  ]);

  // ── Subscription ─────────────────────────────────────
  plans = [
    { badge: 'Basic',        badgeCls: 'bg-gray-100 text-gray-700',    price: '$49',    sub: 'For small practices',  current: false, features: ['Up to 3 users','50 active cases','10GB storage','Basic support'] },
    { badge: 'Professional', badgeCls: 'bg-blue-100 text-blue-700',    price: '$149',   sub: 'For growing firms',    current: false, features: ['Up to 10 users','200 active cases','100GB storage','Priority support'] },
    { badge: 'Enterprise',   badgeCls: 'bg-amber-100 text-amber-700',  price: '$399',   sub: 'For large practices',  current: false, features: ['Unlimited users','Unlimited cases','1TB storage','24/7 support'] },
    { badge: 'Custom',       badgeCls: 'bg-purple-100 text-purple-700',price: 'Custom', sub: 'Tailored solution',    current: false, features: ['Custom users','Custom cases','Custom storage','Dedicated support'] },
  ];

  subscriptionBillingCycle  = signal('Monthly');
  subscriptionNextBilling   = signal('—');
  subscriptionAmountDue     = signal('—');
  subscriptionPaymentMethod = signal('—');

  usageBars = [
    { label: 'Active Users', value: '— / —', pct: 0, color: 'bg-green-500' },
    { label: 'Active Cases', value: '— / —', pct: 0, color: 'bg-blue-500' },
    { label: 'Storage Used', value: '— / —', pct: 0, color: 'bg-amber-500' },
  ];
  billingHistory = [
    { month: '—', paid: '—', amount: '—' },
  ];

  // ── Roles & Permissions ───────────────────────────────
  permMatrix: PermRow[] = [
    { feature: 'Dashboard Access',   admin: 'check',   lawyer: 'check'   },
    { feature: 'Create Cases',       admin: 'check',   lawyer: 'check'   },
    { feature: 'Edit All Cases',     admin: 'check',   lawyer: 'partial' },
    { feature: 'Delete Cases',       admin: 'check',   lawyer: 'none'    },
    { feature: 'Client Management',  admin: 'check',   lawyer: 'check'   },
    { feature: 'Document Upload',    admin: 'check',   lawyer: 'check'   },
    { feature: 'Billing & Invoices', admin: 'check',   lawyer: 'partial' },
    { feature: 'Financial Reports',  admin: 'check',   lawyer: 'none'    },
    { feature: 'AI Assistant',       admin: 'check',   lawyer: 'check'   },
    { feature: 'User Management',    admin: 'check',   lawyer: 'none'    },
    { feature: 'System Settings',    admin: 'check',   lawyer: 'none'    },
  ];
  permIcon(v: 'check'|'partial'|'none') {
    if (v === 'check')   return 'fa-solid fa-check-circle text-green-500';
    if (v === 'partial') return 'fa-solid fa-minus-circle text-amber-500';
    return 'fa-solid fa-times-circle text-red-500';
  }

  permsSaving      = signal(false);
  editPermissions  = signal(false);

  cyclePerm(row: PermRow): void {
    const order: Array<'check'|'partial'|'none'> = ['check', 'partial', 'none'];
    row.lawyer = order[(order.indexOf(row.lawyer) + 1) % 3];
  }

  savePermissions(): void {
    this.permsSaving.set(true);
    localStorage.setItem('firm_permissions', JSON.stringify(this.permMatrix));
    setTimeout(() => {
      this.permsSaving.set(false);
      this.editPermissions.set(false);
      this._showToast('success', 'Permissions saved successfully');
    }, 400);
  }

  private _loadPermissions(): void {
    try {
      const raw = localStorage.getItem('firm_permissions');
      if (raw) this.permMatrix = JSON.parse(raw);
    } catch { /* silent */ }
  }

  createNewRole(): void {
    this._showToast('success', 'Custom roles — coming in a future update');
  }

  // ── Branding ─────────────────────────────────────────
  primaryColor    = signal('#f59e0b');
  secondaryColor  = signal('#1e293b');
  accentColor     = signal('#3b82f6');
  bgColor         = signal('#f9fafb');
  firmDisplayName = signal('');
  emailSignature  = signal('');

  brandingSaving = signal(false);

  async saveBranding() {
    this.brandingSaving.set(true);
    try {
      await this.settingsService.updateBranding({
        primary_color: this.primaryColor(),
        display_name:  this.firmDisplayName(),
      });
      this._showToast('success', 'Branding saved successfully');
    } catch {
      this._showToast('error', 'Failed to save branding');
    } finally {
      this.brandingSaving.set(false);
    }
  }

  // ── Team Members (from StaffService) ─────────────────
  staff       = this.staffService.staff;
  adminCount  = computed(() => this.staff().filter(m => m.role === 'FIRM_ADMIN').length);
  lawyerCount = computed(() => this.staff().filter(m => m.role === 'LAWYER').length);
  teamSearch = signal('');
  teamRoleFilter   = signal('All Roles');
  teamStatusFilter = signal('All Status');

  filteredTeam = computed(() => {
    const q      = this.teamSearch().toLowerCase();
    const role   = this.teamRoleFilter();
    const status = this.teamStatusFilter();
    return this.staff().filter(m => {
      if (q && !m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
      if (role   !== 'All Roles'   && m.roleLabel !== role)   return false;
      if (status !== 'All Status'  && m.status !== status)    return false;
      return true;
    });
  });

  teamMemberRoles    = ['All Roles', 'Admin', 'Lawyer'];
  teamMemberStatuses = ['All Status', 'Active', 'Inactive', 'Pending'];

  activeFilteredTeam = computed(() =>
    this.filteredTeam().filter(m => m.status !== 'Inactive')
  );
  inactiveTeam = computed(() =>
    this.staffService.staff().filter(m => m.status === 'Inactive')
  );
  inactiveExpanded = signal(false);

  teamMemberSaving = signal<string | null>(null);

  async deactivateTeamMember(userId: string) {
    this.teamMemberSaving.set(userId);
    try {
      await this.staffService.deactivate(userId);
      this._showToast('success', 'Team member deactivated');
    } catch {
      this._showToast('error', 'Failed to deactivate team member');
    } finally {
      this.teamMemberSaving.set(null);
    }
  }

  // ── Member Detail Modal ──────────────────────────────
  detailMember = signal<StaffMember | null>(null);

  openMemberDetail(member: StaffMember) { this.detailMember.set(member); }
  closeMemberDetail()                   { this.detailMember.set(null); }

  // ── Invite Modal ─────────────────────────────────────
  showInviteModal = signal(false);
  inviteName      = signal('');
  inviteEmail     = signal('');
  inviteSaving    = signal(false);

  async inviteTeamMember() {
    if (!this.inviteName().trim() || !this.inviteEmail().trim()) return;
    this.inviteSaving.set(true);
    try {
      await this.staffService.inviteStaff(this.inviteEmail().trim(), this.inviteName().trim());
      this.showInviteModal.set(false);
      this.inviteName.set('');
      this.inviteEmail.set('');
      this._showToast('success', 'Invitation sent successfully');
    } catch {
      this._showToast('error', 'Failed to send invitation');
    } finally {
      this.inviteSaving.set(false);
    }
  }

  // ── Role Change Modal ─────────────────────────────────
  showRoleModal   = signal(false);
  roleModalMember = signal<StaffMember | null>(null);
  roleModalValue  = signal('');
  roleSaving      = signal(false);

  openRoleModal(member: StaffMember) {
    this.roleModalMember.set(member);
    this.roleModalValue.set(member.role);
    this.showRoleModal.set(true);
  }

  async saveRole() {
    const m = this.roleModalMember();
    if (!m) return;
    this.roleSaving.set(true);
    try {
      await this.staffService.updateRole(m.id, this.roleModalValue());
      this.showRoleModal.set(false);
      this._showToast('success', 'Role updated successfully');
    } catch {
      this._showToast('error', 'Failed to update role');
    } finally {
      this.roleSaving.set(false);
    }
  }

  // ── Notifications ─────────────────────────────────────
  notifTypes = [
    { key: 'hearing_reminders',     label: 'Hearing Reminders',      desc: 'Reminders for upcoming court hearings',       icon: 'fa-solid fa-gavel',        iconBg: 'bg-blue-50',   iconColor: 'text-blue-600'   },
    { key: 'task_reminders',        label: 'Task Reminders',          desc: 'Reminders for deadlines and assigned tasks',  icon: 'fa-solid fa-list-check',   iconBg: 'bg-amber-50',  iconColor: 'text-amber-600'  },
    { key: 'document_updates',      label: 'Document Updates',        desc: 'When documents are approved or modified',     icon: 'fa-regular fa-file-lines', iconBg: 'bg-green-50',  iconColor: 'text-green-600'  },
    { key: 'client_messages',       label: 'Client Messages',         desc: 'Notifications for incoming client messages',  icon: 'fa-solid fa-comment',      iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { key: 'payment_notifications', label: 'Payment Notifications',   desc: 'Confirmation for payments and invoices',      icon: 'fa-solid fa-credit-card',  iconBg: 'bg-green-50',  iconColor: 'text-green-600'  },
    { key: 'email_notifications',   label: 'Email Notifications',     desc: 'Receive updates via email',                   icon: 'fa-solid fa-envelope',     iconBg: 'bg-sky-50',    iconColor: 'text-sky-600'    },
    { key: 'whatsapp_updates',      label: 'WhatsApp Updates',        desc: 'Receive notifications on WhatsApp',           icon: 'fa-brands fa-whatsapp',    iconBg: 'bg-teal-50',   iconColor: 'text-teal-600'   },
  ];

  notifToggles = signal<Record<string, boolean>>({
    hearing_reminders: true, task_reminders: true, document_updates: true,
    client_messages: true, payment_notifications: true,
    email_notifications: false, whatsapp_updates: true,
  });

  silentHoursEnabled = signal(false);
  silentStart        = signal('22:00');
  silentEnd          = signal('08:00');

  notifSaving = signal(false);

  activeNotifCount = computed(() =>
    Object.values(this.notifToggles()).filter(Boolean).length
  );

  toggleNotifType(key: string) {
    this.notifToggles.update(t => ({ ...t, [key]: !t[key] }));
  }

  async saveNotifPreferences() {
    this.notifSaving.set(true);
    try {
      await this.authService.updateNotificationPreferences({ ...this.notifToggles() });
      this._showToast('success', 'Notification preferences saved');
    } catch {
      this._showToast('error', 'Failed to save notification preferences');
    } finally {
      this.notifSaving.set(false);
    }
  }

  private async _loadNotifPreferences() {
    try {
      const data = await this.authService.getNotificationPreferences();
      const toggles: Record<string, boolean> = {};
      this.notifTypes.forEach(({ key }) => {
        toggles[key] = data[key] !== false;
      });
      this.notifToggles.set(toggles);
    } catch { /* keep defaults */ }
  }

  // ── Personal Profile ─────────────────────────────────
  profileTab     = signal<'info' | 'password' | 'history'>('info');
  profileEditMode = signal(false);
  editName        = signal('');
  editPhone       = signal('');
  editTitle       = signal('');
  editWhatsapp    = signal('');
  editGender      = signal('');
  editNationality = signal('');
  editDateOfBirth = signal('');
  editAddress     = signal('');
  // Lawyer-specific edit signals
  editSpecializations  = signal<string[]>([]);
  editYearsExperience  = signal<number | null>(null);
  editOfficeLocation   = signal('');

  readonly SPECIALIZATION_OPTIONS = [
    { value: 'CRIMINAL_LAW',    label: 'Criminal Law' },
    { value: 'CIVIL_LAW',       label: 'Civil Law' },
    { value: 'CORPORATE_LAW',   label: 'Corporate Law' },
    { value: 'FAMILY_LAW',      label: 'Family Law' },
    { value: 'REAL_ESTATE_LAW', label: 'Real Estate Law' },
    { value: 'IMMIGRATION_LAW', label: 'Immigration Law' },
    { value: 'LABOR_LAW',       label: 'Labor Law' },
    { value: 'TAX_LAW',         label: 'Tax Law' },
  ];

  toggleSpecialization(value: string): void {
    this.editSpecializations.update(specs =>
      specs.includes(value) ? specs.filter(s => s !== value) : [...specs, value]
    );
  }

  readonly PRACTICE_AREA_OPTIONS = [
    'Criminal Law', 'Civil Law', 'Corporate Law', 'Family Law',
    'Real Estate Law', 'Immigration Law', 'Labor Law', 'Tax Law',
    'Intellectual Property', 'Administrative Law',
  ];

  togglePracticeArea(value: string): void {
    this.practiceAreas.update(areas =>
      areas.includes(value) ? areas.filter(a => a !== value) : [...areas, value]
    );
  }

  formatSpecialization(s: string): string {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  selectedFile     = signal<File | null>(null);
  avatarPreview    = signal<string | null>(null);
  avatarLoadFailed = signal(false);
  showLightbox     = signal(false);
  showAvatarMenu   = signal(false);
  avatarSaving     = signal(false);
  avatarSuccess    = signal(false);
  avatarError      = signal('');

  firmLogoUrl      = signal('');
  logoPreview      = signal<string | null>(null);
  logoSelectedFile = signal<File | null>(null);
  logoSaving       = signal(false);
  logoError        = signal('');
  showLogoMenu      = signal(false);
  showLogoLightbox  = signal(false);
  logoLoadFailed    = signal(false);

  // ── Email change ──────────────────────────────────────
  showChangeEmail    = signal(false);
  changeEmailNew     = signal('');
  changeEmailPwd     = signal('');
  showChangeEmailPwd = signal(false);
  changeEmailSaving  = signal(false);
  changeEmailError   = signal('');

  async requestEmailChange(): Promise<void> {
    const newEmail = this.changeEmailNew().trim();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      this.changeEmailError.set('Enter a valid email address.');
      return;
    }
    if (newEmail.toLowerCase() === this.profileUser?.email?.toLowerCase()) {
      this.changeEmailError.set('New email must differ from the current one.');
      return;
    }
    if (!this.changeEmailPwd()) {
      this.changeEmailError.set('Enter your current password.');
      return;
    }
    this.changeEmailSaving.set(true);
    this.changeEmailError.set('');
    try {
      await this.authService.changeEmail(newEmail, this.changeEmailPwd());
      // authService.changeEmail forces logout — execution stops here
    } catch (err: unknown) {
      this.changeEmailError.set(
        err instanceof Error ? err.message : 'Email change failed. Try again.'
      );
    } finally {
      this.changeEmailSaving.set(false);
    }
  }

  cancelEmailChange(): void {
    this.showChangeEmail.set(false);
    this.changeEmailNew.set('');
    this.changeEmailPwd.set('');
    this.changeEmailError.set('');
  }

  currentPwd  = signal('');
  newPwd      = signal('');
  confirmPwd  = signal('');
  showCurrent = signal(false);
  showNew     = signal(false);
  showConfirm = signal(false);

  loginHistory        = signal<{ id: string; logged_in_at: string; login_method?: string | null }[]>([]);
  loginHistoryLoading = signal(false);
  showAllHistory      = signal(false);

  userSaving   = signal(false);
  saveSuccess  = signal(false);
  pwdSaving    = signal(false);
  pwdSuccess   = signal(false);
  userError    = signal('');
  pwdError     = signal('');
  lawyerErrors = signal<{ yearsExperience?: string; officeLocation?: string }>({});

  onYearsExperienceInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.editYearsExperience.set(v !== '' ? +v : null);
    this.lawyerErrors.update(e => ({ ...e, yearsExperience: undefined }));
  }

  private _validateLawyerFields(): boolean {
    if (!this.isLawyer()) return true;
    const errors: { yearsExperience?: string; officeLocation?: string } = {};
    const yrs = this.editYearsExperience();
    if (yrs !== null) {
      if (!Number.isInteger(yrs))  errors.yearsExperience = 'Must be a whole number.';
      else if (yrs < 0)            errors.yearsExperience = 'Cannot be negative.';
      else if (yrs > 60)           errors.yearsExperience = 'Maximum is 60 years.';
    }
    const loc = this.editOfficeLocation().trim();
    if (loc && loc.length < 2)    errors.officeLocation = 'Too short — enter a city or country.';
    if (loc && loc.length > 100)  errors.officeLocation = 'Maximum 100 characters.';
    this.lawyerErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  get profileUser(): AppUser | null { return this.currentUser(); }

  get displayAvatar(): SafeUrl | null {
    const preview = this.avatarPreview();
    if (preview) return this.sanitizer.bypassSecurityTrustUrl(preview);
    if (this.avatarLoadFailed()) return null;
    const src = this.profileUser?.avatar ?? null;
    return src ? this.sanitizer.bypassSecurityTrustUrl(src) : null;
  }

  get savedAvatar(): SafeUrl | null {
    if (this.avatarLoadFailed()) return null;
    const src = this.profileUser?.avatar ?? null;
    return src ? this.sanitizer.bypassSecurityTrustUrl(src) : null;
  }

  get hasSavedAvatar(): boolean {
    return !!this.profileUser?.avatar && !this.avatarLoadFailed();
  }

  get initials(): string {
    return (this.profileUser?.name ?? '')
      .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      admin: 'Admin', lawyer: 'Lawyer',
      paralegal: 'Paralegal', client: 'Client',
    };
    return map[this.profileUser?.role ?? ''] ?? this.profileUser?.role ?? '';
  }

  get roleBadgeClass(): string {
    const map: Record<string, string> = {
      admin:     'bg-red-100 text-red-700',
      lawyer:    'bg-blue-100 text-blue-700',
      paralegal: 'bg-purple-100 text-purple-700',
      client:    'bg-green-100 text-green-700',
    };
    return map[this.profileUser?.role ?? ''] ?? 'bg-gray-100 text-gray-700';
  }

  get pwdMismatch(): boolean {
    return !!this.confirmPwd() && this.newPwd() !== this.confirmPwd();
  }

  get passwordStrength(): { score: number; label: string; barColor: string; textColor: string } {
    const pwd = this.newPwd();
    if (!pwd) return { score: 0, label: '', barColor: 'bg-gray-200', textColor: 'text-gray-400' };
    let score = 0;
    if (pwd.length >= 8)          score++;
    if (/[A-Z]/.test(pwd))        score++;
    if (/[0-9]/.test(pwd))        score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const map = [
      { label: 'Too short', barColor: 'bg-red-300',    textColor: 'text-red-400'    },
      { label: 'Weak',      barColor: 'bg-red-500',    textColor: 'text-red-600'    },
      { label: 'Fair',      barColor: 'bg-orange-400', textColor: 'text-orange-500' },
      { label: 'Good',      barColor: 'bg-yellow-400', textColor: 'text-yellow-600' },
      { label: 'Strong',    barColor: 'bg-green-500',  textColor: 'text-green-600'  },
    ];
    return { score, ...map[score] };
  }

  get pwdReqs() {
    const pwd = this.newPwd();
    return [
      { label: 'At least 8 characters', met: pwd.length >= 8 },
      { label: 'One uppercase letter',  met: /[A-Z]/.test(pwd) },
      { label: 'One number',            met: /[0-9]/.test(pwd) },
      { label: 'One special character', met: /[^A-Za-z0-9]/.test(pwd) },
    ];
  }

  get shortUserId(): string {
    const id = this.profileUser?.id ?? '';
    return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';
  }

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

  async removeAvatar(): Promise<void> {
    this.avatarPreview.set(null);
    this.selectedFile.set(null);
    try {
      await this.authService.updateProfile({ avatar_url: null });
      this.avatarLoadFailed.set(false);
    } catch {
      const u = this.profileUser;
      if (u) {
        const cleaned = { ...u, avatar: '' };
        this.authService.currentUser.set(cleaned);
        localStorage.setItem('current_user', JSON.stringify(cleaned));
      }
    }
  }

  onAvatarLoadError(): void {
    this.avatarLoadFailed.set(true);
    const u = this.profileUser;
    if (u) {
      const cleaned = { ...u, avatar: '' };
      this.authService.currentUser.set(cleaned);
      localStorage.setItem('current_user', JSON.stringify(cleaned));
    }
  }

  openLightbox():       void { this.showLightbox.set(true); }
  closeLightbox():      void { this.showLightbox.set(false); }
  openLogoLightbox():   void { this.showLogoLightbox.set(true); }
  closeLogoLightbox():  void { this.showLogoLightbox.set(false); }

  onLogoClick(): void {
    if (this.firmLogoUrl()) {
      this.openLogoLightbox();
    } else if (this.isAdmin()) {
      this.triggerLogoPicker();
    }
  }

  triggerLogoPicker(): void { this.logoInput.nativeElement.click(); }

  onLogoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.logoError.set('');
    if (!file.type.startsWith('image/')) { this.logoError.set('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024)    { this.logoError.set('Image must be smaller than 5 MB.'); return; }
    this.logoSelectedFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(reader.result as string);
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  cancelLogoChange(): void {
    this.logoPreview.set(null);
    this.logoSelectedFile.set(null);
    this.logoError.set('');
  }

  async confirmLogo(): Promise<void> {
    const file = this.logoSelectedFile();
    if (!file) return;
    this.logoSaving.set(true);
    this.logoError.set('');
    try {
      const res = await this.settingsService.uploadFirmLogo(file);
      this.firmLogoUrl.set(res.logo_url);
      this.logoPreview.set(null);
      this.logoSelectedFile.set(null);
      this.logoLoadFailed.set(false);
      this._showToast('success', 'Logo updated successfully');
    } catch (err: unknown) {
      this.logoError.set(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      this.logoSaving.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    try {
      await this.settingsService.removeFirmLogo();
      this.firmLogoUrl.set('');
      this.logoLoadFailed.set(false);
      this._showToast('success', 'Logo removed');
    } catch {
      this._showToast('error', 'Failed to remove logo');
    }
  }

  onLogoLoadError(): void {
    this.logoLoadFailed.set(true);
    this.firmLogoUrl.set('');
  }

  async saveUserProfile(): Promise<void> {
    if (!this.editName().trim()) { this.userError.set('Name is required.'); return; }
    if (!this._validateLawyerFields()) return;
    this.userError.set('');

    // Optimistic update: apply changes locally and close immediately
    const u = this.profileUser;
    const previous = u ? { ...u } : null;
    if (u) {
      const optimistic = {
        ...u,
        name:            this.editName().trim(),
        phone:           this.editPhone() || u.phone,
        title:           this.editTitle() || u.title,
        specializations: this.isLawyer() ? this.editSpecializations() : u.specializations,
        yearsExperience: this.isLawyer() ? (this.editYearsExperience() ?? undefined) : u.yearsExperience,
        officeLocation:  this.isLawyer() ? (this.editOfficeLocation() || undefined) : u.officeLocation,
      };
      this.authService.currentUser.set(optimistic);
      localStorage.setItem('current_user', JSON.stringify(optimistic));
    }
    this.saveSuccess.set(true);
    this.profileEditMode.set(false);
    setTimeout(() => this.saveSuccess.set(false), 3000);

    // Persist in background — revert on failure
    try {
      await Promise.all([
        this.authService.updateProfile({
          full_name: this.editName().trim(),
          phone:     this.editPhone() || undefined,
        }),
        this.isLawyer() ? this.authService.updateLawyerProfile({
          title:            this.editTitle() || null,
          specializations:  this.editSpecializations().length ? this.editSpecializations() : null,
          years_experience: this.editYearsExperience(),
          office_location:  this.editOfficeLocation() || null,
        }) : Promise.resolve(),
      ]);
    } catch (err: unknown) {
      // Revert on failure
      if (previous) {
        this.authService.currentUser.set(previous);
        localStorage.setItem('current_user', JSON.stringify(previous));
      }
      this.saveSuccess.set(false);
      this.userError.set(err instanceof Error ? err.message : 'Update failed. Changes reverted.');
      this.profileEditMode.set(true);
    }
  }

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

  async loadLoginHistory(): Promise<void> {
    this.loginHistoryLoading.set(true);
    try {
      const history = await this.authService.getLoginHistory();
      if (history.length > 0) {
        this.loginHistory.set(history);
        return;
      }
      const userId = this.profileUser?.id ?? '';
      const local = userId ? this.authService.getLocalLoginHistory(userId) : [];
      if (local.length === 0 && this.profileUser?.lastLoginAt) {
        this.loginHistory.set([{ id: 'seed', logged_in_at: this.profileUser.lastLoginAt, login_method: 'password' }]);
      } else {
        this.loginHistory.set(local);
      }
    } catch { /* silent */ }
    finally { this.loginHistoryLoading.set(false); }
  }

  loginMethodLabel(method: string | null | undefined): string {
    const map: Record<string, string> = {
      password:  'Password',
      biometric: 'Biometric',
      google:    'Google',
      microsoft: 'Microsoft',
      apple:     'Apple',
    };
    return map[method ?? ''] ?? 'Password';
  }

  loginMethodIcon(method: string | null | undefined): string {
    const map: Record<string, string> = {
      password:  'fa-solid fa-key',
      biometric: 'fa-solid fa-fingerprint',
      google:    'fa-brands fa-google',
      microsoft: 'fa-brands fa-microsoft',
      apple:     'fa-brands fa-apple',
    };
    return map[method ?? ''] ?? 'fa-solid fa-key';
  }

  copyUserId(): void {
    const id = this.profileUser?.id;
    if (id) navigator.clipboard.writeText(id).catch(() => {});
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(dateStr));
    } catch { return '—'; }
  }

  private _initProfileFields(): void {
    const u = this.profileUser;
    this.editName.set(u?.name ?? '');
    this.editPhone.set(u?.phone ?? '');
    this.editTitle.set(u?.title ?? '');
    this.editWhatsapp.set(u?.whatsappNumber ?? '');
    this.editGender.set(u?.gender ?? '');
    this.editNationality.set(u?.nationality ?? '');
    this.editDateOfBirth.set(u?.dateOfBirth ?? '');
    this.editAddress.set(u?.address ?? '');
    this.editSpecializations.set(u?.specializations ?? []);
    this.editYearsExperience.set(u?.yearsExperience ?? null);
    this.editOfficeLocation.set(u?.officeLocation ?? '');
  }

  // ── Security — personal 2FA ───────────────────────────
  show2faSetup          = signal(false);
  twoFaSecret           = signal('');
  twoFaCode             = signal('');
  twoFaSaving           = signal(false);
  twoFaError            = signal('');
  twoFaSuccess          = signal(false);
  twoFaCopied           = signal(false);
  showDisable2FAConfirm = signal(false);
  disable2FASaving      = signal(false);
  disable2FAError       = signal('');
  disable2faCode        = signal('');

  // ── Delete Account (lawyer only) ──────────────────────
  showDeleteConfirm   = signal(false);
  deleteAccountSaving = signal(false);
  deleteAccountError  = signal('');

  async deleteAccount(): Promise<void> {
    this.deleteAccountSaving.set(true);
    this.deleteAccountError.set('');
    try {
      await this.authService.deleteAccount();
    } catch (err: unknown) {
      this.deleteAccountError.set(err instanceof Error ? err.message : 'Failed to delete account. Try again.');
      this.deleteAccountSaving.set(false);
    }
  }

  async startSetup2FA(): Promise<void> {
    this.twoFaError.set('');
    this.twoFaCode.set('');
    try {
      const res = await this.authService.setup2FA();
      this.twoFaSecret.set(res.secret);
      this.show2faSetup.set(true);
    } catch (err: unknown) {
      this.twoFaError.set(err instanceof Error ? err.message : '2FA setup failed. Try again.');
    }
  }

  cancelSetup2FA(): void {
    this.show2faSetup.set(false);
    this.twoFaSecret.set('');
    this.twoFaCode.set('');
    this.twoFaError.set('');
  }

  async confirm2FA(): Promise<void> {
    if (this.twoFaCode().length !== 6) {
      this.twoFaError.set('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.twoFaSaving.set(true);
    this.twoFaError.set('');
    try {
      await this.authService.verify2FA(this.twoFaCode());
      const u = this.currentUser();
      if (u) {
        const updated = { ...u, twoFaEnabled: true };
        this.authService.currentUser.set(updated);
        localStorage.setItem('current_user', JSON.stringify(updated));
      }
      this.show2faSetup.set(false);
      this.twoFaSecret.set('');
      this.twoFaCode.set('');
      this.twoFaSuccess.set(true);
      setTimeout(() => this.twoFaSuccess.set(false), 4000);
    } catch {
      this.twoFaCode.set('');
      this.twoFaError.set('Invalid code. Open your authenticator app and enter the current 6-digit code.');
    } finally {
      this.twoFaSaving.set(false);
    }
  }

  async disable2FA(): Promise<void> {
    if (this.disable2faCode().length !== 6) {
      this.disable2FAError.set('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.disable2FASaving.set(true);
    this.disable2FAError.set('');
    try {
      await this.authService.disable2FA(this.disable2faCode());
      const u = this.currentUser();
      if (u) {
        const updated = { ...u, twoFaEnabled: false };
        this.authService.currentUser.set(updated);
        localStorage.setItem('current_user', JSON.stringify(updated));
      }
      this.showDisable2FAConfirm.set(false);
      this.disable2faCode.set('');
    } catch (err: unknown) {
      this.disable2FAError.set(err instanceof Error ? err.message : 'Failed to disable 2FA.');
      this.disable2faCode.set('');
    } finally {
      this.disable2FASaving.set(false);
    }
  }

  cancelDisable2FA(): void {
    this.showDisable2FAConfirm.set(false);
    this.disable2faCode.set('');
    this.disable2FAError.set('');
  }

  copySecret(): void {
    const secret = this.twoFaSecret();
    if (secret) {
      navigator.clipboard.writeText(secret)
        .then(() => { this.twoFaCopied.set(true); setTimeout(() => this.twoFaCopied.set(false), 2000); })
        .catch(() => {});
    }
  }

  // ── Security — firm-wide ──────────────────────────────
  enforce2FA           = signal(true);
  sessionTimeout       = signal('30');
  ipWhitelistEnabled   = signal(false);
  ipWhitelist          = signal('192.168.1.0/24\n10.0.0.0/8');
  passwordMinLength    = signal('12');
  passwordRequireUppercase = signal(true);
  passwordRequireNumbers   = signal(true);
  passwordRequireSymbols   = signal(true);
  passwordExpiry       = signal('90');
  loginAttempts        = signal('5');
  auditLog             = signal(true);
  securitySaving       = signal(false);

  saveFirmSecurity(): void {
    this.securitySaving.set(true);
    const s = {
      enforce2FA:               this.enforce2FA(),
      sessionTimeout:           this.sessionTimeout(),
      ipWhitelistEnabled:       this.ipWhitelistEnabled(),
      ipWhitelist:              this.ipWhitelist(),
      passwordMinLength:        this.passwordMinLength(),
      passwordRequireUppercase: this.passwordRequireUppercase(),
      passwordRequireNumbers:   this.passwordRequireNumbers(),
      passwordRequireSymbols:   this.passwordRequireSymbols(),
      passwordExpiry:           this.passwordExpiry(),
      loginAttempts:            this.loginAttempts(),
      auditLog:                 this.auditLog(),
    };
    localStorage.setItem('firm_security_settings', JSON.stringify(s));
    setTimeout(() => {
      this.securitySaving.set(false);
      this._showToast('success', 'Security settings saved');
    }, 400);
  }

  private _loadFirmSecurity(): void {
    try {
      const raw = localStorage.getItem('firm_security_settings');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.enforce2FA              !== undefined) this.enforce2FA.set(s.enforce2FA);
      if (s.sessionTimeout)                        this.sessionTimeout.set(s.sessionTimeout);
      if (s.ipWhitelistEnabled      !== undefined) this.ipWhitelistEnabled.set(s.ipWhitelistEnabled);
      if (s.ipWhitelist)                           this.ipWhitelist.set(s.ipWhitelist);
      if (s.passwordMinLength)                     this.passwordMinLength.set(s.passwordMinLength);
      if (s.passwordRequireUppercase !== undefined) this.passwordRequireUppercase.set(s.passwordRequireUppercase);
      if (s.passwordRequireNumbers  !== undefined) this.passwordRequireNumbers.set(s.passwordRequireNumbers);
      if (s.passwordRequireSymbols  !== undefined) this.passwordRequireSymbols.set(s.passwordRequireSymbols);
      if (s.passwordExpiry)                        this.passwordExpiry.set(s.passwordExpiry);
      if (s.loginAttempts)                         this.loginAttempts.set(s.loginAttempts);
      if (s.auditLog                !== undefined) this.auditLog.set(s.auditLog);
    } catch { /* silent */ }
  }

  securityEvents = computed(() =>
    this.loginHistory().map(entry => ({
      ...this._eventFromLoginEntry(entry.login_method),
      user: this.profileUser?.name ?? '—',
      when: this._timeAgo(entry.logged_in_at),
      ip: '—',
    }))
  );

  private _eventFromLoginEntry(method: string | null | undefined): { icon: string; iconBg: string; iconColor: string; title: string } {
    const map: Record<string, { icon: string; iconBg: string; iconColor: string; title: string }> = {
      password:  { icon: 'fa-solid fa-right-to-bracket', iconBg: 'bg-green-100',  iconColor: 'text-green-600',  title: 'Successful Login'  },
      biometric: { icon: 'fa-solid fa-fingerprint',      iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', title: 'Biometric Login'   },
      google:    { icon: 'fa-brands fa-google',           iconBg: 'bg-red-100',    iconColor: 'text-red-600',    title: 'Google Sign-in'    },
      microsoft: { icon: 'fa-brands fa-microsoft',        iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   title: 'Microsoft Sign-in' },
      apple:     { icon: 'fa-brands fa-apple',            iconBg: 'bg-gray-100',   iconColor: 'text-gray-700',   title: 'Apple Sign-in'     },
    };
    return map[method ?? ''] ?? map['password'];
  }

  private _timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  // ── Integrations ─────────────────────────────────────
  private readonly INTG_CONFIG = [
    { key: 'google_calendar', icon: 'fa-brands fa-google',         iconBg: 'bg-red-100',    iconColor: 'text-red-500',    name: 'Google Calendar',   category: 'Calendar',  desc: 'Sync hearings, meetings and deadlines with Google Calendar' },
    { key: 'whatsapp',        icon: 'fa-brands fa-whatsapp',       iconBg: 'bg-green-100',  iconColor: 'text-green-600',  name: 'WhatsApp Business', category: 'Messaging', desc: 'Send automated notifications and communicate with clients'  },
    { key: 'stripe',          icon: 'fa-brands fa-stripe-s',       iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', name: 'Stripe',            category: 'Payments',  desc: 'Accept credit cards, ACH, and international payments'       },
    { key: 'sadad',           icon: 'fa-solid fa-money-bill-wave', iconBg: 'bg-teal-100',   iconColor: 'text-teal-600',   name: 'Sadad',             category: 'Payments',  desc: 'Accept local payments via Sadad (Saudi Arabia)'             },
  ];

  integrations = signal(this.INTG_CONFIG.map(c => ({ ...c, connected: false, connectedAs: '' })));
  integrationsLoading = signal(false);

  connectedCount = computed(() => this.integrations().filter(i => i.connected).length);

  async loadIntegrations() {
    this.integrationsLoading.set(true);
    try {
      const status = await this.settingsService.getIntegrationStatus();
      this.integrations.set(this.INTG_CONFIG.map(c => {
        const s = status[c.key as keyof typeof status];
        return { ...c, connected: s?.connected ?? false, connectedAs: s?.connected_as ?? '' };
      }));
    } catch { /* keep defaults */ }
    finally { this.integrationsLoading.set(false); }
  }

  intgActionLoading = signal<string | null>(null);

  async connectGoogleCalendar() {
    try {
      const { auth_url } = await this.settingsService.getGoogleCalendarAuthUrl();
      window.location.href = auth_url;
    } catch {
      this._showToast('error', 'Google Calendar is not configured on the server');
    }
  }

  async syncGoogleCalendar() {
    this.intgActionLoading.set('google_calendar');
    try {
      const r = await this.settingsService.syncGoogleCalendar();
      this._showToast('success', `Synced ${r.synced} / ${r.total} events to Google Calendar`);
    } catch (e: any) {
      const msg: string = e?.error?.detail ?? 'Google Calendar sync failed';
      this._showToast('error', msg);
    } finally {
      this.intgActionLoading.set(null);
    }
  }

  // ── App Preferences ──────────────────────────────────
  appTheme        = signal<'light' | 'dark' | 'auto'>('light');
  appLanguage     = signal<'en' | 'fr' | 'ar'>('en');
  appTimeFormat   = signal<'12h' | '24h'>('12h');
  appCalendarView = signal<'day' | 'week' | 'month'>('week');

  private _loadAppPrefs() {
    try {
      const saved = localStorage.getItem('app_prefs');
      if (!saved) return;
      const p = JSON.parse(saved);
      if (p.theme)        this.appTheme.set(p.theme);
      if (p.language)     this.appLanguage.set(p.language);
      if (p.timeFormat)   this.appTimeFormat.set(p.timeFormat);
      if (p.calendarView) this.appCalendarView.set(p.calendarView);
    } catch { /* silent */ }
  }

  saveAppPrefs() {
    localStorage.setItem('app_prefs', JSON.stringify({
      theme:        this.appTheme(),
      language:     this.appLanguage(),
      timeFormat:   this.appTimeFormat(),
      calendarView: this.appCalendarView(),
    }));
    this._showToast('success', 'Preferences saved successfully');
  }

  // ── Lifecycle ─────────────────────────────────────────
  async ngOnInit() {
    this._loadAppPrefs();
    this._loadFirmSecurity();
    this._loadPermissions();
    this._initProfileFields();
    this.authService.refreshCurrentUser();
    this.loadLoginHistory();
    this.loading.set(true);
    try {
      const [profile, branding, subscription] = await Promise.all([
        this.settingsService.getFirmProfile().catch(() => null),
        this.settingsService.getBranding().catch(() => null),
        this.settingsService.getSubscription().catch(() => null),
        this.staffService.loadStaff().catch(() => {}),
        this.settingsService.getOfficeCode().then(c => this.officeCode.set(c)).catch(() => {}),
        this.settingsService.getFirmStats().then(async s => {
          this.statCases.set(s.active_cases);
          this.statTeam.set(s.total_members);
          await this.clientService.loadClients().catch(() => {});
          this.statClients.set(this.clientService.clients().length);
        }).catch(async () => {
          // Fallback for non-admin roles
          await Promise.all([
            this.dashboardService.getStats().then(s => this.statCases.set(s.active_cases)).catch(() => {}),
            this.staffService.loadStaff().then(() => this.statTeam.set(this.staffService.staff().length)).catch(() => {}),
            this.clientService.loadClients().then(() => this.statClients.set(this.clientService.clients().length)).catch(() => {}),
          ]);
        }),
        this._loadNotifPreferences(),
        this.isLawyer() ? this.authService.getLawyerProfile().then(lp => {
          this.editTitle.set(lp.title ?? '');
          this.editSpecializations.set(lp.specializations ?? []);
          this.editYearsExperience.set(lp.years_experience ?? null);
          this.editOfficeLocation.set(lp.office_location ?? '');
          const u = this.currentUser();
          if (u) {
            const updated = {
              ...u,
              specializations: lp.specializations ?? u.specializations,
              yearsExperience: lp.years_experience ?? u.yearsExperience,
              officeLocation:  lp.office_location ?? u.officeLocation,
            };
            this.authService.currentUser.set(updated);
          }
        }).catch(() => {}) : Promise.resolve(),
      ]);

      if (profile) {
        this.officeName.set(profile.name ?? '');
        this.entityType.set(this._resolveEntityType(profile.legal_entity_type));
        this.regNumber.set(profile.registration_number ?? '');
        this.taxId.set(profile.tax_id ?? '');
        this.address.set(profile.address ?? '');
        this.city.set(profile.city ?? '');
        this.state.set(profile.country ?? '');
        this.phone.set(profile.phone ?? '');
        this.email.set(profile.email ?? '');
        this.description.set(profile.description ?? '');
        if (profile.created_at) this.firmCreatedAt.set(profile.created_at);
        if (profile.practice_areas?.length) {
          this.practiceAreas.set(profile.practice_areas);
        }
        if (profile.name) {
          this.firmDisplayName.set(profile.name);
          this.emailSignature.set(
            `${profile.name}\n${profile.address ?? ''}\n${profile.city ?? ''}\n\nPhone: ${profile.phone ?? ''}\nEmail: ${profile.email ?? ''}`
          );
        }
      }

      if (branding) {
        if (branding.primary_color) this.primaryColor.set(branding.primary_color);
        if (branding.display_name)  this.firmDisplayName.set(branding.display_name);
        if (branding.logo_url)      this.firmLogoUrl.set(branding.logo_url);
      }

      if (subscription) {
        this._applySubscription(subscription);
      }
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
  }

  private _resolveEntityType(backendValue: string): string {
    if (!backendValue) return this.entityTypes[0];
    const match = this.entityTypes.find(e =>
      e === backendValue || e.toLowerCase().startsWith(backendValue.toLowerCase())
    );
    return match ?? backendValue;
  }

  private _applySubscription(sub: Record<string, unknown>) {
    const planName = String(sub['plan_name'] ?? '').toLowerCase();
    this.plans = this.plans.map(p => ({
      ...p,
      current: p.badge.toLowerCase() === planName,
    }));

    if (sub['billing_cycle'])    this.subscriptionBillingCycle.set(String(sub['billing_cycle']));
    if (sub['next_billing_date']) this.subscriptionNextBilling.set(String(sub['next_billing_date']));
    if (sub['amount'])            this.subscriptionAmountDue.set(`$${Number(sub['amount']).toFixed(2)}`);
  }
}
