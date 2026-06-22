import { Component, signal, computed, OnInit, inject, ViewChild } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client } from '../../../models';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { BillingService } from '../../../services/billing.service';
import { UploadModalService } from '../../../shared/modals/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/modals/upload-modal/upload-modal';
import { NewCaseModal } from '../../../shared/modals/new-case-modal/new-case-modal';
import { RequestDocModal } from '../../../shared/modals/request-doc-modal/request-doc-modal';
import { DocumentService } from '../../../services/document.service';
import { NewInvoiceModal } from '../../../shared/modals/new-invoice-modal/new-invoice-modal';
import { InvoiceViewModal } from '../../../shared/modals/invoice-view-modal/invoice-view-modal';
import { ConfirmDialog } from '../../../shared/modals/confirm-dialog/confirm-dialog';
import { AiSummaryModal } from '../../../shared/modals/ai-summary-modal/ai-summary-modal';


@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [NgClass, DecimalPipe, FormsModule, UploadModal, NewCaseModal, RequestDocModal, NewInvoiceModal, InvoiceViewModal, ConfirmDialog, AiSummaryModal],
  templateUrl: './client-detail.html',
})
export class ClientDetail implements OnInit {
  private clientService  = inject(ClientService);
  private billingService = inject(BillingService);
  private docService     = inject(DocumentService);
  private auth           = inject(AuthService);
  constructor(private route: ActivatedRoute, private router: Router) {}
  upload = inject(UploadModalService);

  @ViewChild(NewCaseModal)    newCaseModal!: NewCaseModal;
  @ViewChild(RequestDocModal) requestDocModal!: RequestDocModal;
  @ViewChild(NewInvoiceModal) invoiceModal!: NewInvoiceModal;
  @ViewChild(AiSummaryModal)  aiSummaryModal!: AiSummaryModal;

  openNewCaseModal() {
    const c = this.client();
    this.newCaseModal.openModal(c?.id ?? '', c?.name ?? '');
  }

  openRequestDocModal() {
    this.requestDocModal.openModal();
  }

  async openUploadDocModal() {
    const clientId = this.client()?.id;
    if (!clientId) return;
    if (this.backendCases().length === 0) await this.loadCases(clientId);
    const currentUserId = this.auth.currentUser()?.id;
    const clientCases = this.backendCases()
      .filter(c => !currentUserId || c.lawyer_id === currentUserId)
      .map(c => ({ id: c.id, name: c.title || c.case_number }));
    this.upload.openWithUpload(
      '*',
      async (file) => { await this.docService.uploadFile(file, this.upload.getSelectedCaseId()); },
      () => this.reloadDocuments(),
      clientCases,
    );
  }

  reloadDocuments() {
    const id = this.client()?.id;
    if (id) this.loadDocuments(id);
  }

  openNewInvoiceModal() {
    const c = this.client();
    if (c) this.invoiceModal.openModalForClient(c.id, c.name);
  }

  reloadInvoices() {
    const id = this.client()?.id;
    if (id) this.loadInvoices(id);
  }

  activeTab = signal('Overview');
  tabs = ['Overview', 'Activity log', 'Cases', 'Documents', 'Payments', 'Communication', 'Notes'];

  client    = signal<Client | null>(null);
  isLoading = signal(false);

  // Backend data signals
  backendCases     = signal<any[]>([]);
  backendInvoices  = signal<any[]>([]);
  backendDocuments = signal<any[]>([]);
  backendNotes     = signal<any[]>([]);
  backendEvents         = signal<any[]>([]);
  backendUpcomingCount  = signal<number>(0);
  backendTasks     = signal<any[]>([]);
  casesLoading     = signal(false);
  invoicesLoading  = signal(false);
  docsLoading      = signal(false);
  notesLoading     = signal(false);
  eventsLoading    = signal(false);
  tasksLoading     = signal(false);
  activityFilter   = signal<string>('All');

  // Add note form
  showAddNoteForm = signal(false);
  newNoteCaseId   = signal('');
  newNoteContent  = signal('');
  isAddingNote    = signal(false);
  addNoteError    = signal<string | null>(null);



  // Documents tab filter
  docFilter         = signal<'all' | 'by-case' | 'pending' | 'approved' | 'shared'>('all');
  selectedCaseIdDoc = signal<string>('');
  selectedDocIds    = signal<Set<string>>(new Set());

  private loadedTabs = new Set<string>();

  // Computed docs filter
  filteredClientDocs = computed(() => {
    const docs   = this.backendDocuments();
    const filter = this.docFilter();
    const caseId = this.selectedCaseIdDoc();
    switch (filter) {
      case 'by-case':  return caseId ? docs.filter((d: any) => (d.case_file?.id ?? d.case_id ?? '') === caseId) : [];
      case 'pending':  return docs.filter((d: any) => d.category === 'CLIENT_DOC' && d.status === 'PENDING_REVIEW');
      case 'approved': return docs.filter((d: any) => d.category === 'CLIENT_DOC' && d.status === 'APPROVED');
      case 'shared':   return docs.filter((d: any) => d.category !== 'CLIENT_DOC' && (d.is_shared_with_client ?? false));
      default:         return docs;
    }
  });

  docCaseGroups = computed(() => {
    const map = new Map<string, { id: string; title: string; count: number }>();
    for (const d of this.backendDocuments() as any[]) {
      const id    = d.case_file?.id ?? d.case_id ?? '';
      const title = d.case_file?.title ?? d.case_file?.case_number ?? 'Unknown Case';
      if (!id) continue;
      if (!map.has(id)) map.set(id, { id, title, count: 0 });
      map.get(id)!.count++;
    }
    return Array.from(map.values());
  });

  docPendingCount = computed(() =>
    this.backendDocuments().filter((d: any) => d.category === 'CLIENT_DOC' && d.status === 'PENDING_REVIEW').length
  );

  // Computed stats from live backend data
  dynamicStats = computed(() => {
    const cases    = this.backendCases();
    const invoices = this.backendInvoices();

    const activeCases = cases.filter(c => !['CLOSED', 'SETTLED'].includes(c.status)).length;
    const closedCases = cases.filter(c =>  ['CLOSED', 'SETTLED'].includes(c.status)).length;
    const successRate = cases.length > 0 ? Math.round(closedCases / cases.length * 100) : 0;

    const totalBilled = invoices
      .filter(i => i.status !== 'CANCELLED')
      .reduce((s, i) => s + (i.total_amount ?? 0), 0);
    const cur = invoices[0]?.currency ?? 'USD';
    const fmtBilled = this.formatAmount(totalBilled, cur);

    const upcoming = this.backendUpcomingCount();

    return [
      { iconBg: 'bg-blue-100',   icon: 'fa-solid fa-briefcase',      iconColor: 'text-blue-600',
        value: cases.length > 0 ? String(activeCases) : '—',
        label: 'Active Cases',    note: cases.length > 0 ? `${cases.length} total` : 'Loading…' },
      { iconBg: 'bg-green-100',  icon: 'fa-solid fa-check-circle',   iconColor: 'text-green-600',
        value: cases.length > 0 ? String(closedCases) : '—',
        label: 'Closed Cases',    note: cases.length > 0 ? `${successRate}% of total` : 'Loading…' },
      { iconBg: 'bg-amber-100',  icon: 'fa-solid fa-dollar-sign',    iconColor: 'text-amber-600',
        value: invoices.length > 0 ? fmtBilled : '—',
        label: 'Total Billed',    note: invoices.length > 0 ? `${invoices.filter(i => i.status === 'PAID').length} invoice(s) paid` : 'Loading…' },
      { iconBg: 'bg-purple-100', icon: 'fa-solid fa-trophy',         iconColor: 'text-purple-600',
        value: cases.length > 0 ? `${successRate}%` : '—',
        label: 'Success Rate',    note: cases.length > 0 ? `${closedCases} closed / ${cases.length} total` : 'Loading…' },
      { iconBg: 'bg-red-100',    icon: 'fa-solid fa-calendar-check', iconColor: 'text-red-600',
        value: String(upcoming),
        label: 'Upcoming Events', note: upcoming > 0 ? 'Scheduled appointments' : 'No upcoming events' },
    ];
  });

