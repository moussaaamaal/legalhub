import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import type { Notif, NotifCategory, NotifPriority } from '../../../services/notification.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { SearchNavigatorService } from '../../../shared/services/search-navigator.service';

export type { NotifCategory, NotifPriority, Notif };

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [NgClass, FormsModule, HighlightPipe],
  templateUrl: './notifications.html',
})
export class Notifications implements OnInit {

  private notifService = inject(NotificationService);
  private authService  = inject(AuthService);
  searchNav            = inject(SearchNavigatorService);

  searchQuery = signal('');

  onSearch(q: string): void {
    this.searchQuery.set(q);
    if (!q) { this.searchNav.reset(); return; }
    setTimeout(() => this.searchNav.scan(), 50);
  }

  readonly allNotifications = this.notifService.notifications;
  readonly loading          = this.notifService.loading;

  // ── WEB-NOTIF-01 — Category tabs with per-category colors ─
  activeFilter = signal<NotifCategory | 'all'>('all');

  filterLabels: {
    value:        NotifCategory | 'all';
    label:        string;
    icon:         string;
    iconInactive: string;
    activeCls:    string;
    badgeCls:     string;
  }[] = [
    { value:'all',        label:'All',         icon:'fa-solid fa-bell',                  iconInactive:'text-gray-400', activeCls:'bg-gray-900 text-white',              badgeCls:'bg-gray-200 text-gray-600' },
    { value:'deadline',   label:'Deadlines',   icon:'fa-solid fa-hourglass-half',        iconInactive:'text-red-400',  activeCls:'bg-red-500 text-white',               badgeCls:'bg-red-100 text-red-600' },
    { value:'document',   label:'Documents',   icon:'fa-solid fa-file-lines',            iconInactive:'text-blue-400', activeCls:'bg-blue-500 text-white',              badgeCls:'bg-blue-100 text-blue-600' },
    { value:'assignment', label:'Assignments', icon:'fa-solid fa-briefcase',             iconInactive:'text-purple-400', activeCls:'bg-purple-500 text-white',          badgeCls:'bg-purple-100 text-purple-600' },
    { value:'payment',    label:'Payments',    icon:'fa-solid fa-circle-dollar-to-slot', iconInactive:'text-amber-500', activeCls:'bg-amber-500 text-white',            badgeCls:'bg-amber-100 text-amber-700' },
    { value:'system',     label:'System',      icon:'fa-solid fa-gear',                  iconInactive:'text-gray-400', activeCls:'bg-slate-600 text-white',             badgeCls:'bg-gray-200 text-gray-600' },
  ];

  setFilter(f: NotifCategory | 'all') { this.activeFilter.set(f); }

  // ── WEB-NOTIF-02 — Priority filter chips with colors ──────
  selectedPriority = signal<NotifPriority | 'all'>('all');
  priorityOptions: { value: NotifPriority | 'all'; label: string; activeCls: string }[] = [
    { value:'all',    label:'All Priority',  activeCls:'bg-gray-900 text-white border-gray-900' },
    { value:'urgent', label:'Urgent',        activeCls:'bg-red-500 text-white border-red-500' },
    { value:'high',   label:'High',          activeCls:'bg-amber-500 text-white border-amber-500' },
    { value:'normal', label:'Normal',        activeCls:'bg-green-500 text-white border-green-500' },
  ];

  // ── WEB-NOTIF-03 — Time period ────────────────────────────
  selectedPeriod = signal<'today' | '7days' | '30days'>('7days');
  periodOptions = [
    { value: 'today'  as const, label: 'Today' },
    { value: '7days'  as const, label: 'Last 7 Days' },
    { value: '30days' as const, label: 'Last 30 Days' },
  ];

  // ── Category config (full color palette) ─────────────────
  readonly catConfig: Record<NotifCategory, {
    dot: string; icon: string;
    iconBg: string; iconColor: string;
    pillBg: string; pillText: string;
    unreadBg: string;
    label: string;
    actionBtn: string;
  }> = {
    deadline: {
      dot:'bg-red-500', icon:'fa-solid fa-hourglass-half',
      iconBg:'bg-red-100', iconColor:'text-red-600',
      pillBg:'bg-red-100', pillText:'text-red-700',
      unreadBg:'#FFF5F5',
      label:'Deadline', actionBtn:'bg-red-500 hover:bg-red-600',
    },
    document: {
      dot:'bg-blue-500', icon:'fa-solid fa-file-lines',
      iconBg:'bg-blue-100', iconColor:'text-blue-600',
      pillBg:'bg-blue-100', pillText:'text-blue-700',
      unreadBg:'#EFF6FF',
      label:'Document', actionBtn:'bg-blue-500 hover:bg-blue-600',
    },
    assignment: {
      dot:'bg-purple-500', icon:'fa-solid fa-briefcase',
      iconBg:'bg-purple-100', iconColor:'text-purple-600',
      pillBg:'bg-purple-100', pillText:'text-purple-700',
      unreadBg:'#F5F3FF',
      label:'Assignment', actionBtn:'bg-purple-500 hover:bg-purple-600',
    },
    payment: {
      dot:'bg-amber-500', icon:'fa-solid fa-circle-dollar-to-slot',
      iconBg:'bg-amber-100', iconColor:'text-amber-600',
      pillBg:'bg-amber-100', pillText:'text-amber-700',
      unreadBg:'#FFFBEB',
      label:'Payment', actionBtn:'bg-amber-500 hover:bg-amber-600',
    },
    system: {
      dot:'bg-slate-400', icon:'fa-solid fa-gear',
      iconBg:'bg-slate-100', iconColor:'text-slate-500',
      pillBg:'bg-slate-100', pillText:'text-slate-600',
      unreadBg:'#F8FAFC',
      label:'System', actionBtn:'bg-slate-500 hover:bg-slate-600',
    },
  };

