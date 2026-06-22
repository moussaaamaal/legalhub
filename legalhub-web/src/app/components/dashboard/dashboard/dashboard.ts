import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import {
  DashboardService,
  DashboardStats, DashboardActivity, TodayEvent,
} from '../../../services/dashboard.service';
import { NewCaseModal }    from '../../../shared/modals/new-case-modal/new-case-modal';
import { NewClientModal }  from '../../../shared/modals/new-client-modal/new-client-modal';
import { NewEventModal }   from '../../../shared/modals/new-event-modal/new-event-modal';
import { NewInvoiceModal } from '../../../shared/modals/new-invoice-modal/new-invoice-modal';
import { UploadModal }         from '../../../shared/modals/upload-modal/upload-modal';
import { UploadModalService }  from '../../../shared/modals/upload-modal/upload-modal.sevice';
import { DocumentService }     from '../../../services/document.service';
import { CaseService }         from '../../../services/case.service';
import { VoiceNoteModal }      from '../../../shared/modals/voice-note-modal/voice-note-modal';
import { NewNoteModal }         from '../../../shared/modals/new-note-modal/new-note-modal';
import { AiFirmChatModal }     from '../../../shared/modals/ai-firm-chat-modal/ai-firm-chat-modal';

declare var Plotly: any;

interface QuickAction { id: string; label: string; icon: string; color: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgClass, NewCaseModal, NewClientModal, NewEventModal, NewInvoiceModal, UploadModal, VoiceNoteModal, NewNoteModal, AiFirmChatModal],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, AfterViewInit {

  @ViewChild(NewCaseModal)    caseModal!:    NewCaseModal;
  @ViewChild(NewClientModal)  clientModal!:  NewClientModal;
  @ViewChild(NewEventModal)   eventModal!:   NewEventModal;
  @ViewChild(NewInvoiceModal) invoiceModal!: NewInvoiceModal;
  @ViewChild(VoiceNoteModal)  voiceModal!:   VoiceNoteModal;
  @ViewChild(NewNoteModal)    noteModal!:    NewNoteModal;
  @ViewChild(AiFirmChatModal) firmAiModal!:  AiFirmChatModal;
  private authService  = inject(AuthService);
  private dashboardSvc = inject(DashboardService);
  private upload       = inject(UploadModalService);
  private docService   = inject(DocumentService);
  private caseService  = inject(CaseService);
  private router       = inject(Router);
  private http         = inject(HttpClient);

  currentUser = this.authService.currentUser;
  isAdmin     = computed(() => this.currentUser()?.role === 'admin');

  // ── Loading flags ─────────────────────────────────────────────
  statsLoading  = signal(true);
  todayLoading  = signal(true);
  actLoading    = signal(true);

  // ── Data signals ──────────────────────────────────────────────
  stats          = signal<DashboardStats | null>(null);
  todayEvents    = signal<TodayEvent[]>([]);
  recentActivity = signal<DashboardActivity[]>([]);

