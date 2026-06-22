import { Component, signal, computed, AfterViewInit, OnInit, inject, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService, InvoiceRaw } from '../../../services/billing.service';
import { ConfirmDialog } from '../../../shared/modals/confirm-dialog/confirm-dialog';
import { ClientService } from '../../../services/client.service';
import { CaseService } from '../../../services/case.service';
import { AuthService } from '../../../services/auth.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { SearchNavigatorService } from '../../../shared/services/search-navigator.service';
import { NewInvoiceModal } from '../../../shared/modals/new-invoice-modal/new-invoice-modal';
import { InvoiceViewModal } from '../../../shared/modals/invoice-view-modal/invoice-view-modal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

declare var Plotly: any;

interface InvoiceUI {
  id: string; clientId: string;
  number: string; client: string; email: string;
  case: string; caseType: string;
  amount: string; issueDate: string; dueDate: string;
  rawIssueDate: string;
  dueNote: string; dueNoteColor: string;
  status: string; statusBg: string; statusColor: string;
  showRemind: boolean; canSend: boolean; canDelete: boolean; canCancel: boolean; canWhatsapp: boolean;
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [NgClass, FormsModule, HighlightPipe, NewInvoiceModal, InvoiceViewModal, ConfirmDialog],
  templateUrl: './billing.html',
})
export class Billing implements OnInit, AfterViewInit {

  private billingService = inject(BillingService);
  private clientService  = inject(ClientService);
  private caseService    = inject(CaseService);
  private authService    = inject(AuthService);
  searchNav              = inject(SearchNavigatorService);

  // ── Init ──────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.billingService.loadInvoices().then(() => this.billingService.loadMonthlyRevenue()),
      this.billingService.loadAnalytics(),
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
  // MODAL — CREATE INVOICE (composant partagé)
  // ══════════════════════════════════════════════════════════
  @ViewChild(NewInvoiceModal) invoiceModal!: NewInvoiceModal;

  openModal() { this.invoiceModal.openModal(); }

  async onInvoiceCreated() {
    await Promise.all([
      this.billingService.loadInvoices().then(() => this.billingService.loadMonthlyRevenue()),
      this.billingService.loadAnalytics(),
    ]);
    this.showToast('Invoice created successfully.');
  }

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