  // ── Activity Feed (unified timeline) ─────────────────────────────────────

  activityLoading = computed(() =>
    this.tasksLoading() || this.docsLoading() || this.notesLoading()
  );

  activityFeed = computed(() => {
    const entries: any[] = [];

    for (const c of this.backendCases()) {
      if (!c.created_at) continue;
      entries.push({
        id: `case-${c.id}`, type: 'case',
        iconBg: 'bg-blue-100', icon: 'fa-solid fa-briefcase', iconColor: 'text-blue-600',
        title: `Case opened: ${c.title || c.case_number || '—'}`,
        date: c.created_at,
        typeBadge:   { label: 'Case',    bg: 'bg-blue-100',  color: 'text-blue-700'  },
        statusBadge: this.getCaseStatusInfo(c.status),
      });
    }

    for (const inv of this.backendInvoices()) {
      if (!inv.created_at) continue;
      entries.push({
        id: `inv-${inv.id}`, type: 'payment',
        iconBg: 'bg-amber-100', icon: 'fa-solid fa-file-invoice-dollar', iconColor: 'text-amber-600',
        title: `Invoice created: ${inv.invoice_number || '—'} — ${this.formatAmount(inv.total_amount, inv.currency)}`,
        date: inv.created_at,
        typeBadge:   { label: 'Payment', bg: 'bg-amber-100', color: 'text-amber-700' },
        statusBadge: this.getInvoiceStatusInfo(inv.status),
      });
    }

    for (const doc of this.backendDocuments()) {
      if (!doc.created_at) continue;
      const fi = this.getDocIconInfo(doc.file_type);
      entries.push({
        id: `doc-${doc.id}`, type: 'document',
        iconBg: fi.bg, icon: fi.icon, iconColor: fi.color,
        title: `Document uploaded: ${doc.file_name || doc.title || '—'}`,
        caseName: doc.case_file?.title || doc.case_file?.case_number,
        date: doc.created_at,
        typeBadge:   { label: 'Document', bg: 'bg-purple-100', color: 'text-purple-700' },
        statusBadge: this.getDocStatusBadge(doc.status),
      });
    }

    for (const n of this.backendNotes()) {
      if (!n.created_at) continue;
      entries.push({
        id: `note-${n.id}`, type: 'note',
        iconBg: 'bg-indigo-100', icon: 'fa-solid fa-note-sticky', iconColor: 'text-indigo-600',
        title: 'Note added',
        subtitle: n.content ? (n.content.length > 100 ? n.content.slice(0, 100) + '…' : n.content) : undefined,
        caseName: n._caseTitle && n._caseTitle !== '—' ? n._caseTitle : undefined,
        date: n.created_at,
        typeBadge: { label: 'Note', bg: 'bg-indigo-100', color: 'text-indigo-700' },
      });
    }

    for (const ev of this.backendEvents()) {
      const ei = this.getEventTypeInfo(ev.event_type);
      entries.push({
        id: `ev-${ev.id}`, type: 'event',
        iconBg: ei.iconBg, icon: ei.icon, iconColor: ei.iconColor,
        title: ev.title,
        subtitle: ev.location,
        caseName: ev._caseTitle && ev._caseTitle !== '—' ? ev._caseTitle : undefined,
        date: ev.start_datetime,
        typeBadge: { label: ei.label, bg: ei.tagBg, color: ei.tagColor },
      });
    }

    for (const t of this.backendTasks()) {
      if (!t.created_at) continue;
      const si = this.getTaskStatusInfo(t.status);
      const pi = t.priority ? this.getTaskPriorityInfo(t.priority) : null;
      entries.push({
        id: `task-${t.id}`, type: 'task',
        iconBg: si.bg, icon: si.icon, iconColor: si.iconColor,
        title: `Task: ${t.title}`,
        subtitle: t.description,
        caseName: t.case_file?.title,
        date: t.created_at,
        typeBadge:   { label: 'Task', bg: 'bg-gray-100', color: 'text-gray-700' },
        statusBadge: { label: si.label,  bg: si.bg,  color: si.color  },
        extraBadge:  pi ? { label: pi.label, bg: pi.bg, color: pi.color } : undefined,
      });
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  });

  filteredActivityFeed = computed(() => {
    const feed = this.activityFeed();
    const f    = this.activityFilter();
    if (f === 'All') return feed;
    const map: Record<string, string> = {
      Cases: 'case', Payments: 'payment', Documents: 'document',
      Notes: 'note', Events: 'event',    Tasks: 'task',
    };
    return feed.filter(e => e.type === map[f]);
  });

  activityCounts = computed((): Record<string, number> => {
    const feed = this.activityFeed();
    return {
      All:       feed.length,
      Cases:     feed.filter(e => e.type === 'case').length,
      Payments:  feed.filter(e => e.type === 'payment').length,
      Documents: feed.filter(e => e.type === 'document').length,
      Notes:     feed.filter(e => e.type === 'note').length,
      Events:    feed.filter(e => e.type === 'event').length,
      Tasks:     feed.filter(e => e.type === 'task').length,
    };
  });

  readonly activityFilterTabs = [
    { key: 'All',       icon: 'fa-solid fa-list',                activeCls: 'border-amber-500 text-amber-600',   badgeActiveCls: 'bg-amber-100 text-amber-700'   },
    { key: 'Cases',     icon: 'fa-solid fa-briefcase',           activeCls: 'border-blue-500 text-blue-600',     badgeActiveCls: 'bg-blue-100 text-blue-700'     },
    { key: 'Payments',  icon: 'fa-solid fa-file-invoice-dollar', activeCls: 'border-amber-500 text-amber-600',   badgeActiveCls: 'bg-amber-100 text-amber-700'   },
    { key: 'Documents', icon: 'fa-solid fa-folder',              activeCls: 'border-purple-500 text-purple-600', badgeActiveCls: 'bg-purple-100 text-purple-700' },
    { key: 'Notes',     icon: 'fa-solid fa-note-sticky',         activeCls: 'border-indigo-500 text-indigo-600', badgeActiveCls: 'bg-indigo-100 text-indigo-700' },
    { key: 'Events',    icon: 'fa-solid fa-calendar-check',      activeCls: 'border-green-500 text-green-600',   badgeActiveCls: 'bg-green-100 text-green-700'   },
    { key: 'Tasks',     icon: 'fa-solid fa-list-check',          activeCls: 'border-gray-500 text-gray-600',     badgeActiveCls: 'bg-gray-200 text-gray-600'     },
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.isLoading.set(true);
    this.clientService.fetchClientById(id).then(client => {
      this.client.set(client);
      if (client) {
        this.initEditForm();
        this.loadCases(client.id).then(() => this.loadEvents());
        this.loadInvoices(client.id);
      }
    }).finally(() => this.isLoading.set(false));
  }

  setTab(t: string) {
    this.activeTab.set(t);
    const c = this.client();
    if (!c) return;
    if (t === 'Documents'    && !this.loadedTabs.has('Documents'))    this.loadDocuments(c.id);
    if (t === 'Notes'        && !this.loadedTabs.has('Notes'))        this.loadNotes();
    if (t === 'Communication'&& !this.loadedTabs.has('Communication'))this.loadEvents();
    if (t === 'Activity Log' && !this.loadedTabs.has('Activity Log')) {
      this.loadTasks();
      if (!this.loadedTabs.has('Documents')) this.loadDocuments(c.id);
      if (!this.loadedTabs.has('Notes'))     this.loadNotes();
    }
  }

  goBack() { this.router.navigate(['/clients']); }

  reloadCases() { if (this.client()?.id) this.loadCases(this.client()!.id); }

  private async loadCases(clientId: string) {
    this.casesLoading.set(true);
    const data = await this.clientService.fetchClientCases(clientId);
    this.backendCases.set(data);
    this.loadedTabs.add('Cases');
    this.casesLoading.set(false);
  }

  isInvoiceOwner(inv: any): boolean {
    const user = this.auth.currentUser();
    return user?.role === 'admin' || inv.lawyer_id === (user?.id ?? '');
  }

  private async loadInvoices(clientId: string) {
    this.invoicesLoading.set(true);
    const data = await this.clientService.fetchClientInvoices(clientId);
    const uid = this.auth.currentUser()?.id ?? '';
    const isAdmin = this.auth.currentUser()?.role === 'admin';
    this.backendInvoices.set(
      data.filter((inv: any) => isAdmin || !['DRAFT', 'CANCELLED'].includes(inv.status) || inv.lawyer_id === uid)
    );
    this.loadedTabs.add('Payments');
    this.invoicesLoading.set(false);
  }

  private async loadDocuments(clientId: string) {
    this.docsLoading.set(true);
    const data = await this.clientService.fetchClientDocuments(clientId);
    this.backendDocuments.set(data);
    this.loadedTabs.add('Documents');
    this.docsLoading.set(false);
  }

  // ── Notes ─────────────────────────────────────────────

  private async loadNotes() {
    const cases = this.backendCases();
    const caseTitleMap = Object.fromEntries(cases.map((c: any) => [c.id, c.title || c.case_number || '']));
    const caseIds = cases.map((c: any) => c.id);
    this.notesLoading.set(true);
    const data = await this.clientService.fetchNotesByCaseIds(caseIds);
    data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    data.forEach((n: any) => { n._caseTitle = caseTitleMap[n.case_id] || '—'; });
    this.backendNotes.set(data);
    this.loadedTabs.add('Notes');
    this.notesLoading.set(false);
  }

  async submitNote() {
    const caseId  = this.newNoteCaseId();
    const content = this.newNoteContent().trim();
    const clientId = this.client()?.id;
    if (!caseId || !content || !clientId) return;
    this.isAddingNote.set(true);
    this.addNoteError.set(null);
    try {
      await this.clientService.createNote(caseId, content);
      this.newNoteContent.set('');
      this.newNoteCaseId.set('');
      this.showAddNoteForm.set(false);
      this.loadedTabs.delete('Notes');
      await this.loadNotes();
    } catch {
      this.addNoteError.set('Erreur lors de la création de la note');
    } finally {
      this.isAddingNote.set(false);
    }
  }

  // ── Communication (Events) ────────────────────────────

  private async loadEvents() {
    const cases = this.backendCases();
    const caseTitleMap = Object.fromEntries(cases.map((c: any) => [c.id, c.title || c.case_number || '']));
    const caseIds = cases.map((c: any) => c.id);
    this.eventsLoading.set(true);
    const data = await this.clientService.fetchEventsByCaseIds(caseIds);
    const now = Date.now();
    this.backendUpcomingCount.set(data.filter((e: any) => new Date(e.start_datetime).getTime() > now).length);
    const past = data.filter((e: any) => new Date(e.start_datetime).getTime() <= now);
    past.sort((a: any, b: any) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
    past.forEach((e: any) => { e._caseTitle = caseTitleMap[e.case_id] || '—'; });
    this.backendEvents.set(past);
    this.loadedTabs.add('Communication');
    this.eventsLoading.set(false);
  }

  openGmail() {
    const email = this.client()?.email;
    if (!email) return;
    window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`, '_blank');
  }

  openWhatsapp(): void {
    const c = this.client();
    const phone = c?.whatsappNumber || c?.phone;
    if (!phone) return;
    const cleaned = phone.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${cleaned}`, '_blank');
  }


  // ── Activity Log (Tasks) ──────────────────────────────

  private async loadTasks() {
    const cases = this.backendCases();
    const caseIds = cases.map((c: any) => c.id);
    this.tasksLoading.set(true);
    const data = await this.clientService.fetchTasksByCaseIds(caseIds);
    data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    this.backendTasks.set(data);
    this.loadedTabs.add('Activity Log');
    this.tasksLoading.set(false);
  }

  // ── Helpers for new tabs ──────────────────────────────

  getEventTypeInfo(type: string) {
    const map: Record<string, { label: string; icon: string; iconBg: string; iconColor: string; tagBg: string; tagColor: string }> = {
      HEARING:  { label: 'Hearing',  icon: 'fa-solid fa-gavel',       iconBg: 'bg-red-100',    iconColor: 'text-red-600',    tagBg: 'bg-red-100',    tagColor: 'text-red-700'    },
      MEETING:  { label: 'Meeting',  icon: 'fa-solid fa-users',       iconBg: 'bg-purple-100', iconColor: 'text-purple-600', tagBg: 'bg-purple-100', tagColor: 'text-purple-700' },
      DEADLINE: { label: 'Deadline', icon: 'fa-solid fa-clock',       iconBg: 'bg-orange-100', iconColor: 'text-orange-600', tagBg: 'bg-orange-100', tagColor: 'text-orange-700' },
      REMINDER: { label: 'Reminder', icon: 'fa-solid fa-bell',        iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   tagBg: 'bg-blue-100',   tagColor: 'text-blue-700'   },
      CALL:     { label: 'Call',     icon: 'fa-solid fa-phone',       iconBg: 'bg-green-100',  iconColor: 'text-green-600',  tagBg: 'bg-green-100',  tagColor: 'text-green-700'  },
    };
    return map[type] ?? { label: type || 'Event', icon: 'fa-solid fa-calendar-days', iconBg: 'bg-gray-100', iconColor: 'text-gray-600', tagBg: 'bg-gray-100', tagColor: 'text-gray-700' };
  }

  getTaskStatusInfo(status: string) {
    const map: Record<string, { label: string; bg: string; color: string; icon: string; iconColor: string }> = {
      PENDING:     { label: 'Pending',     bg: 'bg-gray-100',  color: 'text-gray-700',  icon: 'fa-solid fa-clock',   iconColor: 'text-gray-500'  },
      IN_PROGRESS: { label: 'In Progress', bg: 'bg-blue-100',  color: 'text-blue-700',  icon: 'fa-solid fa-spinner', iconColor: 'text-blue-600'  },
      COMPLETED:   { label: 'Completed',   bg: 'bg-green-100', color: 'text-green-700', icon: 'fa-solid fa-check',   iconColor: 'text-green-600' },
      CANCELLED:   { label: 'Cancelled',   bg: 'bg-red-100',   color: 'text-red-700',   icon: 'fa-solid fa-xmark',   iconColor: 'text-red-600'   },
    };
    return map[status] ?? { label: status, bg: 'bg-gray-100', color: 'text-gray-700', icon: 'fa-solid fa-circle', iconColor: 'text-gray-500' };
  }

  getTaskPriorityInfo(priority: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      URGENT: { label: 'Urgent', bg: 'bg-red-100',    color: 'text-red-700'    },
      HIGH:   { label: 'High',   bg: 'bg-orange-100', color: 'text-orange-700' },
      MEDIUM: { label: 'Medium', bg: 'bg-amber-100',  color: 'text-amber-700'  },
      NORMAL: { label: 'Normal', bg: 'bg-gray-100',   color: 'text-gray-600'   },
      LOW:    { label: 'Low',    bg: 'bg-blue-100',   color: 'text-blue-700'   },
    };
    return map[priority] ?? { label: priority || 'Normal', bg: 'bg-gray-100', color: 'text-gray-600' };
  }

