import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../services/settings.service';
import { StaffService } from '../../../services/staff.service';
import { AuthService } from '../../../services/auth.service';

interface PermRow {
  feature: string;
  partner: 'check' | 'partial' | 'none';
  associate: 'check' | 'partial' | 'none';
  secretary: 'check' | 'partial' | 'none';
  paralegal: 'check' | 'partial' | 'none';
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './settings.html',
})
export class Settings implements OnInit, OnDestroy {

  private settingsService = inject(SettingsService);
  private staffService    = inject(StaffService);
  private authService     = inject(AuthService);

  currentUser = this.authService.currentUser;

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
  activeTab = signal('Office Profile');
  tabs = [
    { label: 'Office Profile',      icon: 'fa-solid fa-building' },
    { label: 'Subscription',        icon: 'fa-solid fa-crown' },
    { label: 'Roles & Permissions', icon: 'fa-solid fa-user-shield' },
    { label: 'Branding',            icon: 'fa-solid fa-palette' },
    { label: 'Team Members',        icon: 'fa-solid fa-users' },
    { label: 'Notifications',       icon: 'fa-solid fa-bell' },
    { label: 'Security',            icon: 'fa-solid fa-shield-halved' },
    { label: 'Integrations',        icon: 'fa-solid fa-plug' },
    { label: 'Storage',             icon: 'fa-solid fa-database' },
  ];
  setTab(t: string) { this.activeTab.set(t); }

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
  officeCode   = signal('');
  practiceAreas       = signal<string[]>([]);
  practiceAreaColors  = ['bg-blue-100 text-blue-700','bg-green-100 text-green-700','bg-amber-100 text-amber-700','bg-purple-100 text-purple-700','bg-red-100 text-red-700'];
  newPracticeArea     = signal('');
  entityTypes         = ['LLP – Limited Liability Partnership','PC – Professional Corporation','Sole Proprietorship','Partnership'];

  profileSaving = signal(false);

  addPracticeArea() {
    const v = this.newPracticeArea().trim();
    if (v) { this.practiceAreas.update(a => [...a, v]); this.newPracticeArea.set(''); }
  }
  removePracticeArea(i: number) { this.practiceAreas.update(a => a.filter((_, idx) => idx !== i)); }

