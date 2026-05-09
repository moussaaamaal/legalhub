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
import { NewCaseModal }    from '../../shared/new-case-modal/new-case-modal';
import { NewClientModal }  from '../../shared/new-client-modal/new-client-modal';
import { NewEventModal }   from '../../shared/new-event-modal/new-event-modal';
import { NewInvoiceModal } from '../../shared/new-invoice-modal/new-invoice-modal';
import { UploadModal }         from '../../../shared/upload-modal/upload-modal';
import { UploadModalService }  from '../../../shared/upload-modal/upload-modal.sevice';
import { DocumentService }     from '../../../services/document.service';
import { CaseService }         from '../../../services/case.service';
import { TaskService }         from '../../../services/task.service';
import { VoiceNoteModal }      from '../../../shared/voice-note-modal/voice-note-modal';

declare var Plotly: any;

interface QuickAction { id: string; label: string; sublabel: string; icon: string; color: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgClass, NewCaseModal, NewClientModal, NewEventModal, NewInvoiceModal, UploadModal, VoiceNoteModal],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, AfterViewInit {

  @ViewChild(NewCaseModal)    caseModal!:    NewCaseModal;
  @ViewChild(NewClientModal)  clientModal!:  NewClientModal;
  @ViewChild(NewEventModal)   eventModal!:   NewEventModal;
  @ViewChild(NewInvoiceModal) invoiceModal!: NewInvoiceModal;
  @ViewChild(VoiceNoteModal)  voiceModal!:   VoiceNoteModal;
  private authService  = inject(AuthService);
  private dashboardSvc = inject(DashboardService);
  private upload       = inject(UploadModalService);
  private docService   = inject(DocumentService);
  private caseService  = inject(CaseService);
  private taskService  = inject(TaskService);
  private router       = inject(Router);
  private http         = inject(HttpClient);