  // ── Priority config ───────────────────────────────────────
  readonly prioConfig: Record<NotifPriority, { bar: string; badge: string; label: string }> = {
    urgent: { bar:'bg-red-500',   badge:'bg-red-100 text-red-700 border border-red-200',       label:'Urgent' },
    high:   { bar:'bg-amber-400', badge:'bg-amber-100 text-amber-700 border border-amber-200', label:'High' },
    normal: { bar:'bg-transparent', badge:'', label:'' },
  };

  // ── Delivery channels ─────────────────────────────────────
  channels: {
    key: string; icon: string; label: string; desc: string;
    activeBg: string; activeBorder: string;
    iconBgActive: string; iconColorActive: string;
    toggleColor: string; labelColor: string; descColor: string;
  }[] = [
    {
      key:'email_notifications', icon:'fa-solid fa-envelope',
      label:'Email', desc:'Receive via email',
      activeBg:'bg-blue-50',   activeBorder:'border-blue-300',
      iconBgActive:'bg-blue-500', iconColorActive:'text-white',
      toggleColor:'bg-blue-500', labelColor:'text-blue-800', descColor:'text-blue-500',
    },
    {
      key:'push_enabled', icon:'fa-solid fa-mobile-screen',
      label:'Push',    desc:'Instant mobile alerts',
      activeBg:'bg-green-50',  activeBorder:'border-green-300',
      iconBgActive:'bg-green-500', iconColorActive:'text-white',
      toggleColor:'bg-green-500', labelColor:'text-green-800', descColor:'text-green-500',
    },
    {
      key:'desktop_enabled', icon:'fa-solid fa-bell',
      label:'Desktop', desc:'Browser notifications',
      activeBg:'bg-purple-50', activeBorder:'border-purple-300',
      iconBgActive:'bg-purple-500', iconColorActive:'text-white',
      toggleColor:'bg-purple-500', labelColor:'text-purple-800', descColor:'text-purple-500',
    },
    {
      key:'sms_enabled', icon:'fa-solid fa-comment',
      label:'SMS',     desc:'Critical updates via text',
      activeBg:'bg-amber-50',  activeBorder:'border-amber-300',
      iconBgActive:'bg-amber-500', iconColorActive:'text-white',
      toggleColor:'bg-amber-500', labelColor:'text-amber-800', descColor:'text-amber-500',
    },
    {
      key:'whatsapp_updates', icon:'fa-brands fa-whatsapp',
      label:'WhatsApp', desc:'Updates via WhatsApp',
      activeBg:'bg-emerald-50', activeBorder:'border-emerald-300',
      iconBgActive:'bg-emerald-500', iconColorActive:'text-white',
      toggleColor:'bg-emerald-500', labelColor:'text-emerald-800', descColor:'text-emerald-500',
    },
  ];

  // ── Filtering ─────────────────────────────────────────────
  filteredNotifications = computed(() => {
    const ms: Record<string, number> = { today:86_400_000, '7days':7*86_400_000, '30days':30*86_400_000 };
    const cutoff = Date.now() - ms[this.selectedPeriod()];
    const q = this.searchQuery().toLowerCase().trim();
    return this.allNotifications().filter(n => {
      const catOk   = this.activeFilter() === 'all' || n.category === this.activeFilter();
      const prioOk  = this.selectedPriority() === 'all' || n.priority === this.selectedPriority();
      const searchOk = !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
      return catOk && prioOk && searchOk && n.time.getTime() >= cutoff;
    });
  });