  formatDateTime(dt: string | null | undefined): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Display helpers ───────────────────────────────────

  getCaseStatusInfo(status: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      NEW:           { label: 'New',           bg: 'bg-gray-100',   color: 'text-gray-700'   },
      INVESTIGATION: { label: 'Investigation', bg: 'bg-blue-100',   color: 'text-blue-700'   },
      PRE_TRIAL:     { label: 'Pre-Trial',     bg: 'bg-amber-100',  color: 'text-amber-700'  },
      TRIAL:         { label: 'Trial',         bg: 'bg-orange-100', color: 'text-orange-700' },
      APPEAL:        { label: 'Appeal',        bg: 'bg-purple-100', color: 'text-purple-700' },
      SETTLED:       { label: 'Settled',       bg: 'bg-green-100',  color: 'text-green-700'  },
      CLOSED:        { label: 'Closed',        bg: 'bg-gray-200',   color: 'text-gray-600'   },
    };
    return map[status] ?? { label: status, bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getCaseTypeInfo(type: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      CRIMINAL:        { label: 'Criminal',        bg: 'bg-red-100',    color: 'text-red-700'    },
      CIVIL:           { label: 'Civil',           bg: 'bg-blue-100',   color: 'text-blue-700'   },
      CORPORATE:       { label: 'Corporate',       bg: 'bg-purple-100', color: 'text-purple-700' },
      FAMILY:          { label: 'Family',          bg: 'bg-pink-100',   color: 'text-pink-700'   },
      REAL_ESTATE:     { label: 'Real Estate',     bg: 'bg-green-100',  color: 'text-green-700'  },
      IMMIGRATION:     { label: 'Immigration',     bg: 'bg-teal-100',   color: 'text-teal-700'   },
      PERSONAL_INJURY: { label: 'Personal Injury', bg: 'bg-orange-100', color: 'text-orange-700' },
      IP:              { label: 'IP',              bg: 'bg-indigo-100', color: 'text-indigo-700' },
      LABOR:           { label: 'Labor',           bg: 'bg-yellow-100', color: 'text-yellow-700' },
      TAX:             { label: 'Tax',             bg: 'bg-amber-100',  color: 'text-amber-700'  },
    };
    return map[type] ?? { label: type || '—', bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getInvoiceStatusInfo(status: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      DRAFT:     { label: 'Draft',     bg: 'bg-gray-100',  color: 'text-gray-700'  },
      PENDING:   { label: 'Pending',   bg: 'bg-amber-100', color: 'text-amber-700' },
      PAID:      { label: 'Paid',      bg: 'bg-green-100', color: 'text-green-700' },
      OVERDUE:   { label: 'Overdue',   bg: 'bg-red-100',   color: 'text-red-700'   },
      CANCELLED: { label: 'Cancelled', bg: 'bg-gray-200',  color: 'text-gray-500'  },
    };
    return map[status] ?? { label: status, bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getDocIconInfo(fileType: string) {
    const map: Record<string, { icon: string; color: string; bg: string }> = {
      PDF:   { icon: 'fa-solid fa-file-pdf',   color: 'text-red-600',    bg: 'bg-red-100'    },
      WORD:  { icon: 'fa-solid fa-file-word',  color: 'text-blue-600',   bg: 'bg-blue-100'   },
      IMAGE: { icon: 'fa-solid fa-file-image', color: 'text-purple-600', bg: 'bg-purple-100' },
      OTHER: { icon: 'fa-solid fa-file',       color: 'text-gray-600',   bg: 'bg-gray-100'   },
    };
    return map[fileType] ?? { icon: 'fa-solid fa-file', color: 'text-gray-600', bg: 'bg-gray-100' };
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatAmount(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  }

  // ── Export PDF ────────────────────────────────────────
  exportPdf() {
    const c = this.client();
    if (!c) return;
    const cases    = this.roleFilteredCases();
    const invoices = this.backendInvoices();
    const stats    = this.dynamicStats();

    const activeCases  = cases.filter(x => !['CLOSED','SETTLED'].includes(x.status)).length;
    const closedCases  = cases.filter(x =>  ['CLOSED','SETTLED'].includes(x.status)).length;
    const totalBilled  = invoices.filter(i => i.status !== 'CANCELLED').reduce((s,i) => s + (i.total_amount ?? 0), 0);
    const paidCount    = invoices.filter(i => i.status === 'PAID').length;
    const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;
    const cur          = invoices[0]?.currency ?? 'USD';
    const successRate  = cases.length > 0 ? Math.round(closedCases / cases.length * 100) : 0;

    const statusColor  = (s: string) => s === 'Active' ? '#065f46' : s === 'Pending' ? '#92400e' : '#991b1b';
    const statusBg     = (s: string) => s === 'Active' ? '#d1fae5' : s === 'Pending' ? '#fef3c7' : '#fee2e2';

    const priorityColor = (p: string) => p === 'URGENT' ? '#991b1b' : p === 'HIGH' ? '#9a3412' : p === 'MEDIUM' ? '#92400e' : '#374151';
    const priorityBg    = (p: string) => p === 'URGENT' ? '#fee2e2' : p === 'HIGH' ? '#ffedd5' : p === 'MEDIUM' ? '#fef3c7' : '#f3f4f6';

    const invStatusColor = (s: string) => s === 'PAID' ? '#065f46' : s === 'OVERDUE' ? '#991b1b' : s === 'PENDING' ? '#92400e' : '#374151';
    const invStatusBg    = (s: string) => s === 'PAID' ? '#d1fae5' : s === 'OVERDUE' ? '#fee2e2' : s === 'PENDING' ? '#fef3c7' : '#f3f4f6';

    const badge = (text: string, bg: string, color: string) =>
      `<span style="display:inline-block;padding:2px 9px;border-radius:9999px;font-size:10px;font-weight:700;background:${bg};color:${color}">${text}</span>`;

    const contactFields = [
      { label: 'Email',       value: c.email       || '—' },
      { label: 'Phone',       value: c.phone        || '—' },
      { label: 'WhatsApp',    value: c.whatsappNumber || '—' },
      { label: 'Address',     value: c.address      || '—' },
      { label: 'Company',     value: c.company      || '—' },
      { label: 'Occupation',  value: c.occupation   || '—' },
      { label: 'Nationality', value: c.nationality  || '—' },
      { label: 'Date of Birth', value: c.dateOfBirth ? this.formatDate(c.dateOfBirth) : '—' },
      { label: 'Gender',      value: c.gender       || '—' },
      { label: 'ID / Passport', value: c.nationalId || '—' },
    ];

    const contactGrid = contactFields.map(f => `
      <div style="background:#f9fafb;border-radius:8px;padding:10px 14px">
        <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${f.label}</div>
        <div style="font-size:12px;color:#111827;font-weight:500">${f.value}</div>
      </div>`).join('');

    const rowCases = cases.length
      ? cases.map(cas => `<tr>
          <td>
            <div style="font-weight:600;color:#111827">${cas.title || cas.case_number || '—'}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:2px">#${cas.case_number || ''}</div>
          </td>
          <td>${this.getCaseTypeInfo(cas.case_type || '').label}</td>
          <td>${badge(this.getCaseStatusInfo(cas.status || '').label, statusBg(this.getCaseStatusInfo(cas.status || '').label), statusColor(this.getCaseStatusInfo(cas.status || '').label))}</td>
          <td>${badge(cas.priority || 'NORMAL', priorityBg(cas.priority || ''), priorityColor(cas.priority || ''))}</td>
          <td>${cas.court_name || '—'}</td>
          <td>${this.formatDate(cas.created_at)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">No cases found</td></tr>';

    const rowInvoices = invoices.length
      ? invoices.map(inv => `<tr>
          <td style="font-weight:600">${inv.invoice_number || '—'}</td>
          <td style="font-size:11px;color:#6b7280">${this.getInvCaseTitle(inv)}</td>
          <td style="font-weight:700">${this.formatAmount(inv.total_amount, inv.currency)}</td>
          <td>${badge(this.getInvoiceStatusInfo(inv.status || '').label, invStatusBg(inv.status || ''), invStatusColor(inv.status || ''))}</td>
          <td>${this.formatDate(inv.issue_date)}</td>
          <td>${this.formatDate(inv.due_date)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">No invoices found</td></tr>';

    const win = window.open('', '_blank', 'width=960,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Client Report — ${c.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#fff;padding:36px 40px}
  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #f59e0b}
  .logo{font-weight:900;color:#d97706;font-size:20px;letter-spacing:.06em;margin-bottom:8px}
  .client-name{font-size:24px;font-weight:800;color:#111827;margin-bottom:6px}
  .meta-right{text-align:right;font-size:11px;color:#6b7280;line-height:2}
  /* Stats */
  .stats-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
  .stat-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}
  .stat-value{font-size:20px;font-weight:800;color:#111827;margin-bottom:4px}
  .stat-label{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em}
  /* Sections */
  .section{margin-bottom:28px}
  .section-title{font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px;padding-bottom:7px;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;gap:6px}
  /* Contact grid */
  .contact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  /* Table */
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead{background:#f9fafb}
  th{padding:9px 12px;text-align:left;font-size:9px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #e5e7eb}
  td{padding:9px 12px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  /* Footer */
  .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af}
  @media print{@page{margin:1cm 1.2cm}body{padding:0}}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div>
    <div class="logo">⚖ LegalHub</div>
    <div class="client-name">${c.name}</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
      ${badge(c.status, statusBg(c.status), statusColor(c.status))}
      <span style="font-size:12px;color:#6b7280;font-weight:500">${c.type}</span>
    </div>
  </div>
  <div class="meta-right">
    <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
    <div><strong>Client Since:</strong> ${c.since}</div>
    ${c.attorney ? `<div><strong>Attorney:</strong> ${c.attorney}</div>` : ''}
  </div>
</div>

<!-- STATS -->
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value" style="color:#2563eb">${activeCases}</div>
    <div class="stat-label">Active Cases</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:#6b7280">${closedCases}</div>
    <div class="stat-label">Closed Cases</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:#d97706">${this.formatAmount(totalBilled, cur)}</div>
    <div class="stat-label">Total Billed</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:#059669">${paidCount}</div>
    <div class="stat-label">Invoices Paid</div>
  </div>
  <div class="stat-card">
    <div class="stat-value" style="color:${overdueCount > 0 ? '#dc2626' : '#111827'}">${overdueCount}</div>
    <div class="stat-label">Overdue</div>
  </div>
</div>

<!-- CONTACT INFORMATION -->
<div class="section">
  <div class="section-title">Contact Information</div>
  <div class="contact-grid">${contactGrid}</div>
</div>

<!-- CASES -->
<div class="section">
  <div class="section-title">Cases &nbsp;<span style="font-weight:400;color:#d1d5db">${cases.length} total — ${activeCases} active · ${closedCases} closed · ${successRate}% success rate</span></div>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Type</th><th>Status</th><th>Priority</th><th>Court</th><th>Date Opened</th>
      </tr>
    </thead>
    <tbody>${rowCases}</tbody>
  </table>
</div>

<!-- INVOICES -->
<div class="section">
  <div class="section-title">Invoices &nbsp;<span style="font-weight:400;color:#d1d5db">${invoices.length} total — ${paidCount} paid · ${overdueCount} overdue</span></div>
  <table>
    <thead>
      <tr>
        <th>Invoice #</th><th>Case</th><th>Amount</th><th>Status</th><th>Issue Date</th><th>Due Date</th>
      </tr>
    </thead>
    <tbody>${rowInvoices}</tbody>
  </table>
</div>

<!-- FOOTER -->
<div class="footer">
  <span>LegalHub — Confidential Client Report</span>
  <span>${c.name} · Generated ${new Date().toLocaleString()}</span>
</div>

<script>window.onload = function(){ window.print(); }</script>
</body></html>`);
    win.document.close();
  }

  // ── Cases tab ────────────────────────────────────────────────

  casesFilter = signal<'All' | 'Active' | 'Closed' | 'Urgent' | 'High'>('All');

  roleFilteredCases = computed(() => {
    const user    = this.auth.currentUser();
    const isAdmin = user?.role === 'admin';
    const cases   = this.backendCases();
    return isAdmin ? cases : cases.filter((c: any) => c.lawyer_id === user?.id);
  });

  filteredCases = computed(() => {
    const cases = this.roleFilteredCases();
    switch (this.casesFilter()) {
      case 'Active':  return cases.filter((c: any) => !['CLOSED', 'SETTLED'].includes(c.status));
      case 'Closed':  return cases.filter((c: any) =>  ['CLOSED', 'SETTLED'].includes(c.status));
      case 'Urgent':  return cases.filter((c: any) => c.priority === 'URGENT');
      case 'High':    return cases.filter((c: any) => c.priority === 'HIGH');
      default:        return cases;
    }
  });

  casesFilterCounts = computed(() => {
    const cases = this.roleFilteredCases();
    return {
      All:    cases.length,
      Active: cases.filter((c: any) => !['CLOSED', 'SETTLED'].includes(c.status)).length,
      Closed: cases.filter((c: any) =>  ['CLOSED', 'SETTLED'].includes(c.status)).length,
      Urgent: cases.filter((c: any) => c.priority === 'URGENT').length,
      High:   cases.filter((c: any) => c.priority === 'HIGH').length,
    };
  });

  goToCase(id: string) { this.router.navigate(['/cases', id]); }

  // ── Payments tab ──────────────────────────────────────────────

  viewingInvoice = signal<any>(null);
  openViewInvoice(inv: any)  { this.viewingInvoice.set(inv); }
  closeViewInvoice()         { this.viewingInvoice.set(null); }

  getInvCaseTitle(inv: any): string {
    if (inv.case_file?.title || inv.case?.title) return inv.case_file?.title ?? inv.case?.title;
    const found = this.backendCases().find((c: any) => c.id === inv.case_id);
    return found?.title ?? found?.case_number ?? '—';
  }

  getInvCaseNumber(inv: any): string | null {
    const num = inv.case_file?.case_number ?? inv.case?.case_number;
    if (num) return num;
    const found = this.backendCases().find((c: any) => c.id === inv.case_id);
    return found?.case_number ?? null;
  }

  getInvCaseType(inv: any): string | null {
    if (inv.case_file?.case_type || inv.case?.case_type) return inv.case_file?.case_type ?? inv.case?.case_type;
    const found = this.backendCases().find((c: any) => c.id === inv.case_id);
    return found?.case_type ?? null;
  }

  printInvoice(inv: any) {
    const client     = inv.client ?? this.client();
    const clientName = inv.client
      ? `${inv.client.first_name} ${inv.client.last_name}`.trim()
      : (this.client()?.name ?? '—');
    const caseTitle  = this.getInvCaseTitle(inv);
    const caseNum    = this.getInvCaseNumber(inv) ?? '';
    const sym        = inv.currency === 'USD' ? '$' : (inv.currency ?? '') + ' ';
    const fmt        = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const fmtDate    = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const statusLabels: Record<string, string> = { DRAFT: 'Draft', PENDING: 'Pending', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' };

    const itemRows = (inv.invoice_item ?? []).map((it: any) =>
      `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${it.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#374151">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151">${fmt(it.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827">${fmt(it.total)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af">No items</td></tr>';

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${inv.invoice_number}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111827;background:#f3f4f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:780px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}.hdr{background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}.hdr-brand{color:#fff;font-size:22px;font-weight:800}.hdr-brand span{opacity:.8;font-weight:400}.hdr-right{text-align:right}.hdr-num{color:#fff;font-size:20px;font-weight:700}.hdr-badge{display:inline-block;margin-top:5px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,.25);color:#fff}.body{padding:28px 36px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px}.box{background:#f9fafb;border-radius:8px;padding:14px;border:1px solid #e5e7eb}.box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:7px}.box .val{font-size:13px;font-weight:600;color:#111827}.box .sub{font-size:12px;color:#6b7280;margin-top:2px}.sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-bottom:20px}thead tr{background:#fef3c7}thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e}thead th:nth-child(2){text-align:center}thead th:nth-child(3),thead th:nth-child(4){text-align:right}.totals{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;max-width:260px;margin-left:auto}.tr{display:flex;justify-content:space-between;font-size:13px;color:#374151;padding:3px 0}.ttotal{font-size:15px;font-weight:700;color:#d97706;border-top:1px solid #e5e7eb;padding-top:9px;margin-top:5px;display:flex;justify-content:space-between}.notes{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px}.notes h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:5px}.notes p{font-size:13px;color:#374151}@media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}}</style></head><body>
<div class="page"><div class="hdr"><div><div class="hdr-brand">Legal<span>Hub</span></div><div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:3px">Professional Legal Services</div></div><div class="hdr-right"><div class="hdr-num">${inv.invoice_number}</div><div class="hdr-badge">${statusLabels[inv.status] ?? inv.status}</div></div></div>
<div class="body"><div class="grid3"><div class="box"><h3>Client</h3><div class="val">${clientName}</div><div class="sub">${client?.email ?? '—'}</div></div><div class="box"><h3>Case</h3><div class="val">${caseTitle}</div>${caseNum ? `<div class="sub"># ${caseNum}</div>` : ''}</div><div class="box"><h3>Dates</h3><div class="val">Issued: ${fmtDate(inv.issue_date)}</div><div class="sub">Due: ${fmtDate(inv.due_date)}</div></div></div>
<div class="sec">Invoice Items</div><table><thead><tr><th style="width:50%">Description</th><th style="width:12%;text-align:center">Qty</th><th style="width:19%;text-align:right">Unit Price</th><th style="width:19%;text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<div class="totals"><div class="tr"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div><div class="tr"><span>Tax (${inv.tax_rate}%)</span><span>${fmt(inv.tax_amount)}</span></div><div class="ttotal"><span>Total</span><span>${fmt(inv.total_amount)}</span></div></div>
${inv.notes ? `<div class="notes"><h3>Notes</h3><p>${inv.notes}</p></div>` : ''}</div></div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  paymentTabFilter = signal<'All' | 'Paid' | 'Pending' | 'Overdue' | 'Draft' | 'Cancelled'>('All');

  filteredPayments = computed(() => {
    const invs = this.backendInvoices();
    const f    = this.paymentTabFilter();
    if (f === 'All')       return invs;
    if (f === 'Draft')     return invs.filter((i: any) => i.status === 'DRAFT');
    if (f === 'Cancelled') return invs.filter((i: any) => i.status === 'CANCELLED');
    return invs.filter((i: any) => i.status === f.toUpperCase());
  });

  paymentTabCounts = computed(() => {
    const invs = this.backendInvoices();
    return {
      All:       invs.length,
      Paid:      invs.filter((i: any) => i.status === 'PAID').length,
      Pending:   invs.filter((i: any) => i.status === 'PENDING').length,
      Overdue:   invs.filter((i: any) => i.status === 'OVERDUE').length,
      Draft:     invs.filter((i: any) => i.status === 'DRAFT').length,
      Cancelled: invs.filter((i: any) => i.status === 'CANCELLED').length,
    };
  });

  paymentTotalFiltered = computed(() =>
    this.filteredPayments().reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0)
  );

  paymentSummary = computed(() => {
    const invs = this.backendInvoices();
    const cur  = invs[0]?.currency ?? 'USD';
    const total       = invs.filter((i: any) => i.status !== 'CANCELLED').reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0);
    const paid        = invs.filter((i: any) => i.status === 'PAID').reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0);
    const outstanding = invs.filter((i: any) => ['PENDING', 'OVERDUE'].includes(i.status)).reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0);
    const overdueCount = invs.filter((i: any) => i.status === 'OVERDUE').length;
    return {
      total:        this.formatAmount(total, cur),
      paid:         this.formatAmount(paid, cur),
      outstanding:  this.formatAmount(outstanding, cur),
      overdueCount,
    };
  });

  readonly paymentTabs: { key: 'All'|'Paid'|'Pending'|'Overdue'|'Draft'|'Cancelled'; activeCls: string; badgeActiveCls: string }[] = [
    { key: 'All',       activeCls: 'border-amber-500 text-amber-600',  badgeActiveCls: 'bg-amber-100 text-amber-700'  },
    { key: 'Paid',      activeCls: 'border-green-500 text-green-600',  badgeActiveCls: 'bg-green-100 text-green-700'  },
    { key: 'Pending',   activeCls: 'border-amber-500 text-amber-600',  badgeActiveCls: 'bg-amber-100 text-amber-700'  },
    { key: 'Overdue',   activeCls: 'border-red-500 text-red-600',      badgeActiveCls: 'bg-red-100 text-red-700'      },
    { key: 'Draft',     activeCls: 'border-slate-500 text-slate-600',  badgeActiveCls: 'bg-slate-100 text-slate-700'  },
    { key: 'Cancelled', activeCls: 'border-gray-400 text-gray-500',    badgeActiveCls: 'bg-gray-100 text-gray-600'    },
  ];

  // ── Invoice actions ───────────────────────────────────────
  sendingDraftId    = signal<string | null>(null);
  deletingDraftId   = signal<string | null>(null);
  cancellingDraftId = signal<string | null>(null);

  pendingConfirm = signal<{
    title: string; message: string; confirmLabel: string;
    type: 'danger' | 'warning'; onConfirm: () => void;
  } | null>(null);

  confirmPending() { this.pendingConfirm()?.onConfirm(); this.pendingConfirm.set(null); }
  dismissConfirm() { this.pendingConfirm.set(null); }
  sendingReminderId = signal<string | null>(null);

  async sendClientReminder(inv: any): Promise<void> {
    if (this.sendingReminderId()) return;
    this.sendingReminderId.set(inv.id);
    try {
      await this.billingService.sendReminder(inv.id);
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send reminder.');
    } finally {
      this.sendingReminderId.set(null);
    }
  }

  get clientDraftInvoices(): any[] {
    return this.backendInvoices().filter((i: any) => i.status === 'DRAFT');
  }

  async sendClientDraft(inv: any): Promise<void> {
    if (this.sendingDraftId()) return;
    this.sendingDraftId.set(inv.id);
    try {
      await this.billingService.sendInvoice(inv.id);
      this.backendInvoices.update((list: any[]) =>
        list.map((i: any) => i.id === inv.id ? { ...i, status: 'PENDING' } : i)
      );
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send invoice.');
    } finally {
      this.sendingDraftId.set(null);
    }
  }

  deleteClientDraft(inv: any): void {
    this.pendingConfirm.set({
      title: 'Delete Invoice?',
      message: `Invoice ${inv.invoice_number} will be permanently deleted. This action cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'danger',
      onConfirm: () => this._doDeleteClientDraft(inv),
    });
  }

  private async _doDeleteClientDraft(inv: any): Promise<void> {
    this.deletingDraftId.set(inv.id);
    try {
      await this.billingService.deleteInvoice(inv.id);
      this.backendInvoices.update((list: any[]) => list.filter((i: any) => i.id !== inv.id));
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to delete invoice.');
    } finally {
      this.deletingDraftId.set(null);
    }
  }

  cancelClientDraft(inv: any): void {
    this.pendingConfirm.set({
      title: 'Cancel Invoice?',
      message: `Invoice ${inv.invoice_number} will be marked as Cancelled.`,
      confirmLabel: 'Cancel Invoice',
      type: 'warning',
      onConfirm: () => this._doCancelClientDraft(inv),
    });
  }

  private async _doCancelClientDraft(inv: any): Promise<void> {
    this.cancellingDraftId.set(inv.id);
    try {
      await this.billingService.cancelInvoice(inv.id);
      this.backendInvoices.update((list: any[]) => list.map((i: any) =>
        i.id === inv.id ? { ...i, status: 'CANCELLED' } : i
      ));
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to cancel invoice.');
    } finally {
      this.cancellingDraftId.set(null);
    }
  }

  getInvBorderCls(status: string): string {
    const m: Record<string, string> = {
      PAID: 'border-green-400', PENDING: 'border-amber-400',
      OVERDUE: 'border-red-400', DRAFT: 'border-gray-300', CANCELLED: 'border-gray-200',
    };
    return m[status] ?? 'border-transparent';
  }

  getInvDueNote(inv: any): { text: string; cls: string } {
    if (inv.status === 'PAID')      return { text: 'Paid',      cls: 'text-green-600' };
    if (inv.status === 'CANCELLED') return { text: 'Cancelled', cls: 'text-gray-400'  };
    if (!inv.due_date)              return { text: '',          cls: ''               };
    const diff = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0)  return { text: `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`, cls: 'text-red-600'   };
    if (diff === 0) return { text: 'Due today',                                                      cls: 'text-amber-600' };
    return              { text: `Due in ${diff} day${diff > 1 ? 's' : ''}`,                         cls: 'text-gray-500'  };
  }

  // ── Documents tab helpers ─────────────────────────────────────

  setDocFilter(f: 'all' | 'by-case' | 'pending' | 'approved' | 'shared') {
    this.docFilter.set(f);
    if (f !== 'by-case') this.selectedCaseIdDoc.set('');
    this.selectedDocIds.set(new Set());
  }

  toggleDocId(id: string) {
    this.selectedDocIds.update(s => {
      const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  }

  isDocSelected(id: string): boolean { return this.selectedDocIds().has(id); }

  get allDocsSelected(): boolean {
    const f = this.filteredClientDocs();
    return f.length > 0 && f.every((d: any) => this.selectedDocIds().has(d.id));
  }

  toggleAllDocs() {
    const f = this.filteredClientDocs();
    this.selectedDocIds.set(this.allDocsSelected ? new Set() : new Set(f.map((d: any) => d.id)));
  }

  get selectedCaseName(): string {
    return this.docCaseGroups().find(g => g.id === this.selectedCaseIdDoc())?.title ?? '';
  }

  getDocTypeBadge(fileType: string): { bg: string; color: string; label: string } {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      PDF:   { bg: 'bg-red-100',    color: 'text-red-700',    label: 'PDF'   },
      WORD:  { bg: 'bg-blue-100',   color: 'text-blue-700',   label: 'WORD'  },
      EXCEL: { bg: 'bg-green-100',  color: 'text-green-700',  label: 'EXCEL' },
      IMAGE: { bg: 'bg-purple-100', color: 'text-purple-700', label: 'IMAGE' },
    };
    return map[fileType?.toUpperCase()] ?? { bg: 'bg-gray-100', color: 'text-gray-700', label: fileType || '—' };
  }

  getDocStatusCls(status: string): string {
    if (status === 'APPROVED') return 'bg-green-100 text-green-700';
    if (status === 'REJECTED') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  }

  getDocStatusIcon(status: string): string {
    if (status === 'APPROVED') return 'fa-solid fa-circle-check';
    if (status === 'REJECTED') return 'fa-solid fa-circle-xmark';
    return 'fa-solid fa-clock';
  }

  getDocStatusLabel(status: string): string {
    if (status === 'APPROVED') return 'Approved';
    if (status === 'REJECTED') return 'Rejected';
    return 'Pending Review';
  }

  getDocStatusBadge(status: string): { label: string; bg: string; color: string } {
    if (status === 'APPROVED') return { label: 'Approved',       bg: 'bg-green-100', color: 'text-green-700' };
    if (status === 'REJECTED') return { label: 'Rejected',       bg: 'bg-red-100',   color: 'text-red-700'   };
    return                            { label: 'Pending Review', bg: 'bg-amber-100', color: 'text-amber-700' };
  }

  isClientDoc(d: any): boolean {
    return d.category === 'CLIENT_DOC';
  }

  isSharedWithClient(d: any): boolean {
    return d.is_shared_with_client ?? false;
  }

  isCurrentUserUploader(d: any): boolean {
    return d.uploaded_by === (this.auth.currentUser()?.id ?? '');
  }

  // ── Documents — View & Download (identical to documents page) ─────────────

  downloadingDocId    = signal<string | null>(null);
  confirmDownloadData = signal<any | null>(null);

  viewDoc(d: any): void {
    const url = d.storage_url;
    if (!url) return;
    const t = (d.file_type || '').toUpperCase();
    if (t === 'WORD') {
      window.open(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`, '_blank');
    } else {
      window.open(url, '_blank');
    }
  }

  confirmDownload(d: any): void { this.confirmDownloadData.set(d); }
  cancelDownload(): void        { this.confirmDownloadData.set(null); }

  async downloadDoc(d: any): Promise<void> {
    this.confirmDownloadData.set(null);
    this.downloadingDocId.set(d.id);
    try { await this.docService.downloadFile({ name: d.file_name, url: d.storage_url }); } catch {}
    setTimeout(() => this.downloadingDocId.set(null), 1800);
  }

  aiSummarizeDoc(d: any): void {
    this.aiSummaryModal.open(d.id, d.file_name ?? 'Document');
  }

  getRelativeTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    return this.formatDate(dateStr);
  }

  // ── Static data (Communication, Notes, Activity Log, sidebar) ─

  documents = [
    { iconBg:'bg-red-100',    icon:'fa-solid fa-file-pdf',   iconColor:'text-red-600',    name:'Employment_Contract_Amendment.pdf', case:'Johnson vs. State Corp',  size:'2.4 MB',  when:'2 hours ago' },
    { iconBg:'bg-blue-100',   icon:'fa-solid fa-file-word',  iconColor:'text-blue-600',   name:'Trust_Agreement_Draft_v3.docx',     case:'Estate Planning',         size:'1.8 MB',  when:'5 hours ago' },
    { iconBg:'bg-green-100',  icon:'fa-solid fa-file-excel', iconColor:'text-green-600',  name:'Property_Financial_Analysis.xlsx',  case:'Real Estate Transaction', size:'3.2 MB',  when:'Yesterday' },
    { iconBg:'bg-purple-100', icon:'fa-solid fa-file-image', iconColor:'text-purple-600', name:'Evidence_Photos_Workplace.zip',     case:'Johnson vs. State Corp',  size:'15.7 MB', when:'2 days ago' },
    { iconBg:'bg-red-100',    icon:'fa-solid fa-file-pdf',   iconColor:'text-red-600',    name:'Purchase_Agreement_Commercial.pdf', case:'Real Estate Transaction', size:'4.1 MB',  when:'3 days ago' },
  ];

  communications = [
    { iconBg:'bg-blue-100',   icon:'fa-solid fa-envelope', iconColor:'text-blue-600',   title:'Email Sent: Case Update',                 by:'Sent by Sarah Williams',                             when:'2 hours ago', body:'Updated client on discovery progress. Discussed upcoming hearing preparation and witness list.',    tag:'Email',      tagBg:'bg-blue-100 text-blue-700',    case:'Johnson vs. State Corp'   },
    { iconBg:'bg-green-100',  icon:'fa-solid fa-phone',    iconColor:'text-green-600',  title:'Phone Call: Trust Agreement Discussion',  by:'Call with Michael Chen - Duration: 45 minutes',     when:'Yesterday',   body:'Discussed beneficiary designations and trust provisions. Client requested modifications.',          tag:'Phone Call', tagBg:'bg-green-100 text-green-700',  case:'Estate Planning'          },
    { iconBg:'bg-purple-100', icon:'fa-solid fa-users',    iconColor:'text-purple-600', title:'In-Person Meeting: Property Acquisition', by:'Meeting with Michael Chen - Office Conference Room', when:'2 days ago',  body:'Reviewed purchase agreement for commercial property. Client approved terms.',                       tag:'In-Person',  tagBg:'bg-purple-100 text-purple-700',case:'Real Estate Transaction'  },
    { iconBg:'bg-amber-100',  icon:'fa-solid fa-file-alt', iconColor:'text-amber-600',  title:'Document Received: Evidence Submission',  by:'Received from client via email',                     when:'3 days ago',  body:'Client submitted additional workplace documentation and witness contact information.',              tag:'Document',   tagBg:'bg-amber-100 text-amber-700',  case:'Johnson vs. State Corp'   },
  ];

  notes = [
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg', author:'Sarah Williams', when:'3 hours ago', body:'Client is very detail-oriented and prefers frequent updates. Responds quickly to emails.', tagBg:'bg-blue-100 text-blue-700',    tag:'Client Management'     },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', author:'Michael Chen',   when:'Yesterday',   body:'Client has complex estate planning needs with multiple business interests.',                tagBg:'bg-green-100 text-green-700',  tag:'Estate Planning'       },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', author:'Michael Chen',   when:'2 days ago',  body:'Client is considering additional commercial property investments.',                         tagBg:'bg-purple-100 text-purple-700',tag:'Business Development'  },
  ];

  timeline = [
    { bg:'bg-blue-500',   icon:'fa-solid fa-file-upload',   title:'Documents Uploaded',    desc:'Sarah Williams uploaded 3 files',                  when:'2 hours ago', tagBg:'bg-blue-100 text-blue-700',    tag:'Documents' },
    { bg:'bg-green-500',  icon:'fa-solid fa-check',         title:'Payment Received',       desc:'Invoice INV-2867 paid - $8,500.00',                when:'Yesterday',   tagBg:'bg-green-100 text-green-700',  tag:'Payment'   },
    { bg:'bg-purple-500', icon:'fa-solid fa-users',         title:'Meeting Completed',      desc:'In-person meeting with Michael Chen',              when:'2 days ago',  tagBg:'bg-purple-100 text-purple-700',tag:'Meeting'   },
    { bg:'bg-amber-500',  icon:'fa-solid fa-calendar-plus', title:'Hearing Scheduled',      desc:'Court hearing scheduled for November 16, 2024',    when:'3 days ago',  tagBg:'bg-amber-100 text-amber-700',  tag:'Calendar'  },
    { bg:'bg-red-500',    icon:'fa-solid fa-briefcase',     title:'Case Created',           desc:'New case opened: Real Estate Transaction',         when:'1 week ago',  tagBg:'bg-red-100 text-red-700',      tag:'Case'      },
    { bg:'bg-indigo-500', icon:'fa-solid fa-user-plus',     title:'Client Profile Created', desc:'Client added as new client',                       when:'',            tagBg:'bg-indigo-100 text-indigo-700',tag:'Client'    },
  ];

  team = [
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg', border:'border-blue-500',   name:'Sarah Williams',   role:'Lead Attorney'          },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', border:'border-green-500',  name:'Michael Chen',     role:'Estate Attorney'        },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', border:'border-purple-500', name:'Michael Chen',     role:'Real Estate Attorney'   },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg', border:'border-gray-300',   name:'Jessica Martinez', role:'Paralegal'              },
  ];

  events = [
    { monthBg:'bg-red-100',   monthColor:'text-red-600',   dayColor:'text-red-700',   month:'Nov', day:'16', title:'Court Hearing',  sub:'Johnson vs. State Corp', time:'10:00 AM - Courtroom 4B'  },
    { monthBg:'bg-amber-100', monthColor:'text-amber-600', dayColor:'text-amber-700', month:'Nov', day:'18', title:'Client Meeting', sub:'Estate Planning Review', time:'2:00 PM - Office'         },
    { monthBg:'bg-blue-100',  monthColor:'text-blue-600',  dayColor:'text-blue-700',  month:'Nov', day:'25', title:'Document Review',sub:'Trust Agreement Final',   time:'11:00 AM - Video Call'    },
  ];

  // ── Avatar upload ─────────────────────────────────────────

  isUploadingAvatar  = signal(false);
  avatarPreview      = signal<string | null>(null);
  showAvatarLightbox = signal(false);

  triggerAvatarInput(input: HTMLInputElement) { input.click(); }
  openAvatarLightbox()  { this.showAvatarLightbox.set(true); }
  removeClientAvatar()  { /* backend not supported yet — placeholder */ }

  async onAvatarSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    // Client avatar upload is not supported by the backend — preview only
    this.avatarPreview.set(null);
    (event.target as HTMLInputElement).value = '';
  }

  // ── Edit Modal ────────────────────────────────────────────
  showEditModal = signal(false);
  editStep      = signal<1|2|3>(1);
  isSaving      = signal(false);

  readonly countryCodes = [
    { code: '+216', flag: '🇹🇳', name: 'Tunisie' },
    { code: '+213', flag: '🇩🇿', name: 'Algérie' },
    { code: '+212', flag: '🇲🇦', name: 'Maroc' },
    { code: '+20',  flag: '🇪🇬', name: 'Égypte' },
    { code: '+218', flag: '🇱🇾', name: 'Libye' },
    { code: '+33',  flag: '🇫🇷', name: 'France' },
    { code: '+1',   flag: '🇺🇸', name: 'USA/Canada' },
    { code: '+44',  flag: '🇬🇧', name: 'UK' },
    { code: '+49',  flag: '🇩🇪', name: 'Allemagne' },
    { code: '+39',  flag: '🇮🇹', name: 'Italie' },
    { code: '+34',  flag: '🇪🇸', name: 'Espagne' },
    { code: '+966', flag: '🇸🇦', name: 'Arabie Saoudite' },
    { code: '+971', flag: '🇦🇪', name: 'Émirats Arabes' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: '+91',  flag: '🇮🇳', name: 'Inde' },
  ];

  readonly editClientTypes = ['Individual', 'Company', 'NGO', 'Government'];

  eF1 = signal({ firstName:'', lastName:'', dob:'', gender:'', idNumber:'', nationality:'', occupation:'', clientType:'Individual' });
  eF2 = signal({ phoneCode:'+216', phone:'', waCode:'+216', whatsapp:'', email:'', contactPref:'' });
  eF3 = signal({ address:'', city:'', state:'', notes:'' });

  get editStep1Valid() { return this.eF1().firstName.trim().length > 0; }
  get editProgressPct() { return ((this.editStep() - 1) / 2) * 100; }

  get editStepLabels() {
    const s = this.editStep();
    return [
      { label: 'Personal Info', active: s === 1, done: s > 1 },
      { label: 'Contact Info',  active: s === 2, done: s > 2 },
      { label: 'Additional',    active: s === 3, done: s > 3 },
    ];
  }

  private _splitPhone(full: string): { code: string; number: string } {
    const match = (full ?? '').match(/^(\+\d{1,4})\s*(.*)/);
    if (match) {
      const known = this.countryCodes.find(c => c.code === match[1]);
      if (known) return { code: match[1], number: match[2] };
    }
    return { code: '+216', number: full ?? '' };
  }

  initEditForm() {
    const c = this.client();
    if (!c) return;
    const parts = c.name.trim().split(' ');
    const { code: phoneCode, number: phone } = this._splitPhone(c.phone);
    const { code: waCode,    number: whatsapp } = this._splitPhone(c.whatsappNumber ?? '');
    this.eF1.set({
      firstName:  parts[0] || '',
      lastName:   parts.slice(1).join(' ') || '',
      dob:        c.dateOfBirth ?? '',
      gender:     c.gender ? c.gender.charAt(0).toUpperCase() + c.gender.slice(1).toLowerCase() : '',
      idNumber:   c.nationalId ?? '',
      nationality: c.nationality ?? '',
      occupation: c.occupation ?? '',
      clientType: c.clientType === 'CORPORATE' ? 'Company' : 'Individual',
    });
    this.eF2.set({ phoneCode, phone, waCode, whatsapp, email: c.email, contactPref: '' });
    this.eF3.set({ address: c.address ?? '', city: '', state: '', notes: c.notes ?? '' });
  }

  openEditModal() {
    this.initEditForm();
    this.editStep.set(1);
    this.showEditModal.set(true);
  }

  closeEditModal() { this.showEditModal.set(false); }

  editNext() {
    const s = this.editStep();
    if (s < 3) this.editStep.set((s + 1) as 1|2|3);
    else this.saveClient();
  }

  editPrev() {
    const s = this.editStep();
    if (s > 1) this.editStep.set((s - 1) as 1|2|3);
  }

  async saveClient() {
    const c = this.client();
    if (!c) return;
    this.isSaving.set(true);

    const f1 = this.eF1(); const f2 = this.eF2(); const f3 = this.eF3();

    const payload: Record<string, unknown> = {
      first_name: f1.firstName.trim(),
      last_name:  f1.lastName.trim(),
      email:      f2.email.trim(),
      client_type: f1.clientType.toUpperCase() === 'COMPANY' ? 'CORPORATE' : 'INDIVIDUAL',
    };
    if (f2.phone)       payload['phone']            = `${f2.phoneCode} ${f2.phone}`.trim();
    if (f2.whatsapp)    payload['whatsapp_number']   = `${f2.waCode} ${f2.whatsapp}`.trim();
    if (f1.dob)         payload['date_of_birth']    = f1.dob;
    if (f1.gender)      payload['gender']            = f1.gender.toUpperCase();
    if (f1.idNumber)    payload['national_id']       = f1.idNumber;
    if (f1.nationality) payload['nationality']       = f1.nationality;
    if (f1.occupation)  payload['occupation']        = f1.occupation;
    if (f3.notes)       payload['notes']             = f3.notes;
    const addr = [f3.address, f3.city, f3.state].filter(Boolean).join(', ');
    if (addr)           payload['address']           = addr;

    try {
      const updated = await this.clientService.updateClient(c.id, payload);
      this.client.set(updated);
      this.closeEditModal();
    } catch {
      // Error handling can be added here
    } finally {
      this.isSaving.set(false);
    }
  }
}