  async saveProfile() {
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
    { feature: 'Dashboard Access',   partner: 'check',   associate: 'check',   secretary: 'check',   paralegal: 'check' },
    { feature: 'Create Cases',       partner: 'check',   associate: 'check',   secretary: 'none',    paralegal: 'check' },
    { feature: 'Edit All Cases',     partner: 'check',   associate: 'partial', secretary: 'none',    paralegal: 'partial' },
    { feature: 'Delete Cases',       partner: 'check',   associate: 'none',    secretary: 'none',    paralegal: 'none' },
    { feature: 'Client Management',  partner: 'check',   associate: 'check',   secretary: 'check',   paralegal: 'check' },
    { feature: 'Document Upload',    partner: 'check',   associate: 'check',   secretary: 'check',   paralegal: 'check' },
    { feature: 'Billing & Invoices', partner: 'check',   associate: 'partial', secretary: 'none',    paralegal: 'none' },
    { feature: 'Financial Reports',  partner: 'check',   associate: 'none',    secretary: 'none',    paralegal: 'none' },
    { feature: 'AI Assistant',       partner: 'check',   associate: 'check',   secretary: 'partial', paralegal: 'check' },
    { feature: 'User Management',    partner: 'check',   associate: 'none',    secretary: 'none',    paralegal: 'none' },
    { feature: 'System Settings',    partner: 'check',   associate: 'none',    secretary: 'none',    paralegal: 'none' },
  ];
  permIcon(v: 'check'|'partial'|'none') {
    if (v === 'check')   return 'fa-solid fa-check-circle text-green-500';
    if (v === 'partial') return 'fa-solid fa-minus-circle text-amber-500';
    return 'fa-solid fa-times-circle text-red-500';
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
  staff      = this.staffService.staff;
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

  teamMemberRoles   = ['All Roles', 'Admin', 'Lawyer'];
  teamMemberStatuses = ['All Status', 'Active', 'Inactive', 'Pending'];

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

  // ── Notifications ─────────────────────────────────────
  emailNotifs = [
    { label: 'New Case Assignments',  desc: 'When a new case is assigned to you',     checked: true },
    { label: 'Upcoming Hearings',     desc: 'Reminders for scheduled hearings',        checked: true },
    { label: 'Document Uploads',      desc: 'When documents are added to your cases', checked: true },
    { label: 'Payment Received',      desc: 'Invoice payment confirmations',          checked: false },
    { label: 'Client Messages',       desc: 'New messages from clients',              checked: true },
    { label: 'Task Assignments',      desc: 'When tasks are assigned to you',         checked: true },
    { label: 'Deadline Reminders',    desc: 'Approaching case deadlines',             checked: true },
    { label: 'Weekly Summary',        desc: 'Weekly digest of office activities',     checked: true },
  ];
  smsNotifs = [
    { label: 'Urgent Hearing Alerts', desc: 'Same-day hearing reminders',             checked: true },
    { label: 'Payment Overdue',       desc: 'Overdue invoice alerts',                 checked: true },
    { label: 'Client Emergency',      desc: 'Urgent client requests',                 checked: false },
  ];
  pushNotifs = [
    { label: 'System Updates',    desc: 'Platform updates and announcements', checked: false },
    { label: 'Team Mentions',     desc: 'When someone mentions you',          checked: true },
    { label: 'Case Status Change',desc: 'When case status is updated',        checked: true },
  ];
  toggleNotif(arr: {checked: boolean}[], i: number) { arr[i].checked = !arr[i].checked; }

  // ── Security ─────────────────────────────────────────
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

  securityEvents = [
    { icon: 'fa-solid fa-right-to-bracket', iconBg: 'bg-green-100', iconColor: 'text-green-600', title: 'Successful Login',        user: 'Sarah Williams', when: '2 min ago',   ip: '192.168.1.45' },
    { icon: 'fa-solid fa-shield-halved',    iconBg: 'bg-blue-100',  iconColor: 'text-blue-600',  title: '2FA Verified',             user: 'Sarah Williams', when: '15 min ago',  ip: '10.0.0.12' },
    { icon: 'fa-solid fa-triangle-exclamation', iconBg: 'bg-red-100', iconColor: 'text-red-600', title: 'Failed Login Attempt',     user: 'Unknown',        when: '1 hour ago',  ip: '203.0.113.42' },
    { icon: 'fa-solid fa-key',              iconBg: 'bg-amber-100', iconColor: 'text-amber-600', title: 'Password Changed',         user: 'Michael Chen',   when: '3 hours ago', ip: '192.168.1.88' },
  ];

  // ── Integrations ─────────────────────────────────────
  integrations = [
    {
      category: 'Calendar & Scheduling',
      items: [
        { icon: 'fa-brands fa-google',  iconBg: 'bg-red-100',    iconColor: 'text-red-600',    name: 'Google Calendar',   desc: 'Sync hearings, meetings and deadlines with Google Calendar', connected: true,  connectedAs: 'contact@morrisonlaw.com', statusCls: 'bg-green-100 text-green-700' },
        { icon: 'fa-solid fa-envelope', iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   name: 'Microsoft Outlook', desc: 'Sync calendar events and emails with Outlook / Office 365',  connected: false, connectedAs: '',                        statusCls: 'bg-gray-100 text-gray-600' },
      ]
    },
    {
      category: 'Messaging',
      items: [
        { icon: 'fa-brands fa-whatsapp', iconBg: 'bg-green-100', iconColor: 'text-green-600',  name: 'WhatsApp Business', desc: 'Send automated notifications and communicate with clients',  connected: true,  connectedAs: '+1 (212) 555-0198',       statusCls: 'bg-green-100 text-green-700' },
      ]
    },
    {
      category: 'Payments & Billing',
      items: [
        { icon: 'fa-brands fa-stripe',         iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', name: 'Stripe', desc: 'Accept credit cards, ACH, and international payments',  connected: true,  connectedAs: 'acct_1234...abcd', statusCls: 'bg-green-100 text-green-700' },
        { icon: 'fa-solid fa-money-bill-wave', iconBg: 'bg-teal-100',   iconColor: 'text-teal-600',   name: 'Sadad', desc: 'Accept local payments via Sadad (Saudi Arabia)',           connected: false, connectedAs: '',                statusCls: 'bg-gray-100 text-gray-600' },
      ]
    },
  ];

  // ── Storage ─────────────────────────────────────────
  storagePlans = [
    { name: 'Starter',     size: '50 GB',  price: 'Included', current: false, color: 'bg-gray-100 text-gray-700' },
    { name: 'Professional',size: '500 GB', price: '+$29/mo',  current: false, color: 'bg-blue-100 text-blue-700' },
    { name: 'Business',    size: '2 TB',   price: '+$79/mo',  current: true,  color: 'bg-amber-100 text-amber-700' },
    { name: 'Enterprise',  size: 'Custom', price: 'Contact',  current: false, color: 'bg-purple-100 text-purple-700' },
  ];
  storageBreakdown = [
    { icon: 'fa-solid fa-file-pdf',   iconBg: 'bg-red-100',    iconColor: 'text-red-600',    label: 'Legal Documents', used: '312 GB', pct: 47, color: 'bg-red-500' },
    { icon: 'fa-solid fa-file-image', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', label: 'Evidence & Media',used: '187 GB', pct: 28, color: 'bg-purple-500' },
    { icon: 'fa-solid fa-file-word',  iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   label: 'Contracts',       used: '94 GB',  pct: 14, color: 'bg-blue-500' },
    { icon: 'fa-solid fa-folder',     iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  label: 'Other Files',     used: '77 GB',  pct: 11, color: 'bg-amber-500' },
  ];
  storageHistory = [
    { month: 'Nov 2024', used: '670 GB', change: '+18 GB', pct: 34 },
    { month: 'Oct 2024', used: '652 GB', change: '+24 GB', pct: 33 },
    { month: 'Sep 2024', used: '628 GB', change: '+31 GB', pct: 31 },
    { month: 'Aug 2024', used: '597 GB', change: '+12 GB', pct: 29 },
  ];

  // ── Lifecycle ─────────────────────────────────────────
  async ngOnInit() {
    this.loading.set(true);
    try {
      const [profile, branding, subscription] = await Promise.all([
        this.settingsService.getFirmProfile().catch(() => null),
        this.settingsService.getBranding().catch(() => null),
        this.settingsService.getSubscription().catch(() => null),
        this.staffService.loadStaff().catch(() => {}),
        this.settingsService.getOfficeCode().then(c => this.officeCode.set(c)).catch(() => {}),
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