  printInvoice(inv: InvoiceRaw | any) {
    const client     = inv.client;
    const clientName = client ? `${client.first_name} ${client.last_name}`.trim() : '—';
    const caseTitle  = inv.case_file?.title ?? '—';
    const caseNum    = inv.case_file?.case_number ?? '';
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
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111827;background:#f3f4f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:780px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hdr{background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}
.hdr-brand{color:#fff;font-size:22px;font-weight:800}.hdr-brand span{opacity:.8;font-weight:400}
.hdr-right{text-align:right}.hdr-num{color:#fff;font-size:20px;font-weight:700}
.hdr-badge{display:inline-block;margin-top:5px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,.25);color:#fff}
.body{padding:28px 36px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px}
.box{background:#f9fafb;border-radius:8px;padding:14px;border:1px solid #e5e7eb}
.box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:7px}
.box .val{font-size:13px;font-weight:600;color:#111827}.box .sub{font-size:12px;color:#6b7280;margin-top:2px}
.sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead tr{background:#fef3c7}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e}
thead th:nth-child(2){text-align:center}thead th:nth-child(3),thead th:nth-child(4){text-align:right}
.totals{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;max-width:260px;margin-left:auto}
.tr{display:flex;justify-content:space-between;font-size:13px;color:#374151;padding:3px 0}
.ttotal{font-size:15px;font-weight:700;color:#d97706;border-top:1px solid #e5e7eb;padding-top:9px;margin-top:5px;display:flex;justify-content:space-between}
.notes{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px}
.notes h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:5px}
.notes p{font-size:13px;color:#374151}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div><div class="hdr-brand">Legal<span>Hub</span></div><div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:3px">Professional Legal Services</div></div>
    <div class="hdr-right"><div class="hdr-num">${inv.invoice_number}</div><div class="hdr-badge">${statusLabels[inv.status] ?? inv.status}</div></div>
  </div>
  <div class="body">
    <div class="grid3">
      <div class="box"><h3>Client</h3><div class="val">${clientName}</div><div class="sub">${client?.email ?? '—'}</div>${client?.phone ? `<div class="sub">${client.phone}</div>` : ''}</div>
      <div class="box"><h3>Case</h3><div class="val">${caseTitle}</div>${caseNum ? `<div class="sub"># ${caseNum}</div>` : ''}</div>
      <div class="box"><h3>Dates</h3><div class="val">Issued: ${fmtDate(inv.issue_date)}</div><div class="sub">Due: ${fmtDate(inv.due_date)}</div></div>
    </div>
    <div class="sec">Invoice Items</div>
    <table><thead><tr>
      <th style="width:50%">Description</th><th style="width:12%;text-align:center">Qty</th>
      <th style="width:19%;text-align:right">Unit Price</th><th style="width:19%;text-align:right">Total</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <div class="totals">
      <div class="tr"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>
      <div class="tr"><span>Tax (${inv.tax_rate}%)</span><span>${fmt(inv.tax_amount)}</span></div>
      <div class="ttotal"><span>Total</span><span>${fmt(inv.total_amount)}</span></div>
    </div>
    ${inv.notes ? `<div class="notes"><h3>Notes</h3><p>${inv.notes}</p></div>` : ''}
  </div>
</div>
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
  // SEARCH, FILTER, SORT
  // ══════════════════════════════════════════════════════════
  searchQuery       = signal('');
  showFilterPanel   = signal(false);

  onSearch(q: string): void {
    this.searchQuery.set(q);
    if (!q) { this.searchNav.reset(); return; }
    setTimeout(() => this.searchNav.scan(), 50);
  }
  filterDateFrom    = signal('');
  filterDateTo      = signal('');
  sortField         = signal<string>('');
  sortDir           = signal<'asc'|'desc'>('asc');
  filterClientId    = signal('');
  filterAmountMin   = signal('');
  filterAmountMax   = signal('');

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
    this.filterClientId.set('');
    this.filterAmountMin.set('');
    this.filterAmountMax.set('');
    this.activeTab.set('All');
    this.sortField.set('');
  }

  hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' ||
    this.filterDateFrom() !== '' ||
    this.filterDateTo() !== '' ||
    this.filterClientId() !== '' ||
    this.filterAmountMin() !== '' ||
    this.filterAmountMax() !== '' ||
    this.activeTab() !== 'All'
  );

  // ══════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════
  showExportMenu = signal(false);

  // ── Toast notifications ───────────────────────────────
  toast = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  private _toastTimer: any;

  showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    clearTimeout(this._toastTimer);
    this.toast.set({ message, type });
    this._toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

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

  // ── Helpers : filtrage par période sélectionnée ──────────
  private _periodDateRange(): { from: string; to: string } {
    const now = new Date();
    const to  = now.toISOString().substring(0, 10);
    let from: Date;
    switch (this._selectedPeriod()) {
      case 'This Week':
        from = new Date(now);
        from.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        break;
      case 'This Quarter':
        from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'This Year':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      default: // This Month
        from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { from: from.toISOString().substring(0, 10), to };
  }

  private _invoicesForPeriod() {
    const { from, to } = this._periodDateRange();
    return this.billingService.invoices()
      .filter(inv => inv.issue_date >= from && inv.issue_date <= to);
  }

  private _analyticsForPeriod() {
    const raw  = this._invoicesForPeriod();
    const paid = raw.filter(i => i.status === 'PAID');
    return {
      total_revenue:   paid.reduce((s, i) => s + i.total_amount, 0),
      outstanding:     raw.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.total_amount, 0),
      overdue:         raw.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + i.total_amount, 0),
      total_invoices:  raw.length,
      collection_rate: raw.length ? Math.round((paid.length / raw.length) * 100) : 0,
    };
  }

  private _fmt(n: number) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Export Excel ─────────────────────────────────────────
  exportExcel() {
    const period   = this.selectedPeriod();
    const kpi      = this._analyticsForPeriod();
    const invoices = this._invoicesForPeriod().map(inv => this._mapInvoice(inv));
    const total    = this._fmt(invoices.reduce((s, i) => {
      const raw = this.billingService.invoices().find(r => r.id === i.id);
      return s + (raw?.total_amount ?? 0);
    }, 0));
    const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const wb    = XLSX.utils.book_new();

    // Feuille 1 — Résumé
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['BILLING REPORT', '', period],
      ['Generated', today],
      [],
      ['SUMMARY'],
      ['Total Revenue',   kpi.total_revenue],
      ['Outstanding',     kpi.outstanding],
      ['Overdue',         kpi.overdue],
      ['Total Invoices',  kpi.total_invoices],
      ['Collection Rate', kpi.collection_rate + '%'],
    ]);
    ws1['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Feuille 2 — Factures
    const headers = ['Invoice #', 'Client', 'Email', 'Case', 'Case Type', 'Amount', 'Issue Date', 'Due Date', 'Status'];
    const rows    = invoices.map(inv => [
      inv.number, inv.client, inv.email, inv.case, inv.caseType,
      inv.amount, inv.issueDate, inv.dueDate, inv.status,
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows, [], ['', '', '', '', '', `${invoices.length} invoices`, total]]);
    ws2['!cols'] = [{ wch:14 },{ wch:24 },{ wch:28 },{ wch:22 },{ wch:18 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:14 },{ wch:12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Invoices');

    XLSX.writeFile(wb, `billing-report-${period.toLowerCase().replace(/ /g, '-')}.xlsx`);
    this.showExportMenu.set(false);
  }

  // ── Export PDF ───────────────────────────────────────────
  exportPdf() {
    const period   = this.selectedPeriod();
    const kpi      = this._analyticsForPeriod();
    const invoices = this._invoicesForPeriod().map(inv => this._mapInvoice(inv));
    const total    = this._fmt(invoices.reduce((s, i) => {
      const raw = this.billingService.invoices().find(r => r.id === i.id);
      return s + (raw?.total_amount ?? 0);
    }, 0));
    const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Bandeau header
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');   doc.setFontSize(15);
    doc.text('Billing Report', 14, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Period: ${period}   |   Generated: ${today}`, 120, 14);

    // Cartes KPI
    const kpis = [
      { label: 'Total Revenue',   value: this._fmt(kpi.total_revenue)  },
      { label: 'Outstanding',     value: this._fmt(kpi.outstanding)    },
      { label: 'Overdue',         value: this._fmt(kpi.overdue)        },
      { label: 'Total Invoices',  value: String(kpi.total_invoices)    },
      { label: 'Collection Rate', value: kpi.collection_rate + '%'     },
    ];
    kpis.forEach((k, i) => {
      const x = 14 + i * 54;
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(x, 27, 52, 18, 2, 2, 'F');
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');   doc.setFontSize(12);
      doc.text(k.value, x + 4, 36);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(k.label, x + 4, 42);
    });

    // Tableau des factures
    autoTable(doc, {
      startY: 51,
      head: [['Invoice #', 'Client', 'Case', 'Amount', 'Issue Date', 'Due Date', 'Status']],
      body: invoices.map(inv => [
        inv.number, inv.client, inv.case,
        inv.amount, inv.issueDate, inv.dueDate, inv.status,
      ]),
      foot: [['', '', `${invoices.length} invoices`, total, '', '', '']],
      theme: 'grid',
      headStyles:         { fillColor: [217, 119, 6], fontStyle: 'bold', fontSize: 9, textColor: 255 },
      footStyles:         { fillColor: [254, 243, 199], textColor: [146, 64, 14], fontStyle: 'bold', fontSize: 9 },
      bodyStyles:         { fontSize: 8.5, textColor: [17, 24, 39] },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles:       { 4: { halign: 'right', fontStyle: 'bold' }, 7: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    });

    doc.save(`billing-report-${period.toLowerCase().replace(/ /g, '-')}.pdf`);
    this.showExportMenu.set(false);
  }

  // ══════════════════════════════════════════════════════════
  // PER-ROW SEND / REMIND ACTIONS
  // ══════════════════════════════════════════════════════════
  sendingInvoiceId  = signal<string | null>(null);
  sendingReminderId = signal<string | null>(null);
  markingPaidId     = signal<string | null>(null);
  deletingId        = signal<string | null>(null);
  cancellingId      = signal<string | null>(null);

  pendingConfirm = signal<{
    title: string; message: string; confirmLabel: string;
    type: 'danger' | 'warning'; onConfirm: () => void;
  } | null>(null);

  confirmPending() { this.pendingConfirm()?.onConfirm(); this.pendingConfirm.set(null); }
  dismissConfirm() { this.pendingConfirm.set(null); }

  async onSendInvoice(invoiceId: string) {
    this.sendingInvoiceId.set(invoiceId);
    try {
      await this.billingService.sendInvoice(invoiceId);
      await this.billingService.loadAnalytics();
      this.showToast('Invoice sent successfully.');
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to send invoice.', 'error');
    } finally {
      this.sendingInvoiceId.set(null);
    }
  }

  async onSendReminder(invoiceId: string) {
    this.sendingReminderId.set(invoiceId);
    try {
      await this.billingService.sendReminder(invoiceId);
      this.showToast('Payment reminder sent successfully.');
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to send reminder.', 'error');
    } finally {
      this.sendingReminderId.set(null);
    }
  }

  sendingWhatsappId = signal<string | null>(null);

  async onSendWhatsapp(invoiceId: string) {
    this.sendingWhatsappId.set(invoiceId);
    try {
      await this.billingService.sendInvoiceWhatsapp(invoiceId);
      this.showToast('WhatsApp notification sent successfully.');
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to send WhatsApp notification.', 'error');
    } finally {
      this.sendingWhatsappId.set(null);
    }
  }

  async markInvoicePaid(invoiceId: string) {
    this.markingPaidId.set(invoiceId);
    try {
      const result = await this.billingService.markAsPaidViaSadad(invoiceId);
      await Promise.all([this.billingService.loadInvoices(), this.billingService.loadAnalytics(), this.billingService.loadMonthlyRevenue()]);
      this.showToast(result.instructions || 'Payment reference generated. Invoice pending confirmation.');
      if (this.selectedInvoiceId() === invoiceId) this.closeDetailModal();
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to initiate payment.', 'error');
    } finally {
      this.markingPaidId.set(null);
    }
  }

  onDeleteInvoice(invoiceId: string) {
    const num = this.billingService.invoices().find(i => i.id === invoiceId)?.invoice_number ?? '';
    this.pendingConfirm.set({
      title: 'Delete Invoice?',
      message: `Invoice ${num} will be permanently deleted. This action cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'danger',
      onConfirm: () => this._doDeleteInvoice(invoiceId),
    });
  }

  private async _doDeleteInvoice(invoiceId: string) {
    this.deletingId.set(invoiceId);
    try {
      await this.billingService.deleteInvoice(invoiceId);
      await Promise.all([this.billingService.loadAnalytics(), this.billingService.loadMonthlyRevenue()]);
      this.showToast('Invoice deleted.');
      if (this.selectedInvoiceId() === invoiceId) this.closeDetailModal();
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to delete invoice.', 'error');
    } finally {
      this.deletingId.set(null);
    }
  }

  onCancelInvoice(invoiceId: string) {
    const num = this.billingService.invoices().find(i => i.id === invoiceId)?.invoice_number ?? '';
    this.pendingConfirm.set({
      title: 'Cancel Invoice?',
      message: `Invoice ${num} will be marked as Cancelled.`,
      confirmLabel: 'Cancel Invoice',
      type: 'warning',
      onConfirm: () => this._doCancelInvoice(invoiceId),
    });
  }

  private async _doCancelInvoice(invoiceId: string) {
    this.cancellingId.set(invoiceId);
    try {
      await this.billingService.cancelInvoice(invoiceId);
      await Promise.all([this.billingService.loadAnalytics(), this.billingService.loadMonthlyRevenue()]);
      this.showToast('Invoice cancelled.');
      if (this.selectedInvoiceId() === invoiceId) this.closeDetailModal();
    } catch (e: any) {
      this.showToast(e?.error?.detail ?? 'Failed to cancel invoice.', 'error');
    } finally {
      this.cancellingId.set(null);
    }
  }

  // ══════════════════════════════════════════════════════════
  // INVOICE MAPPING & COMPUTED LIST
  // ══════════════════════════════════════════════════════════
  statusMap: Record<string, { display: string; bg: string; color: string }> = {
    DRAFT:     { display: 'Draft',     bg: 'bg-slate-100', color: 'text-slate-600' },
    PENDING:   { display: 'Pending',   bg: 'bg-amber-100',  color: 'text-amber-700'  },
    PAID:      { display: 'Paid',      bg: 'bg-green-100', color: 'text-green-700' },
    OVERDUE:   { display: 'Overdue',   bg: 'bg-red-100',   color: 'text-red-700'   },
    CANCELLED: { display: 'Cancelled', bg: 'bg-gray-100',  color: 'text-gray-600'  },
  };

  private _isInvoiceOwner(inv: InvoiceRaw): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    return user.role === 'admin' || inv.lawyer_id === user.id;
  }

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

    const linkedCaseFile = inv.case_file ?? (inv.case_id ? this.caseService.getCaseById(inv.case_id) : undefined);
    const caseTitle    = (linkedCaseFile as any)?.title ?? '—';
    const caseTypeFmt  = (this.caseService.getCaseById(inv.case_id ?? '')?.type ?? '').replace(/_/g, ' ');

    return {
      id: inv.id, clientId: inv.client_id,
      number: inv.invoice_number,
      client: clientName, email: client?.email ?? '—',
      case: caseTitle, caseType: caseTypeFmt,
      amount, issueDate: fmt(inv.issue_date), dueDate: fmt(inv.due_date),
      rawIssueDate: inv.issue_date,
      dueNote, dueNoteColor,
      status: statusInfo.display, statusBg: statusInfo.bg, statusColor: statusInfo.color,
      showRemind:   (inv.status === 'PENDING' || inv.status === 'OVERDUE') && this._isInvoiceOwner(inv),
      canSend:      inv.status === 'DRAFT' && this._isInvoiceOwner(inv),
      canCancel:    inv.status === 'DRAFT' && this._isInvoiceOwner(inv),
      canDelete:    !['DRAFT', 'PAID'].includes(inv.status) && this._isInvoiceOwner(inv),
      canWhatsapp:  ['PENDING', 'OVERDUE'].includes(inv.status) && !!inv.client && this._isInvoiceOwner(inv),
    };
  }

  private _mappedInvoices = computed(() => {
    const user = this.authService.currentUser();
    const uid = user?.id ?? '';
    const isAdmin = user?.role === 'admin';
    return this.billingService.invoices()
      .filter(inv => isAdmin || !['DRAFT', 'CANCELLED'].includes(inv.status) || inv.lawyer_id === uid)
      .map(inv => this._mapInvoice(inv));
  });

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

    const clientId = this.filterClientId();
    if (clientId) list = list.filter(inv => String(inv.clientId) === String(clientId));

    const minAmt = parseFloat(this.filterAmountMin());
    const maxAmt = parseFloat(this.filterAmountMax());
    if (!isNaN(minAmt)) list = list.filter(inv => {
      const raw = this.billingService.invoices().find(i => i.id === inv.id);
      return raw ? raw.total_amount >= minAmt : true;
    });
    if (!isNaN(maxAmt)) list = list.filter(inv => {
      const raw = this.billingService.invoices().find(i => i.id === inv.id);
      return raw ? raw.total_amount <= maxAmt : true;
    });

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
  private _chartPeriod    = signal('This Month');
  private _chartView      = signal('Monthly');
  get selectedPeriod() { return this._selectedPeriod; }
  get chartPeriod()    { return this._chartPeriod; }
  get chartView()      { return this._chartView; }

  setPeriod(p: string) { this._selectedPeriod.set(p); }

  setChartPeriod(p: string) {
    this._chartPeriod.set(p);
    const d = this.chartData[p];
    this._chartView.set(d?.barLabel ?? 'Monthly');
    this.renderTrendChart();
    this.renderMainRevenueChart();
  }
  setChartView(v: string) { this._chartView.set(v); this.renderMainRevenueChart(); }

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
    const all = this._mappedInvoices();
    return [
      { key:'All',       label:'All',       count: all.length,
        activeCls:'border-gray-900 text-gray-900',         badgeActiveCls:'bg-gray-900 text-white' },
      { key:'Paid',      label:'Paid',      count: all.filter(i => i.status==='Paid').length,
        activeCls:'border-green-500 text-green-600',       badgeActiveCls:'bg-green-100 text-green-700' },
      { key:'Pending',   label:'Pending',   count: all.filter(i => i.status==='Pending').length,
        activeCls:'border-amber-500 text-amber-600',       badgeActiveCls:'bg-amber-100 text-amber-700' },
      { key:'Overdue',   label:'Overdue',   count: all.filter(i => i.status==='Overdue').length,
        activeCls:'border-red-500 text-red-600',           badgeActiveCls:'bg-red-100 text-red-700' },
      { key:'Draft',     label:'Draft',     count: all.filter(i => i.status==='Draft').length,
        activeCls:'border-slate-500 text-slate-600',       badgeActiveCls:'bg-slate-100 text-slate-700' },
      { key:'Cancelled', label:'Cancelled', count: all.filter(i => i.status==='Cancelled').length,
        activeCls:'border-gray-400 text-gray-500',         badgeActiveCls:'bg-gray-100 text-gray-600' },
    ];
  }

  get overdueCount()   { return this._mappedInvoices().filter(i => i.status === 'Overdue').length; }
  get draftInvoices(): InvoiceUI[] { return this._mappedInvoices().filter(i => i.status === 'Draft'); }

  get revenueBreakdown() {
    const all = this.billingService.invoices();
    const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sum = (status: string) => all.filter(i => i.status === status).reduce((s, i) => s + i.total_amount, 0);
    const cnt = (status: string) => all.filter(i => i.status === status).length;
    return [
      { label: 'Collected',  amount: fmt(sum('PAID')),    count: cnt('PAID'),    icon: 'fa-solid fa-circle-check',         iconBg: 'bg-green-100',  iconColor: 'text-green-600',  labelColor: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
      { label: 'Pending',    amount: fmt(sum('PENDING')), count: cnt('PENDING'), icon: 'fa-solid fa-clock',                iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  labelColor: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'  },
      { label: 'Overdue',    amount: fmt(sum('OVERDUE')), count: cnt('OVERDUE'), icon: 'fa-solid fa-triangle-exclamation', iconBg: 'bg-red-100',    iconColor: 'text-red-600',    labelColor: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
    ];
  }

  get totalBilledFormatted(): string {
    const total = this.billingService.invoices()
      .filter(i => i.status !== 'DRAFT' && i.status !== 'CANCELLED')
      .reduce((s, i) => s + i.total_amount, 0);
    return '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get filteredTotalFormatted(): string {
    const ids = new Set(this.filteredInvoices().map(i => i.id));
    const total = this.billingService.invoices()
      .filter(i => ids.has(i.id))
      .reduce((s, i) => s + i.total_amount, 0);
    return '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getStatusBorderCls(status: string): string {
    const map: Record<string, string> = {
      'Paid':      'border-l-green-400',
      'Pending':   'border-l-amber-400',
      'Overdue':   'border-l-red-500',
      'Draft':     'border-l-slate-300',
      'Cancelled': 'border-l-gray-300',
    };
    return map[status] ?? 'border-l-transparent';
  }

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

  get showChartToggle() { return this.chartData[this._chartPeriod()]?.showToggle ?? true; }
  get chartViewLabels() {
    const d = this.chartData[this._chartPeriod()];
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

  private renderCharts() { setTimeout(() => { this.renderTrendChart(); this.renderMainRevenueChart(); }, 50); }

  private _buildRealChartData(): { x: string[]; yRevenue: number[]; yInvoiced: number[] } | null {
    const raw = this.billingService.monthlyRevenue();
    if (!raw.length) return null;

    const now      = new Date();
    const thisYear = now.getFullYear();
    const thisMon  = now.getMonth() + 1;

    const filtered = raw.filter(r => {
      const [y, m] = r.month.split('-').map(Number);
      switch (this._chartPeriod()) {
        case 'This Week':
        case 'This Month':
          return y === thisYear && m === thisMon;
        case 'This Quarter': {
          const qStart = thisMon - ((thisMon - 1) % 3);
          return y === thisYear && m >= qStart && m < qStart + 3;
        }
        case 'This Year':
          return y === thisYear;
        default:
          return true;
      }
    });

    const data = filtered.length ? filtered : raw;
    return {
      x:         data.map(r => { const [y, m] = r.month.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }); }),
      yRevenue:  data.map(r => r.revenue),
      yInvoiced: data.map(r => r.invoiced),
    };
  }

  private renderTrendChart() {
    const real   = this._buildRealChartData();
    const static_ = this.chartData[this._chartPeriod()] ?? this.chartData['This Month'];
    const trendX = (real && real.x.length >= 2) ? real.x : static_.trendX;
    const trendY = (real && real.x.length >= 2) ? real.yRevenue : static_.trendY;
    try {
      Plotly.react('revenue-trend-chart',
        [{ type:'scatter', mode:'lines+markers', x:trendX, y:trendY, line:{color:'#f59e0b',width:3}, fill:'tozeroy', fillcolor:'rgba(245,158,11,0.08)', marker:{color:'#f59e0b',size:5} }],
        { ...this.lightLayout, margin:{t:10,r:10,b:35,l:55}, xaxis:{showgrid:false,color:'#9ca3af',tickfont:{size:11}}, yaxis:{showgrid:true,gridcolor:this.gridColor,color:'#9ca3af',tickfont:{size:11},tickformat:'$,.0f'} },
        {responsive:true,displayModeBar:false});
    } catch(e) { console.error(e); }
  }

  private renderMainRevenueChart() {
    const real = this._buildRealChartData();
    let x: string[], yRevenue: number[], yInvoiced: number[];

    const d    = this.chartData[this._chartPeriod()] ?? this.chartData['This Month'];
    const useQ = this._chartView() === 'Quarterly' && d.showToggle;

    if (real && real.x.length >= 2) {
      x = real.x; yRevenue = real.yRevenue; yInvoiced = real.yInvoiced;
    } else {
      x         = useQ ? d.qtrX : d.barX;
      yRevenue  = useQ ? d.qtrY : d.barY;
      yInvoiced = yRevenue.map(v => Math.round(v * 1.18));
    }

    try {
      if (!document.getElementById('main-revenue-chart')) return;
      Plotly.react('main-revenue-chart',
        [
          {
            type: 'bar', name: 'Invoiced', x, y: yInvoiced,
            marker: { color: 'rgba(251,191,36,0.5)', line: { color: '#f59e0b', width: 1.5 } },
            hovertemplate: '<b>%{x}</b><br>Invoiced: $%{y:,.0f}<extra></extra>',
          },
          {
            type: 'scatter', mode: 'lines+markers', name: 'Collected', x, y: yRevenue,
            line: { color: '#10b981', width: 3, shape: 'spline' },
            fill: 'tonexty', fillcolor: 'rgba(16,185,129,0.06)',
            marker: { color: '#10b981', size: 7, line: { color: '#fff', width: 2 } },
            hovertemplate: '<b>%{x}</b><br>Collected: $%{y:,.0f}<extra></extra>',
          },
        ],
        {
          ...this.lightLayout,
          showlegend: false,
          margin: { t: 20, r: 20, b: 40, l: 70 },
          bargap: 0.5,
          bargroupgap: 0.15,
          xaxis: { showgrid: false, color: '#9ca3af', tickfont: { size: 11 } },
          yaxis: { showgrid: true, gridcolor: this.gridColor, color: '#9ca3af', tickfont: { size: 11 }, tickformat: '$,.0f' },
        },
        { responsive: true, displayModeBar: false }
      );
    } catch(e) { console.error(e); }
  }
}