  // ── Computed KPI cards ────────────────────────────────────────
  metrics = computed(() => {
    const s     = this.stats();
    const admin = this.isAdmin();
    return [
      {
        icon: 'fa-solid fa-briefcase', bgColor: 'bg-blue-100', iconColor: 'text-blue-600',
        value: s !== null ? String(s.active_cases) : null,
        label: admin ? 'Active Cases' : 'My Active Cases',
        badge: 'Active', badgeColor: 'text-blue-600 bg-blue-100',
      },
      {
        icon: 'fa-solid fa-circle-check', bgColor: 'bg-green-100', iconColor: 'text-green-600',
        value: s !== null ? String(s.closed_cases) : null,
        label: admin ? 'Closed Cases' : 'My Closed Cases',
        badge: 'Total', badgeColor: 'text-green-600 bg-green-100',
      },
      {
        icon: 'fa-solid fa-gavel', bgColor: 'bg-amber-100', iconColor: 'text-amber-600',
        value: s !== null ? String(s.upcoming_hearings) : null,
        label: admin ? 'Upcoming Hearings' : 'My Hearings',
        badge: s && s.upcoming_hearings > 0 ? 'Scheduled' : 'None',
        badgeColor: s && s.upcoming_hearings > 0 ? 'text-amber-600 bg-amber-100' : 'text-gray-500 bg-gray-100',
      },
      {
        icon: 'fa-solid fa-dollar-sign', bgColor: 'bg-purple-100', iconColor: 'text-purple-600',
        value: s !== null ? this.formatAmount(s.pending_payments) : null,
        label: admin ? 'Pending Payments' : 'My Pending Payments',
        badge: s && s.pending_payments > 0 ? 'Due' : 'Clear',
        badgeColor: s && s.pending_payments > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100',
      },
      {
        icon: 'fa-solid fa-clock', bgColor: 'bg-red-100', iconColor: 'text-red-600',
        value: s !== null ? String(s.active_reminders) : null,
        label: admin ? 'Active Reminders' : 'My Reminders',
        badge: s && s.active_reminders > 0 ? 'Overdue' : 'On Track',
        badgeColor: s && s.active_reminders > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100',
      },
    ];
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.dashboardSvc.getStats()
        .then(d  => this.stats.set(d))
        .catch(() => {})
        .finally(() => this.statsLoading.set(false)),
      this.dashboardSvc.getTodaySchedule()
        .then(d  => this.todayEvents.set(d))
        .catch(() => {})
        .finally(() => this.todayLoading.set(false)),
      this.dashboardSvc.getRecentActivity()
        .then(d  => this.recentActivity.set(d))
        .catch(() => {})
        .finally(() => this.actLoading.set(false)),
      this.caseService.loadCases().catch(() => {}),
    ]);
    if (this.plotlyReady) this.renderCaseDistributionChart();
  }

  private plotlyReady = false;

  ngAfterViewInit(): void {
    this.loadPlotly().then(() => {
      this.plotlyReady = true;
      this.renderCharts();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  formatAmount(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  formatTime(dt: string): string {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  formatDateMonth(dt: string): string {
    return new Date(dt).toLocaleString('en-US', { month: 'short' }).toUpperCase();
  }

  formatDateDay(dt: string): string {
    return String(new Date(dt).getDate());
  }

  relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m  = Math.floor(diff / 60_000);
    const h  = Math.floor(diff / 3_600_000);
    const dy = Math.floor(diff / 86_400_000);
    if (m  < 1)  return 'Just now';
    if (m  < 60) return `${m}m ago`;
    if (h  < 24) return `${h}h ago`;
    if (dy < 7)  return `${dy}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  eventCardClass(type: string): string {
    const map: Record<string, string> = {
      HEARING:      'bg-red-50 border-red-200',
      COURT_DATE:   'bg-red-50 border-red-200',
      DEADLINE:     'bg-amber-50 border-amber-200',
      MEETING:      'bg-blue-50 border-blue-200',
      CONSULTATION: 'bg-green-50 border-green-200',
      FILING:       'bg-purple-50 border-purple-200',
      MEDIATION:    'bg-indigo-50 border-indigo-200',
      ARBITRATION:  'bg-orange-50 border-orange-200',
    };
    return map[type] ?? 'bg-gray-50 border-gray-200';
  }

  eventBadgeClass(type: string): string {
    const map: Record<string, string> = {
      HEARING:      'bg-red-600',
      COURT_DATE:   'bg-red-600',
      DEADLINE:     'bg-amber-500',
      MEETING:      'bg-blue-500',
      CONSULTATION: 'bg-green-500',
      FILING:       'bg-purple-500',
      MEDIATION:    'bg-indigo-500',
      ARBITRATION:  'bg-orange-500',
    };
    return map[type] ?? 'bg-gray-500';
  }

  eventDateBgClass(type: string): string {
    const map: Record<string, string> = {
      HEARING:      'bg-red-100 text-red-700',
      COURT_DATE:   'bg-red-100 text-red-700',
      DEADLINE:     'bg-amber-100 text-amber-700',
      MEETING:      'bg-blue-100 text-blue-700',
      CONSULTATION: 'bg-green-100 text-green-700',
      FILING:       'bg-purple-100 text-purple-700',
      MEDIATION:    'bg-indigo-100 text-indigo-700',
      ARBITRATION:  'bg-orange-100 text-orange-700',
    };
    return map[type] ?? 'bg-gray-100 text-gray-700';
  }

  eventTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      HEARING:      'Court Hearing',
      COURT_DATE:   'Court Date',
      MEETING:      'Meeting',
      CONSULTATION: 'Consultation',
      DEADLINE:     'Deadline',
      FILING:       'Filing',
      DEPOSITION:   'Deposition',
      MEDIATION:    'Mediation',
      ARBITRATION:  'Arbitration',
    };
    return labels[type] ?? type.replace(/_/g, ' ');
  }

  readonly todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  skeletonItems = [1, 2, 3, 4, 5];

  // ── Quick Actions ─────────────────────────────────────────────
  readonly allActions: QuickAction[] = [
    { id: 'add-case',     label: 'Add Case',      icon: 'fa-solid fa-plus',          color: 'bg-blue-500'   },
    { id: 'add-client',   label: 'Add Client',    icon: 'fa-solid fa-user-plus',     color: 'bg-green-500'  },
    { id: 'upload-doc',   label: 'Upload Doc',    icon: 'fa-solid fa-upload',        color: 'bg-red-500'    },
    { id: 'new-note',     label: 'New Note',      icon: 'fa-solid fa-note-sticky',   color: 'bg-yellow-500' },
    { id: 'ai-assistant', label: 'AI Assistant',  icon: 'fa-solid fa-robot',         color: 'bg-indigo-500' },
    { id: 'schedule',     label: 'Schedule',      icon: 'fa-solid fa-calendar-plus', color: 'bg-amber-500'  },
    { id: 'invoice',      label: 'Invoice',       icon: 'fa-solid fa-file-invoice',  color: 'bg-purple-500' },
    { id: 'voice-note',   label: 'Voice Note',    icon: 'fa-solid fa-microphone',    color: 'bg-rose-500'   },
  ];

  private readonly QA_KEY = 'dashboard_hidden_actions';

  customizeMode   = signal(false);
  hiddenActionIds = signal<string[]>(JSON.parse(localStorage.getItem('dashboard_hidden_actions') ?? '[]') as string[]);

  showAllActivity = signal(false);
  visibleActivity = computed(() =>
    this.showAllActivity() ? this.recentActivity() : this.recentActivity().slice(0, 3)
  );

  // ── Global search ─────────────────────────────────────────────
  searchQuery   = signal('');
  searchOpen    = signal(false);
  searchLoading = signal(false);
  searchResults = signal<{
    clients: any[]; cases: any[]; tasks: any[]; notes: any[]; invoices: any[];
  } | null>(null);
  noResults = computed(() => {
    const r = this.searchResults();
    return r !== null && !r.clients.length && !r.cases.length &&
           !r.tasks.length && !r.notes.length && !r.invoices.length;
  });
  totalResults = computed(() => {
    const r = this.searchResults();
    if (!r) return 0;
    return r.clients.length + r.cases.length + r.tasks.length + r.notes.length + r.invoices.length;
  });
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (query.trim().length < 2) {
      this.searchResults.set(null);
      this.searchOpen.set(false);
      return;
    }
    this.searchLoading.set(true);
    this.searchOpen.set(true);
    this.searchTimer = setTimeout(() => this.runSearch(query.trim()), 400);
  }

  private async runSearch(q: string): Promise<void> {
    const lq  = q.toLowerCase();
    const api = environment.apiUrl;
    try {
      const [clients, cases, tasks, notes, invoices] = await Promise.all([
        firstValueFrom(this.http.get<any[]>(`${api}/api/clients`, { params: { search: q } })).catch(() => [] as any[]),
        firstValueFrom(this.http.get<any[]>(`${api}/api/cases`)).catch(() => [] as any[]),
        firstValueFrom(this.http.get<any[]>(`${api}/api/tasks`)).catch(() => [] as any[]),
        firstValueFrom(this.http.get<any[]>(`${api}/api/notes`)).catch(() => [] as any[]),
        firstValueFrom(this.http.get<any[]>(`${api}/api/invoices`)).catch(() => [] as any[]),
      ]);
      const match = (str: string) => str.toLowerCase().includes(lq);
      this.searchResults.set({
        clients:  clients.slice(0, 4),
        cases:    cases.filter(c =>
          match(c.title ?? '') || match(c.case_number ?? '') ||
          match(`${c.client?.first_name ?? ''} ${c.client?.last_name ?? ''}`)
        ).slice(0, 4),
        tasks:    tasks.filter(t => match(t.title ?? '')).slice(0, 3),
        notes:    notes.filter(n => match(n.title ?? '') || match(n.content ?? '')).slice(0, 3),
        invoices: invoices.filter(i =>
          match(i.invoice_number ?? '') ||
          match(`${i.client?.first_name ?? ''} ${i.client?.last_name ?? ''}`)
        ).slice(0, 3),
      });
    } finally {
      this.searchLoading.set(false);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set(null);
    this.searchOpen.set(false);
  }

  exportOpen = signal(false);

  private computeDistributionData() {
    const counts = new Map<string, number>();
    for (const c of this.caseService.cases()) {
      const area = c.practiceArea || c.type || 'Other';
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }

  exportPDF(): void {
    const period = this.chartPeriod();
    const stats  = this.stats();
    const data   = this.computeActivityData(period);
    const dist   = this.computeDistributionData();
    const total  = dist.reduce((s, d) => s + d.count, 0);

    const activityRows = data.labels.map((l: string, i: number) =>
      `<tr><td>${l}</td><td>${data.opened[i]}</td><td>${data.closed[i]}</td></tr>`
    ).join('');
    const distRows = dist.map(d =>
      `<tr><td>${d.label}</td><td>${d.count}</td><td>${total ? ((d.count / total) * 100).toFixed(1) + '%' : '—'}</td></tr>`
    ).join('');
    const kpis = [
      ['Active Cases',       stats?.active_cases       ?? '—'],
      ['Closed Cases',       stats?.closed_cases        ?? '—'],
      ['Upcoming Hearings',  stats?.upcoming_hearings   ?? '—'],
      ['Pending Payments',   stats ? this.formatAmount(stats.pending_payments) : '—'],
      ['Active Reminders',   stats?.active_reminders    ?? '—'],
    ].map(([k, v]) => `<div class="kpi-card"><div class="kpi-value">${v}</div><div class="kpi-label">${k}</div></div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Dashboard Report</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#1f2937}
  h1{font-size:22px;color:#f59e0b;margin-bottom:4px}
  .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
  h2{font-size:15px;color:#374151;margin:24px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px}
  .kpi-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
  .kpi-value{font-size:22px;font-weight:700;color:#1f2937}
  .kpi-label{font-size:12px;color:#6b7280;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f9fafb;padding:8px 12px;text-align:left;font-weight:600}
  td{padding:8px 12px;border-bottom:1px solid #f3f4f6}
</style></head><body>
<h1>Dashboard Report</h1>
<div class="sub">Period: ${period.charAt(0).toUpperCase() + period.slice(1)} &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
<h2>KPI Summary</h2><div class="kpi">${kpis}</div>
<h2>Case Activity — ${period.charAt(0).toUpperCase() + period.slice(1)}</h2>
<table><thead><tr><th>Period</th><th>Cases Opened</th><th>Cases Closed</th></tr></thead>
<tbody>${activityRows}</tbody></table>
<h2>Case Distribution — By Practice Area</h2>
<table><thead><tr><th>Practice Area</th><th>Cases</th><th>Share</th></tr></thead>
<tbody>${distRows}</tbody></table>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print(); }
  }

  exportExcel(): void {
    const period = this.chartPeriod();
    const stats  = this.stats();
    const data   = this.computeActivityData(period);
    const dist   = this.computeDistributionData();
    const total  = dist.reduce((s, d) => s + d.count, 0);
    const lines  = [
      `Dashboard Report — ${period.toUpperCase()}`,
      `Generated,${new Date().toLocaleDateString()}`,
      '',
      'KPI Summary',
      `Active Cases,${stats?.active_cases ?? ''}`,
      `Closed Cases,${stats?.closed_cases ?? ''}`,
      `Upcoming Hearings,${stats?.upcoming_hearings ?? ''}`,
      `Pending Payments,${stats ? this.formatAmount(stats.pending_payments) : ''}`,
      `Active Reminders,${stats?.active_reminders ?? ''}`,
      '',
      `Case Activity (${period})`,
      'Period,Cases Opened,Cases Closed',
      ...data.labels.map((l: string, i: number) => `${l},${data.opened[i]},${data.closed[i]}`),
      '',
      'Case Distribution',
      'Practice Area,Cases,Share',
      ...dist.map(d => `${d.label},${d.count},${total ? ((d.count / total) * 100).toFixed(1) + '%' : '0%'}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `dashboard-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  showToast(msg: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ msg, type });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  onCaseSaved():   void { this.showToast('Case created successfully!'); }
  onClientSaved(): void { this.showToast('Client added successfully!'); }

  readonly cases = this.caseService.cases;

  visibleActions = computed(() => this.allActions.filter(a => !this.hiddenActionIds().includes(a.id)));
  hiddenActions  = computed(() => this.allActions.filter(a =>  this.hiddenActionIds().includes(a.id)));

  toggleCustomize(): void { this.customizeMode.update(v => !v); }

  hideAction(event: Event, id: string): void {
    event.stopPropagation();
    const updated = [...this.hiddenActionIds(), id];
    this.hiddenActionIds.set(updated);
    localStorage.setItem(this.QA_KEY, JSON.stringify(updated));
  }

  showAction(id: string): void {
    const updated = this.hiddenActionIds().filter(x => x !== id);
    this.hiddenActionIds.set(updated);
    localStorage.setItem(this.QA_KEY, JSON.stringify(updated));
  }

  resetActions(): void {
    this.hiddenActionIds.set([]);
    localStorage.removeItem(this.QA_KEY);
  }

  onActionClick(action: QuickAction): void {
    if (this.customizeMode()) return;
    switch (action.id) {
      case 'add-case':     this.caseModal.openModal();               break;
      case 'add-client':   this.clientModal.openModal();             break;
      case 'upload-doc':   this.openUpload();                        break;
      case 'new-note':     this.noteModal.openModal();               break;
      case 'ai-assistant': this.firmAiModal.open();                   break;
      case 'schedule':     this.eventModal.openModal();              break;
      case 'invoice':      this.invoiceModal.openModal();            break;
      case 'voice-note':   this.voiceModal.openModal();              break;
    }
  }

  onNoteSaved(): void { this.showToast('Note saved successfully!'); }

  async openUpload(): Promise<void> {
    if (this.caseService.cases().length === 0) {
      await this.caseService.loadCases().catch(() => {});
    }
    this.upload.setCases(this.caseService.cases().map(c => ({ id: c.id, name: c.title })));
    this.upload.openWithUpload('*', async (file: File) => {
      const caseId = this.upload.getSelectedCaseId();
      if (!caseId) throw new Error('Please select a case');
      await this.docService.uploadFile(file, caseId);
    });
  }

  // ── Charts ────────────────────────────────────────────────────
  chartPeriod = signal<'monthly' | 'quarterly' | 'yearly'>('monthly');

  private computeActivityData(period: 'monthly' | 'quarterly' | 'yearly') {
    const cases = this.caseService.cases();
    const closedStatuses = new Set(['SETTLED', 'CLOSED']);
    const now = new Date();

    type Bucket = { label: string; key: string };
    const buckets: Bucket[] = [];

    if (period === 'monthly') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleString('en-US', { month: 'short' }),
        });
      }
    } else if (period === 'quarterly') {
      const curQ = Math.floor(now.getMonth() / 3);
      for (let i = 3; i >= 0; i--) {
        let q = curQ - i;
        let y = now.getFullYear();
        while (q < 0) { q += 4; y--; }
        buckets.push({ key: `${y}-Q${q + 1}`, label: `Q${q + 1} ${y}` });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const y = now.getFullYear() - i;
        buckets.push({ key: String(y), label: String(y) });
      }
    }

    const openedMap = new Map<string, number>();
    const closedMap = new Map<string, number>();
    buckets.forEach(b => { openedMap.set(b.key, 0); closedMap.set(b.key, 0); });

    for (const c of cases) {
      const created = c.openDate instanceof Date ? c.openDate : new Date(c.openDate);
      if (isNaN(created.getTime())) continue;

      let key: string;
      if (period === 'monthly') {
        key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'quarterly') {
        key = `${created.getFullYear()}-Q${Math.floor(created.getMonth() / 3) + 1}`;
      } else {
        key = String(created.getFullYear());
      }

      if (openedMap.has(key)) openedMap.set(key, openedMap.get(key)! + 1);
      if (closedStatuses.has(c.status) && closedMap.has(key)) {
        closedMap.set(key, closedMap.get(key)! + 1);
      }
    }

    return {
      labels: buckets.map(b => b.label),
      opened: buckets.map(b => openedMap.get(b.key)!),
      closed: buckets.map(b => closedMap.get(b.key)!),
    };
  }

  setChartPeriod(period: 'monthly' | 'quarterly' | 'yearly'): void {
    this.chartPeriod.set(period);
    this.renderCaseActivityChart();
  }

  private renderCaseActivityChart(): void {
    const data = this.computeActivityData(this.chartPeriod());
    Plotly.react('case-activity-chart', [
      { x: data.labels, y: data.opened, type: 'scatter', mode: 'lines', name: 'Cases Opened', line: { color: '#3b82f6', width: 3 }, fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.1)' },
      { x: data.labels, y: data.closed, type: 'scatter', mode: 'lines', name: 'Cases Closed', line: { color: '#10b981', width: 3 } },
    ], { title: { text: '' }, xaxis: { title: '' }, yaxis: { title: 'Number of Cases', rangemode: 'nonnegative', dtick: 1, tick0: 0 }, margin: { t: 20, r: 20, b: 40, l: 50 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: true, legend: { x: 0, y: 1.1, orientation: 'h' } }, { responsive: true, displayModeBar: false });
  }

  private renderCaseDistributionChart(): void {
    const cases = this.caseService.cases();
    const counts = new Map<string, number>();
    for (const c of cases) {
      const area = c.practiceArea || c.type || 'Other';
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }

    const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];
    const layout = { title: { text: '' }, margin: { t: 20, r: 20, b: 20, l: 20 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: true, legend: { x: 0, y: -0.1, orientation: 'h' } };
    const config = { responsive: true, displayModeBar: false };

    if (counts.size === 0) {
      Plotly.react('case-distribution-chart', [{ labels: ['No data'], values: [1], type: 'pie', marker: { colors: ['#e5e7eb'] }, textinfo: 'label', hoverinfo: 'none' }], layout, config);
      return;
    }

    const labels = [...counts.keys()];
    const values = labels.map(l => counts.get(l)!);
    Plotly.react('case-distribution-chart', [{
      labels, values, type: 'pie',
      marker: { colors: colors.slice(0, labels.length) },
      textinfo: 'percent', hoverinfo: 'label+percent+value',
    }], layout, config);
  }

  private loadPlotly(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof Plotly !== 'undefined') { resolve(); return; }
      const s  = document.createElement('script');
      s.src    = 'https://cdn.plot.ly/plotly-3.1.1.min.js';
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
  }

  private renderCharts(): void {
    try {
      this.renderCaseActivityChart();

      this.renderCaseDistributionChart();

      Plotly.newPlot('revenue-chart', [{
        x: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'],
        y: [85000,92000,88000,105000,98000,112000,108000,125000,118000,132000,124500],
        type: 'bar', marker: { color: '#f59e0b' },
      }], { title: { text: '' }, xaxis: { title: '' }, yaxis: { title: 'Revenue ($)' }, margin: { t: 20, r: 20, b: 40, l: 60 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: false }, { responsive: true, displayModeBar: false });
    } catch (e) { console.error('Chart error:', e); }
  }
}
