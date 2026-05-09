import { Component, signal, computed, AfterViewInit, OnInit, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService, InvoiceRaw } from '../../../services/billing.service';
import { ClientService } from '../../../services/client.service';
import { CaseService } from '../../../services/case.service';

declare var Plotly: any;

interface InvoiceUI {
  id: string;
  number: string; client: string; email: string;
  case: string; caseType: string; billingType: string;
  amount: string; issueDate: string; dueDate: string;
  rawIssueDate: string;
  dueNote: string; dueNoteColor: string;
  status: string; statusBg: string; statusColor: string;
  showRemind: boolean; canSend: boolean;
}
interface FormItem { description: string; qty: number | null; rate: number | null; }

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './billing.html',
})
export class Billing implements OnInit, AfterViewInit {

  private billingService = inject(BillingService);
  private clientService  = inject(ClientService);
  private caseService    = inject(CaseService);

  // ── Init ──────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.billingService.loadInvoices(),
      this.billingService.loadAnalytics(),
      this.billingService.loadMonthlyRevenue(),
      this.clientService.loadClients(),
      this.caseService.loadCases(),
    ]);
  }

  // ── Exposed service state ─────────────────────────────────
  get loading()  { return this.billingService.loading; }
  get apiError() { return this.billingService.error; }
  get clients()  { return this.clientService.clients; }
  get cases()    { return this.caseService.cases; }

  // ══════════════════════════════════════════════════════════
  // MODAL — CREATE INVOICE
  // ══════════════════════════════════════════════════════════
  showModal       = signal(false);
  modalStep       = signal<1|2>(1);
  isSubmitting    = signal(false);
  savingDraft     = signal(false);
  formError       = signal<string | null>(null);
  lastCreated     = signal<InvoiceRaw | null>(null);

  openModal()  { this.resetForm(); this.modalStep.set(1); this.showModal.set(true); }
  closeModal() { this.showModal.set(false); }

  resetForm() {
    const today = new Date();
    const due   = new Date(today); due.setDate(due.getDate() + 30);
    this.selectedClientId.set('');
    this.selectedClientName.set('');
    this.selectedCaseId.set('');
    this.selectedBillingType.set('Hourly Rate');
    this.invoiceDate.set(today.toISOString().substring(0, 10));
    this.dueDate.set(due.toISOString().substring(0, 10));
    this.notes.set('');
    this.sendEmail.set(false);
    this.markSent.set(false);
    this.formError.set(null);
    this.lastCreated.set(null);
    this.invoiceItems.set([
      { description: '', qty: null, rate: null },
      { description: '', qty: null, rate: null },
    ]);
  }

  private _buildPayload() {
    return {
      client_id:    this.selectedClientId(),
      case_id:      this.selectedCaseId() || undefined,
      billing_type: this.billingTypeToEnum[this.selectedBillingType()] ?? 'HOURLY',
      items: this.invoiceItems()
        .filter(i => i.description.trim() && i.qty && i.rate)
        .map(i => ({ description: i.description, quantity: i.qty!, unit_price: i.rate! })),
      tax_rate:  8,
      due_date:  this.dueDate(),
      currency:  'USD',
      notes:     this.notes() || undefined,
    };
  }

  async saveAsDraft() {
    this.formError.set(null);
    const payload = this._buildPayload();
    if (!payload.items.length) { this.formError.set('Add at least one item.'); return; }
    this.savingDraft.set(true);
    try {
      const inv = await this.billingService.createInvoice(payload);
      this.lastCreated.set(inv);
      this.modalStep.set(2);
      await Promise.all([this.billingService.loadAnalytics(), this.billingService.loadMonthlyRevenue()]);
    } catch (e: any) {
      this.formError.set(e?.error?.detail ?? 'Failed to save draft.');
    } finally {
      this.savingDraft.set(false);
    }
  }

  async submitInvoice() {
    this.formError.set(null);
    const payload = this._buildPayload();
    if (!payload.items.length) { this.formError.set('Add at least one item.'); return; }
    this.isSubmitting.set(true);
    try {
      const inv = await this.billingService.createInvoice(payload);
      this.lastCreated.set(inv);
      await this.billingService.sendInvoice(inv.id).catch(() => {});
      this.modalStep.set(2);
      await Promise.all([this.billingService.loadAnalytics(), this.billingService.loadMonthlyRevenue()]);
    } catch (e: any) {
      this.formError.set(e?.error?.detail ?? 'Failed to create invoice.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── Form signals ──────────────────────────────────────────
  selectedClientId    = signal('');
  selectedClientName  = signal('');
  selectedCaseId      = signal('');
  selectedBillingType = signal('Hourly Rate');
  invoiceDate         = signal('');
  dueDate             = signal('');
  notes               = signal('');
  sendEmail           = signal(false);
  markSent            = signal(false);
  invoiceItems        = signal<FormItem[]>([
    { description: '', qty: null, rate: null },
    { description: '', qty: null, rate: null },
  ]);

  billingTypes = ['Hourly Rate', 'Flat Fee', 'Contingency', 'Retainer'];

  private readonly billingTypeToEnum: Record<string, string> = {
    'Hourly Rate': 'HOURLY',
    'Flat Fee':    'FLAT_FEE',
    'Contingency': 'CONTINGENCY',
    'Retainer':    'RETAINER',
  };

  private readonly billingTypeDisplay: Record<string, string> = {
    'HOURLY':      'Hourly Rate',
    'FLAT_FEE':    'Flat Fee',
    'CONTINGENCY': 'Contingency',
    'RETAINER':    'Retainer',
  };

  onClientChange(id: string) {
    this.selectedClientId.set(id);
    const c = this.clientService.clients().find(cl => cl.id === id);
    this.selectedClientName.set(c?.name ?? '');
  }

  getBillingTypeCls(type: string): string {
    const map: Record<string, string> = {
      'Hourly Rate': 'bg-blue-100 text-blue-700',
      'Flat Fee':    'bg-purple-100 text-purple-700',
      'Contingency': 'bg-amber-100 text-amber-700',
      'Retainer':    'bg-green-100 text-green-700',
    };
    return map[type] ?? 'bg-gray-100 text-gray-600';
  }

  getItemAmount(item: FormItem): string {
    return item.qty && item.rate ? '$' + (item.qty * item.rate).toFixed(2) : '$0.00';
  }
  getSubtotal(): number { return this.invoiceItems().reduce((s,i) => s + (i.qty && i.rate ? i.qty * i.rate : 0), 0); }
  getTax(): number      { return this.getSubtotal() * 0.08; }
  getTotal(): string    { return '$' + (this.getSubtotal() + this.getTax()).toFixed(2); }
  addItem(): void       { this.invoiceItems.update(items => [...items, {description:'',qty:null,rate:null}]); }
  removeItem(i: number): void { this.invoiceItems.update(items => items.filter((_,idx) => idx !== i)); }
  get isFormValid() { return this.selectedClientId().trim().length > 0; }

  // ══════════════════════════════════════════════════════════
  // INVOICE DETAIL MODAL
  // ══════════════════════════════════════════════════════════
  showDetailModal   = signal(false);
  selectedInvoiceId = signal<string | null>(null);

  get detailInvoice(): InvoiceRaw | null {
    const id = this.selectedInvoiceId();
    return id ? (this.billingService.invoices().find(i => i.id === id) ?? null) : null;
  }

  viewInvoice(id: string) { this.selectedInvoiceId.set(id); this.showDetailModal.set(true); }
  closeDetailModal()      { this.showDetailModal.set(false); }

  onDownload(id: string) {
    const inv = this.billingService.invoices().find(i => i.id === id);
    if (inv) this.printInvoice(inv);
  }

  getDetailTotal(inv: InvoiceRaw): string {
    return (inv.currency === 'USD' ? '$' : inv.currency + ' ') +
      inv.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  printInvoice(inv: InvoiceRaw) {
    const client = inv.client;
    const name   = client ? `${client.first_name} ${client.last_name}`.trim() : '—';
    const rows   = (inv.invoice_item ?? []).map(it =>
      `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${it.description}</td>
       <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${it.quantity}</td>
       <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">$${it.unit_price.toFixed(2)}</td>
       <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">$${it.total.toFixed(2)}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><title>${inv.invoice_number}</title>
      <style>body{font-family:sans-serif;padding:40px;color:#111}table{width:100%;border-collapse:collapse}</style>
      </head><body>
      <h2 style="color:#d97706">${inv.invoice_number}</h2>
      <p><strong>Client:</strong> ${name} &nbsp;|&nbsp; <strong>Email:</strong> ${client?.email ?? '—'}</p>
      <p><strong>Issue Date:</strong> ${inv.issue_date} &nbsp;|&nbsp; <strong>Due Date:</strong> ${inv.due_date}</p>
      <table><thead style="background:#f9fafb"><tr>
        <th style="padding:8px;text-align:left">Description</th>
        <th style="padding:8px;text-align:center">Qty</th>
        <th style="padding:8px;text-align:right">Unit Price</th>
        <th style="padding:8px;text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <hr style="margin:16px 0">
      <p style="text-align:right"><strong>Subtotal:</strong> $${inv.subtotal.toFixed(2)}</p>
      <p style="text-align:right"><strong>Tax (${inv.tax_rate}%):</strong> $${inv.tax_amount.toFixed(2)}</p>
      <p style="text-align:right;font-size:1.2em"><strong>Total: ${this.getDetailTotal(inv)}</strong></p>
      ${inv.notes ? `<p><strong>Notes:</strong> ${inv.notes}</p>` : ''}
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  // ══════════════════════════════════════════════════════════
  // PAYMENTS MODAL
  // ══════════════════════════════════════════════════════════
  showPaymentsModal = signal(false);

  get paidInvoices(): InvoiceUI[] {
    return this._mappedInvoices().filter(i => i.status === 'Paid');
  }

  // ══════════════════════════════════════════════════════════
  // REMINDERS CONFIG MODAL
  // ══════════════════════════════════════════════════════════
  showRemindersModal = signal(false);

  reminderSettings = signal([
    { label:'First Reminder',   desc:'3 days before due date', days: -3,  enabled: true  },
    { label:'Second Reminder',  desc:'On due date',             days:  0,  enabled: true  },
    { label:'Overdue Reminder', desc:'3 days after due date',  days:  3,  enabled: true  },
    { label:'Final Notice',     desc:'7 days after due date',  days:  7,  enabled: true  },
  ]);

  channels = signal([
    { icon:'fa-solid fa-envelope',    iconBg:'bg-blue-100',   iconColor:'text-blue-600',   label:'Email Reminders', desc:'Send via email',     checked:true  },
    { icon:'fa-brands fa-whatsapp',   iconBg:'bg-green-100',  iconColor:'text-green-600',  label:'WhatsApp',        desc:'Send via WhatsApp',  checked:false },
    { icon:'fa-solid fa-comment-sms', iconBg:'bg-purple-100', iconColor:'text-purple-600', label:'SMS Alerts',      desc:'Send text messages', checked:false },
    { icon:'fa-solid fa-bell',        iconBg:'bg-amber-100',  iconColor:'text-amber-600',  label:'In-App Alerts',   desc:'Dashboard alerts',   checked:true  },
  ]);

  toggleChannel(idx: number) {
    this.channels.update(list => list.map((c, i) => i === idx ? {...c, checked: !c.checked} : c));
  }

  toggleReminder(idx: number) {
    this.reminderSettings.update(list => list.map((r, i) => i === idx ? {...r, enabled: !r.enabled} : r));
  }

  // ══════════════════════════════════════════════════════════
  // SEARCH, FILTER, SORT
  // ══════════════════════════════════════════════════════════
  searchQuery     = signal('');
  showFilterPanel = signal(false);
  filterDateFrom  = signal('');
  filterDateTo    = signal('');
  sortField       = signal<string>('');
  sortDir         = signal<'asc'|'desc'>('asc');

  setSort(field: string) {
    if (this.sortField() === field) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
  }

  clearFilters() {
    this.searchQuery.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeTab.set('All');
    this.sortField.set('');
    this.showFilterPanel.set(false);
  }

  hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' ||
    this.filterDateFrom() !== '' ||
    this.filterDateTo() !== '' ||
    this.activeTab() !== 'All'
  );

  // ══════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════
  showExportMenu = signal(false);

  exportCsv() {
    const rows = this.filteredInvoices();
    const headers = ['Invoice #','Client','Email','Amount','Issue Date','Due Date','Status'];
    const csv = [headers, ...rows.map(inv => [
      inv.number, inv.client, inv.email, inv.amount, inv.issueDate, inv.dueDate, inv.status
    ])].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
    URL.revokeObjectURL(url);
    this.showExportMenu.set(false);
  }

  exportPdf() {
    this.showExportMenu.set(false);
    setTimeout(() => window.print(), 100);
  }

  // ══════════════════════════════════════════════════════════
  // PER-ROW SEND / REMIND ACTIONS
  // ══════════════════════════════════════════════════════════
  sendingInvoiceId  = signal<string | null>(null);
  sendingReminderId = signal<string | null>(null);

  async onSendInvoice(invoiceId: string) {
    this.sendingInvoiceId.set(invoiceId);
    try {
      await this.billingService.sendInvoice(invoiceId);
      await this.billingService.loadAnalytics();
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send invoice.');
    } finally {
      this.sendingInvoiceId.set(null);
    }
  }

  async onSendReminder(invoiceId: string) {
    this.sendingReminderId.set(invoiceId);
    try {
      await this.billingService.sendReminder(invoiceId);
      alert('Payment reminder sent successfully.');
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send reminder.');
    } finally {
      this.sendingReminderId.set(null);
    }
  }

  // ══════════════════════════════════════════════════════════
  // INVOICE MAPPING & COMPUTED LIST
  // ══════════════════════════════════════════════════════════
  statusMap: Record<string, { display: string; bg: string; color: string }> = {
    DRAFT:     { display: 'Draft',     bg: 'bg-slate-100', color: 'text-slate-600' },
    PENDING:   { display: 'Pending',   bg: 'bg-blue-100',  color: 'text-blue-700'  },
    PAID:      { display: 'Paid',      bg: 'bg-green-100', color: 'text-green-700' },
    OVERDUE:   { display: 'Overdue',   bg: 'bg-red-100',   color: 'text-red-700'   },
    CANCELLED: { display: 'Cancelled', bg: 'bg-gray-100',  color: 'text-gray-600'  },
  };

  private _mapInvoice(inv: InvoiceRaw): InvoiceUI {
    const client     = inv.client;
    const clientName = client ? `${client.first_name} ${client.last_name}`.trim() : '—';
    const statusInfo = this.statusMap[inv.status] ?? { display: inv.status, bg: 'bg-gray-100', color: 'text-gray-600' };

    const due   = new Date(inv.due_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff  = Math.round((due.getTime() - today.getTime()) / 86400000);
    let dueNote = '', dueNoteColor = 'text-gray-500';
    if (inv.status === 'PAID')   { dueNote = 'Paid'; dueNoteColor = 'text-green-600'; }
    else if (diff < 0)           { dueNote = `${Math.abs(diff)} day${Math.abs(diff)>1?'s':''} overdue`; dueNoteColor = 'text-red-600'; }
    else if (diff === 0)         { dueNote = 'Due today'; dueNoteColor = 'text-amber-600'; }
    else                         { dueNote = `Due in ${diff} day${diff>1?'s':''}`; }

    const fmt  = (d: string) => new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const sym  = inv.currency === 'USD' ? '$' : inv.currency + ' ';
    const amount = sym + inv.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 });

    const linkedCase   = inv.case_id ? this.caseService.getCaseById(inv.case_id) : undefined;
    const rawBilling   = inv.billing_type || '';
    const billingType  = this.billingTypeDisplay[rawBilling] ?? (rawBilling ? rawBilling : 'Hourly Rate');
    const caseTitle    = linkedCase?.title ?? '—';
    const caseTypeFmt  = (linkedCase?.type ?? '').replace(/_/g, ' ');

    return {
      id: inv.id, number: inv.invoice_number,
      client: clientName, email: client?.email ?? '—',
      case: caseTitle, caseType: caseTypeFmt, billingType,
      amount, issueDate: fmt(inv.issue_date), dueDate: fmt(inv.due_date),
      rawIssueDate: inv.issue_date,
      dueNote, dueNoteColor,
      status: statusInfo.display, statusBg: statusInfo.bg, statusColor: statusInfo.color,
      showRemind: inv.status === 'PENDING' || inv.status === 'OVERDUE',
      canSend:    inv.status === 'DRAFT',
    };
  }

  private _mappedInvoices = computed(() =>
    this.billingService.invoices().map(inv => this._mapInvoice(inv))
  );

  get allInvoices(): InvoiceUI[] { return this._mappedInvoices(); }

  filteredInvoices = computed(() => {
    const tab   = this.activeTab();
    const query = this.searchQuery().toLowerCase().trim();
    const from  = this.filterDateFrom();
    const to    = this.filterDateTo();
    const sf    = this.sortField();
    const sd    = this.sortDir();

    let list = this._mappedInvoices();

    if (tab !== 'All') list = list.filter(inv => inv.status === tab);

    if (query) list = list.filter(inv =>
      inv.number.toLowerCase().includes(query) ||
      inv.client.toLowerCase().includes(query) ||
      inv.email.toLowerCase().includes(query) ||
      inv.amount.toLowerCase().includes(query)
    );

    if (from) list = list.filter(inv => inv.rawIssueDate >= from);
    if (to)   list = list.filter(inv => inv.rawIssueDate <= to);

    if (sf) {
      list = [...list].sort((a, b) => {
        const va = (a as any)[sf] ?? '';
        const vb = (b as any)[sf] ?? '';
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sd === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  });

  // ── UI state ──────────────────────────────────────────────
  activeTab = signal<string>('All');

  private _selectedPeriod = signal('This Month');
  private _chartView      = signal('Monthly');
  get selectedPeriod() { return this._selectedPeriod; }
  get chartView()      { return this._chartView; }

  setPeriod(p: string) {
    this._selectedPeriod.set(p);
    const d = this.chartData[p];
    this._chartView.set(d?.barLabel ?? 'Monthly');
    this.renderTrendChart();
    this.renderMonthlyChart();
  }
  setChartView(v: string) { this._chartView.set(v); this.renderMonthlyChart(); }

  periods = ['This Week', 'This Month', 'This Quarter', 'This Year'];

  // ── KPI Metrics ───────────────────────────────────────────
  get metrics() {
    const a   = this.billingService.analytics();
    const fmt = (n: number) => n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'K' : '$' + n.toFixed(0);
    return [
      { icon:'fa-solid fa-dollar-sign',          iconBg:'bg-green-100',  iconColor:'text-green-600',
        value: a ? fmt(a.total_revenue)    : '—', label:'Total Revenue',   badge:'+18%',   badgeCls:'text-green-600 bg-green-100',  note:'This month' },
      { icon:'fa-solid fa-clock',                iconBg:'bg-amber-100',  iconColor:'text-amber-600',
        value: a ? fmt(a.outstanding)      : '—', label:'Outstanding',     badge:'Pending',badgeCls:'text-amber-600 bg-amber-100',  note:'Pending invoices' },
      { icon:'fa-solid fa-triangle-exclamation', iconBg:'bg-red-100',    iconColor:'text-red-600',
        value: a ? fmt(a.overdue)          : '—', label:'Overdue',         badge:'Alert',  badgeCls:'text-red-600 bg-red-100',      note:'Overdue invoices' },
      { icon:'fa-solid fa-file-invoice',         iconBg:'bg-blue-100',   iconColor:'text-blue-600',
        value: a ? String(a.total_invoices): '—', label:'Total Invoices',  badge:'Active', badgeCls:'text-blue-600 bg-blue-100',    note:'All invoices' },
      { icon:'fa-solid fa-percent',              iconBg:'bg-purple-100', iconColor:'text-purple-600',
        value: a ? a.collection_rate + '%' : '—', label:'Collection Rate', badge:'Good',   badgeCls:'text-green-600 bg-green-100',  note:'Last 90 days' },
    ];
  }

  // ── Invoice tabs ──────────────────────────────────────────
  get invoiceTabs() {
    const list = this._mappedInvoices();
    return [
      { key:'All',     label:'All',     count: list.length,
        activeCls:'border-gray-900 text-gray-900',         badgeActiveCls:'bg-gray-900 text-white' },
      { key:'Paid',    label:'Paid',    count: list.filter(i => i.status==='Paid').length,
        activeCls:'border-green-500 text-green-600',       badgeActiveCls:'bg-green-100 text-green-700' },
      { key:'Pending', label:'Pending', count: list.filter(i => i.status==='Pending').length,
        activeCls:'border-blue-500 text-blue-600',         badgeActiveCls:'bg-blue-100 text-blue-700' },
      { key:'Overdue', label:'Overdue', count: list.filter(i => i.status==='Overdue').length,
        activeCls:'border-red-500 text-red-600',           badgeActiveCls:'bg-red-100 text-red-700' },
      { key:'Draft',   label:'Draft',   count: list.filter(i => i.status==='Draft').length,
        activeCls:'border-slate-400 text-slate-500',       badgeActiveCls:'bg-slate-100 text-slate-600' },
    ];
  }

  get overdueCount() { return this._mappedInvoices().filter(i => i.status === 'Overdue').length; }

  // ── Reminders list ────────────────────────────────────────
  get reminders() {
    return this._mappedInvoices()
      .filter(inv => inv.status === 'Overdue' || inv.showRemind)
      .slice(0, 5)
      .map(inv => ({
        iconBg:    inv.status === 'Overdue' ? 'bg-amber-100' : 'bg-blue-100',
        iconColor: inv.status === 'Overdue' ? 'text-amber-600' : 'text-blue-600',
        title:     (inv.status === 'Overdue' ? 'Overdue Notice' : 'Payment Due Reminder') + ' - ' + inv.number,
        client:    inv.client,
        channels:  [{ l:'Email', c:'bg-blue-100 text-blue-700' }],
        time:      inv.dueDate,
        badge:     inv.status,
        badgeCls:  inv.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
        id:        inv.id,
      }));
  }

  paymentMethods = [
    { icon:'fa-solid fa-building-columns', iconBg:'bg-blue-100',   iconColor:'text-blue-600',   label:'Bank Transfer', pct:'45% of payments', amount:'—' },
    { icon:'fa-solid fa-credit-card',      iconBg:'bg-purple-100', iconColor:'text-purple-600', label:'Credit Card',   pct:'35% of payments', amount:'—' },
    { icon:'fa-solid fa-money-check',      iconBg:'bg-green-100',  iconColor:'text-green-600',  label:'Check',         pct:'20% of payments', amount:'—' },
  ];

  // ── Sort icon helper ──────────────────────────────────────
  sortIcon(field: string): string {
    if (this.sortField() !== field) return 'fa-solid fa-sort text-gray-300';
    return this.sortDir() === 'asc' ? 'fa-solid fa-sort-up text-amber-500' : 'fa-solid fa-sort-down text-amber-500';
  }

  // ══════════════════════════════════════════════════════════
  // CHARTS
  // ══════════════════════════════════════════════════════════
  private readonly chartData: Record<string, {
    barX:string[]; barY:number[]; qtrX:string[]; qtrY:number[];
    trendX:string[]; trendY:number[]; showToggle:boolean; barLabel:string;
  }> = {
    'This Week':    { barX:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], barY:[4200,5800,3100,6700,4900,2200,1800], qtrX:[], qtrY:[], trendX:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], trendY:[4200,5800,3100,6700,4900,2200,1800], showToggle:false, barLabel:'Daily' },
    'This Month':   { barX:['Week 1','Week 2','Week 3','Week 4'], barY:[28500,31200,34800,30000], qtrX:['Q1','Q2','Q3','Q4'], qtrY:[265000,315000,351000,124500], trendX:['Week 1','Week 2','Week 3','Week 4'], trendY:[28500,31200,34800,30000], showToggle:true, barLabel:'Weekly' },
    'This Quarter': { barX:['January','February','March'], barY:[105000,118000,124500], qtrX:['Q1','Q2','Q3','Q4 (YTD)'], qtrY:[265000,315000,351000,347500], trendX:['Jan','Feb','Mar'], trendY:[105000,118000,124500], showToggle:true, barLabel:'Monthly' },
    'This Year':    { barX:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], barY:[85000,92000,88000,105000,98000,112000,108000,125000,118000,132000,124500,130000], qtrX:['Q1','Q2','Q3','Q4'], qtrY:[265000,315000,351000,386500], trendX:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], trendY:[85000,92000,88000,105000,98000,112000,108000,125000,118000,132000,124500,130000], showToggle:true, barLabel:'Monthly' },
  };

  get showChartToggle() { return this.chartData[this._selectedPeriod()]?.showToggle ?? true; }
  get chartViewLabels() {
    const d = this.chartData[this._selectedPeriod()];
    return d?.showToggle ? [d.barLabel, 'Quarterly'] : [];
  }

  ngAfterViewInit(): void { this.loadPlotly().then(() => this.renderCharts()); }

  private loadPlotly(): Promise<void> {
    return new Promise(resolve => {
      if (typeof Plotly !== 'undefined') { resolve(); return; }
      const s = document.createElement('script'); s.src = 'https://cdn.plot.ly/plotly-3.1.1.min.js';
      s.onload = () => resolve(); document.head.appendChild(s);
    });
  }

  private get lightLayout() {
    return { plot_bgcolor:'#fff', paper_bgcolor:'#fff', font:{color:'#374151'}, showlegend:false };
  }
  private readonly gridColor = '#f3f4f6';

  private renderCharts() { setTimeout(() => { this.renderTrendChart(); this.renderBreakdownChart(); this.renderMonthlyChart(); }, 50); }

  private renderBreakdownChart() {
    try {
      if (!document.getElementById('revenue-breakdown-chart')) return;
      Plotly.newPlot('revenue-breakdown-chart',
        [{ type:'pie', labels:['Civil Litigation','Real Estate','Corporate Law','Estate Planning','Employment Law','Healthcare Law'], values:[28,22,18,15,10,7],
           marker:{colors:['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4']}, textinfo:'percent', textfont:{size:11}, hole:0.35, hovertemplate:'<b>%{label}</b><br>%{percent}<extra></extra>' }],
        { plot_bgcolor:'#fff', paper_bgcolor:'#fff', font:{color:'#374151'}, showlegend:true, legend:{orientation:'v',x:1.02,y:0.5,font:{size:11},bgcolor:'transparent'}, margin:{t:20,r:160,b:20,l:20} },
        { responsive:true, displayModeBar:false });
    } catch(e) { console.error(e); }
  }

  private _buildRealChartData(): { x: string[]; yRevenue: number[]; yInvoiced: number[] } | null {
    const raw = this.billingService.monthlyRevenue();
    if (!raw.length) return null;
    return {
      x:         raw.map(r => { const [y, m] = r.month.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }); }),
      yRevenue:  raw.map(r => r.revenue),
      yInvoiced: raw.map(r => r.invoiced),
    };
  }

  private renderTrendChart() {
    const real = this._buildRealChartData();
    const trendX = real?.x ?? (this.chartData[this._selectedPeriod()] ?? this.chartData['This Month']).trendX;
    const trendY = real?.yRevenue ?? (this.chartData[this._selectedPeriod()] ?? this.chartData['This Month']).trendY;
    try {
      Plotly.react('revenue-trend-chart',
        [{ type:'scatter', mode:'lines+markers', x:trendX, y:trendY, line:{color:'#f59e0b',width:3}, fill:'tozeroy', fillcolor:'rgba(245,158,11,0.08)', marker:{color:'#f59e0b',size:5} }],
        { ...this.lightLayout, margin:{t:10,r:10,b:35,l:55}, xaxis:{showgrid:false,color:'#9ca3af',tickfont:{size:11}}, yaxis:{showgrid:true,gridcolor:this.gridColor,color:'#9ca3af',tickfont:{size:11},tickformat:'$,.0f'} },
        {responsive:true,displayModeBar:false});
    } catch(e) { console.error(e); }
  }

  private renderMonthlyChart() {
    const real = this._buildRealChartData();
    let x: string[], y: number[];
    if (real) {
      x = real.x; y = real.yRevenue;
    } else {
      const d    = this.chartData[this._selectedPeriod()] ?? this.chartData['This Month'];
      const useQ = this._chartView() === 'Quarterly' && d.showToggle;
      x = useQ ? d.qtrX : d.barX; y = useQ ? d.qtrY : d.barY;
    }
    const colors = y.map((_,i) => i === y.length-1 ? '#f59e0b' : '#fbbf24');
    try {
      Plotly.react('monthly-revenue-chart',
        [{ type:'bar', x, y, marker:{color:colors,opacity:0.9}, hovertemplate:'<b>%{x}</b><br>$%{y:,.0f}<extra></extra>' }],
        { ...this.lightLayout, margin:{t:20,r:20,b:35,l:65}, xaxis:{showgrid:false,color:'#9ca3af',tickfont:{size:11}}, yaxis:{showgrid:true,gridcolor:this.gridColor,color:'#9ca3af',tickfont:{size:11},tickformat:'$,.0f'} },
        {responsive:true,displayModeBar:false});
    } catch(e) { console.error(e); }
  }
}