  groupedNotifications = computed(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const yest  = new Date(today.getTime() - 86_400_000);
    const buckets: Record<string, Notif[]> = {};
    for (const n of this.filteredNotifications()) {
      const d = new Date(n.time); d.setHours(0,0,0,0);
      const key = d >= today ? 'Today' : d >= yest ? 'Yesterday' : 'Earlier';
      (buckets[key] ??= []).push(n);
    }
    return (['Today','Yesterday','Earlier'] as const)
      .filter(k => buckets[k]?.length)
      .map(k => ({ label: k, items: buckets[k] }));
  });

  // ── Read / dismiss ────────────────────────────────────────
  countUnread(cat: NotifCategory | 'all' = 'all') {
    return this.allNotifications().filter(n => !n.read && (cat === 'all' || n.category === cat)).length;
  }
  get totalUnread() { return this.countUnread('all'); }

  markAllRead() { this.notifService.markAllRead(); }
  markRead(id: string) { this.notifService.markRead(id); }
  dismiss(id: string)  { this.notifService.dismiss(id); }

  // ── WEB-NOTIF-05 — Settings (backend) ────────────────────
  showSettings    = signal(false);
  settingsLoading = signal(false);
  settingsSaving  = signal(false);
  settingsSaveError = signal('');

  hearingReminderOffset = signal('1 hour before');

  private readonly defaultSettings: Record<string, boolean> = {
    deadline_urgent: true,  deadline_high: true,   deadline_normal: false,
    hearing_reminders: true,
    document_uploaded: true, document_signed: true,
    assignment_new: true,   assignment_changed: true,
    task_reminders: true,   client_messages: true,
    payment_overdue: true,  payment_due_soon: true, payment_received: true,
    system_updates: false,  system_security: true,  system_storage: true,
    email_notifications: true, push_enabled: true, desktop_enabled: false,
    sms_enabled: true,      whatsapp_updates: true,
  };

  settingValues = signal<Record<string, boolean>>({ ...this.defaultSettings });

  getSetting(k: string) { return this.settingValues()[k] ?? false; }
  toggleSetting(k: string) { this.settingValues.update(s => ({ ...s, [k]: !s[k] })); }

  async loadSettings(): Promise<void> {
    this.settingsLoading.set(true);
    try {
      const prefs = await this.authService.getNotificationPreferences();
      const merged = { ...this.defaultSettings };
      for (const k of Object.keys(merged)) {
        if (prefs[k] !== undefined) merged[k] = Boolean(prefs[k]);
      }
      this.settingValues.set(merged);
      if (prefs['hearing_reminder_offset']) {
        this.hearingReminderOffset.set(String(prefs['hearing_reminder_offset']));
      }
    } catch { /* silent — defaults apply */ }
    finally { this.settingsLoading.set(false); }
  }

  async saveSettings(): Promise<void> {
    this.settingsSaving.set(true);
    this.settingsSaveError.set('');
    try {
      await this.authService.updateNotificationPreferences({
        ...this.settingValues(),
        hearing_reminder_offset: this.hearingReminderOffset(),
      });
      this.showSettings.set(false);
    } catch (err: unknown) {
      this.settingsSaveError.set(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      this.settingsSaving.set(false);
    }
  }

  settingGroups: {
    label: string; icon: string; iconBg: string; iconColor: string;
    items: { key: string; label: string }[];
  }[] = [
    {
      label:'Deadline & Hearings', icon:'fa-solid fa-hourglass-half', iconBg:'bg-red-50', iconColor:'text-red-600',
      items:[
        { key:'deadline_urgent',   label:'Urgent (within 24h)' },
        { key:'deadline_high',     label:'High (3 days before)' },
        { key:'deadline_normal',   label:'Normal (7 days before)' },
        { key:'hearing_reminders', label:'Hearing reminders' },
      ],
    },
    {
      label:'Documents', icon:'fa-solid fa-file-lines', iconBg:'bg-blue-50', iconColor:'text-blue-600',
      items:[
        { key:'document_uploaded', label:'Document uploaded' },
        { key:'document_signed',   label:'Document signed' },
      ],
    },
    {
      label:'Assignments & Tasks', icon:'fa-solid fa-briefcase', iconBg:'bg-purple-50', iconColor:'text-purple-600',
      items:[
        { key:'assignment_new',     label:'New case assigned' },
        { key:'assignment_changed', label:'Role or team changed' },
        { key:'task_reminders',     label:'Task deadline reminders' },
        { key:'client_messages',    label:'Client messages' },
      ],
    },
    {
      label:'Payments', icon:'fa-solid fa-circle-dollar-to-slot', iconBg:'bg-amber-50', iconColor:'text-amber-600',
      items:[
        { key:'payment_overdue',   label:'Invoice overdue' },
        { key:'payment_due_soon',  label:'Due soon (3 days)' },
        { key:'payment_received',  label:'Payment received' },
      ],
    },
    {
      label:'System', icon:'fa-solid fa-gear', iconBg:'bg-slate-50', iconColor:'text-slate-500',
      items:[
        { key:'system_updates',  label:'Updates & maintenance' },
        { key:'system_security', label:'Security alerts' },
        { key:'system_storage',  label:'Storage warnings' },
      ],
    },
  ];

  timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  }

  ngOnInit() {
    this.notifService.loadNotifications();
    this.loadSettings();
  }
}