  currentUser = this.authService.currentUser;

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
    const s = this.stats();
    return [
      {
        icon: 'fa-solid fa-briefcase', bgColor: 'bg-blue-100', iconColor: 'text-blue-600',
        value: s !== null ? String(s.active_cases) : null,
        label: 'Active Cases', badge: 'Active', badgeColor: 'text-blue-600 bg-blue-100',
        note: 'Currently open',
      },
      {
        icon: 'fa-solid fa-circle-check', bgColor: 'bg-green-100', iconColor: 'text-green-600',
        value: s !== null ? String(s.closed_cases) : null,
        label: 'Closed Cases', badge: 'Total', badgeColor: 'text-green-600 bg-green-100',
        note: 'Successfully resolved',
      },
      {
        icon: 'fa-solid fa-gavel', bgColor: 'bg-amber-100', iconColor: 'text-amber-600',
        value: s !== null ? String(s.upcoming_hearings) : null,
        label: 'Upcoming Hearings',
        badge: s && s.upcoming_hearings > 0 ? 'Scheduled' : 'None',
        badgeColor: s && s.upcoming_hearings > 0 ? 'text-amber-600 bg-amber-100' : 'text-gray-500 bg-gray-100',
        note: 'From today onwards',
      },
      {
        icon: 'fa-solid fa-dollar-sign', bgColor: 'bg-purple-100', iconColor: 'text-purple-600',
        value: s !== null ? this.formatAmount(s.pending_payments) : null,
        label: 'Pending Payments',
        badge: s && s.pending_payments > 0 ? 'Due' : 'Clear',
        badgeColor: s && s.pending_payments > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100',
        note: 'Awaiting collection',
      },
      {
        icon: 'fa-solid fa-clock', bgColor: 'bg-red-100', iconColor: 'text-red-600',
        value: s !== null ? String(s.active_reminders) : null,
        label: 'Active Reminders',
        badge: s && s.active_reminders > 0 ? 'Overdue' : 'On Track',
        badgeColor: s && s.active_reminders > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100',
        note: 'Tasks past due date',
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
    ]);
  }

  ngAfterViewInit(): void {
    this.loadPlotly().then(() => this.renderCharts());
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

  skeletonItems = [1, 2, 3, 4, 5];

  // ── Quick Actions ─────────────────────────────────────────────
  readonly allActions: QuickAction[] = [
    { id: 'add-case',     label: 'Add Case',      sublabel: 'Create case file',  icon: 'fa-solid fa-plus',          color: 'bg-blue-500'   },
    { id: 'add-client',   label: 'Add Client',    sublabel: 'Register new',      icon: 'fa-solid fa-user-plus',     color: 'bg-green-500'  },
    { id: 'upload-doc',   label: 'Upload Doc',    sublabel: 'Add document',      icon: 'fa-solid fa-upload',        color: 'bg-red-500'    },
    { id: 'new-note',     label: 'New Note',      sublabel: 'Quick note',        icon: 'fa-solid fa-note-sticky',   color: 'bg-yellow-500' },
    { id: 'ai-assistant', label: 'AI Assistant',  sublabel: 'Generate doc',      icon: 'fa-solid fa-robot',         color: 'bg-indigo-500' },
    { id: 'schedule',     label: 'Schedule',      sublabel: 'Book hearing',      icon: 'fa-solid fa-calendar-plus', color: 'bg-amber-500'  },
    { id: 'invoice',      label: 'Invoice',       sublabel: 'Create billing',    icon: 'fa-solid fa-file-invoice',  color: 'bg-purple-500' },
    { id: 'voice-note',   label: 'Voice Note',    sublabel: 'Record audio',      icon: 'fa-solid fa-microphone',    color: 'bg-rose-500'   },
  ];

  private readonly QA_KEY = 'dashboard_hidden_actions';

  customizeMode   = signal(false);
  hiddenActionIds = signal<string[]>(JSON.parse(localStorage.getItem('dashboard_hidden_actions') ?? '[]') as string[]);
  noteOpen        = signal(false);
  noteTitle       = signal('');
  noteLinkedCase  = signal('');
  noteContent     = signal('');
  noteSaving      = signal(false);

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

  exportPDF(): void {
    const period = this.chartPeriod();
    const stats  = this.stats();
    const data   = this.chartData[period];
    const rows   = data.labels.map((l, i) =>
      `<tr><td>${l}</td><td>${data.active[i]}</td><td>${data.closed[i]}</td></tr>`
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
<table><thead><tr><th>Period</th><th>Active Cases</th><th>Closed Cases</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print(); }
  }

  exportExcel(): void {
    const period = this.chartPeriod();
    const stats  = this.stats();
    const data   = this.chartData[period];
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
      'Period,Active Cases,Closed Cases',
      ...data.labels.map((l, i) => `${l},${data.active[i]},${data.closed[i]}`),
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
      case 'new-note':     this.openNewNote();                       break;
      case 'ai-assistant': this.router.navigate(['/ai-assistant']);  break;
      case 'schedule':     this.eventModal.openModal();              break;
      case 'invoice':      this.invoiceModal.openModal();            break;
      case 'voice-note':   this.voiceModal.openModal();              break;
    }
  }

  async openNewNote(): Promise<void> {
    this.noteTitle.set('');
    this.noteLinkedCase.set('');
    this.noteContent.set('');
    if (this.caseService.cases().length === 0) {
      await this.caseService.loadCases().catch(() => {});
    }
    this.noteOpen.set(true);
  }

  async saveNote(): Promise<void> {
    const caseId = this.noteLinkedCase();
    if (!caseId || !this.noteContent()) return;
    this.noteSaving.set(true);
    try {
      await this.taskService.createNote({
        case_id: caseId,
        title:   this.noteTitle() || undefined,
        content: this.noteContent(),
      });
      this.noteOpen.set(false);
      this.showToast('Note saved successfully!');
    } catch {
      this.showToast('Failed to save note.', 'error');
    } finally {
      this.noteSaving.set(false);
    }
  }

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

  private readonly chartData = {
    monthly: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      active: [12,15,18,14,20,22,19,24,21,26,24,28],
      closed: [8,11,13,10,15,17,14,18,16,20,19,22],
    },
    quarterly: {
      labels: ['Q1','Q2','Q3','Q4'],
      active: [45,56,64,78],
      closed: [32,42,48,61],
    },
    yearly: {
      labels: ['2020','2021','2022','2023','2024','2025'],
      active: [95,118,134,162,189,210],
      closed: [72,89,104,128,152,176],
    },
  };

  setChartPeriod(period: 'monthly' | 'quarterly' | 'yearly'): void {
    this.chartPeriod.set(period);
    this.renderCaseActivityChart();
  }

  private renderCaseActivityChart(): void {
    const data = this.chartData[this.chartPeriod()];
    Plotly.react('case-activity-chart', [
      { x: data.labels, y: data.active, type: 'scatter', mode: 'lines', name: 'Active Cases', line: { color: '#3b82f6', width: 3 }, fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.1)' },
      { x: data.labels, y: data.closed, type: 'scatter', mode: 'lines', name: 'Closed Cases', line: { color: '#10b981', width: 3 } },
    ], { title: { text: '' }, xaxis: { title: '' }, yaxis: { title: 'Number of Cases' }, margin: { t: 20, r: 20, b: 40, l: 50 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: true, legend: { x: 0, y: 1.1, orientation: 'h' } }, { responsive: true, displayModeBar: false });
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

      Plotly.newPlot('case-distribution-chart', [{
        labels: ['Civil Litigation','Estate Law','Real Estate','Employment','Corporate','Family Law'],
        values: [28,18,15,12,17,10], type: 'pie',
        marker: { colors: ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'] },
        textinfo: 'percent', hoverinfo: 'label+percent+value',
      }], { title: { text: '' }, margin: { t: 20, r: 20, b: 20, l: 20 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: true, legend: { x: 0, y: -0.1, orientation: 'v' } }, { responsive: true, displayModeBar: false });

      Plotly.newPlot('revenue-chart', [{
        x: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'],
        y: [85000,92000,88000,105000,98000,112000,108000,125000,118000,132000,124500],
        type: 'bar', marker: { color: '#f59e0b' },
      }], { title: { text: '' }, xaxis: { title: '' }, yaxis: { title: 'Revenue ($)' }, margin: { t: 20, r: 20, b: 40, l: 60 }, plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff', showlegend: false }, { responsive: true, displayModeBar: false });
    } catch (e) { console.error('Chart error:', e); }
  }
}
