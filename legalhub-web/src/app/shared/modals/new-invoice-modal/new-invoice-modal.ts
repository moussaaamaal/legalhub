import { Component, signal, inject, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService } from '../../../services/billing.service';
import { ClientService } from '../../../services/client.service';
import { CaseService } from '../../../services/case.service';

interface FormItem { description: string; qty: number | null; rate: number | null; }

const SERVICE_TEMPLATES = [
  { label: 'Court Representation', rate: 350 },
  { label: 'Legal Consultation',   rate: 150 },
  { label: 'Document Drafting',    rate: 200 },
  { label: 'Research & Analysis',  rate: 180 },
  { label: 'Contract Review',      rate: 250 },
  { label: 'Mediation Services',   rate: 300 },
];

@Component({
  selector: 'app-new-invoice-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './new-invoice-modal.html',
})
export class NewInvoiceModal {
  private billingService = inject(BillingService);
  private clientService  = inject(ClientService);
  private caseService    = inject(CaseService);

  get clients() { return this.clientService.clients; }
  get cases()   { return this.caseService.cases; }

  readonly serviceTemplates = SERVICE_TEMPLATES;

  showModal    = signal(false);
  modalStep    = signal<1|2>(1);
  isSubmitting = signal(false);
  savingDraft  = signal(false);
  formError    = signal<string | null>(null);
  lastCreated  = signal<any>(null);
  lockedClient = signal<{ id: string; name: string } | null>(null);
  lockedCase   = signal<{ id: string; title: string } | null>(null);

  @Output() invoiceCreated = new EventEmitter<void>();

  selectedClientId    = signal('');
  selectedClientName  = signal('');
  selectedCaseId      = signal('');
  invoiceDate         = signal('');
  dueDate             = signal('');
  notes               = signal('');
  taxRate             = signal(0);
  invoiceItems        = signal<FormItem[]>([
    { description: '', qty: null, rate: null },
  ]);

  get hasValidItem(): boolean {
    return this.invoiceItems().some(i => i.description.trim() && i.qty && i.rate);
  }

  get isFormValid() {
    return this.selectedClientId().trim().length > 0
        && this.selectedCaseId().trim().length > 0
        && this.hasValidItem
        && this.taxRate() > 0;
  }

  get filteredCases() {
    const cid = this.selectedClientId();
    return cid
      ? this.caseService.cases().filter(c => c.clientId === cid)
      : this.caseService.cases();
  }

  openModal() {
    if (this.clientService.clients().length === 0) {
      this.clientService.loadClients().catch(() => {});
    }
    if (this.caseService.cases().length === 0) {
      this.caseService.loadCases().catch(() => {});
    }
    this.lockedClient.set(null);
    this.lockedCase.set(null);
    this.resetForm();
    this.modalStep.set(1);
    this.showModal.set(true);
  }

  openModalForClient(clientId: string, clientName: string) {
    this.openModal();
    this.lockedClient.set({ id: clientId, name: clientName });
    this.selectedClientId.set(clientId);
    this.selectedClientName.set(clientName);
  }

  openModalForCase(clientId: string, caseId: string, clientName = '', caseTitle = '') {
    this.openModal();
    this.lockedClient.set(clientName ? { id: clientId, name: clientName } : null);
    this.lockedCase.set(caseTitle   ? { id: caseId,   title: caseTitle  } : null);
    this.selectedClientId.set(clientId);
    this.selectedClientName.set(clientName);
    this.selectedCaseId.set(caseId);
  }


  closeModal() { this.showModal.set(false); }

  resetForm() {
    const today = new Date();
    const due   = new Date(today); due.setDate(due.getDate() + 30);
    this.selectedClientId.set('');
    this.selectedClientName.set('');
    this.selectedCaseId.set('');
    this.invoiceDate.set(today.toISOString().substring(0, 10));
    this.dueDate.set(due.toISOString().substring(0, 10));
    this.notes.set('');
    this.taxRate.set(0);
    this.formError.set(null);
    this.lastCreated.set(null);
    this.invoiceItems.set([{ description: '', qty: null, rate: null }]);
  }

  onClientChange(id: string) {
    this.selectedClientId.set(id);
    const c = this.clientService.clients().find((cl: any) => cl.id === id);
    this.selectedClientName.set(c?.name ?? '');
    this.selectedCaseId.set('');
  }

  getItemAmount(item: FormItem): string {
    return item.qty && item.rate ? '$' + (item.qty * item.rate).toFixed(2) : '$0.00';
  }

  getSubtotal(): number { return this.invoiceItems().reduce((s, i) => s + (i.qty && i.rate ? i.qty * i.rate : 0), 0); }
  getTax(): number      { return this.getSubtotal() * (this.taxRate() / 100); }
  getTotal(): string    { return '$' + (this.getSubtotal() + this.getTax()).toFixed(2); }

  addItem(): void { this.invoiceItems.update(items => [...items, { description: '', qty: null, rate: null }]); }

  addItemFromTemplate(tpl: { label: string; rate: number }): void {
    this.invoiceItems.update(items => [...items, { description: tpl.label, qty: 1, rate: tpl.rate }]);
  }

  removeItem(i: number): void { this.invoiceItems.update(items => items.filter((_, idx) => idx !== i)); }

  onTaxRateChange(val: string) { this.taxRate.set(Math.min(20, Math.max(0, parseFloat(val) || 0))); }

  private _buildPayload() {
    return {
      client_id:    this.selectedClientId(),
      case_id:      this.selectedCaseId() || undefined,
      items: this.invoiceItems()
        .filter(i => i.description.trim() && i.qty && i.rate)
        .map(i => ({ description: i.description, quantity: i.qty!, unit_price: i.rate! })),
      tax_rate: this.taxRate(),
      due_date: this.dueDate(),
      currency: 'USD',
      notes:    this.notes() || undefined,
    };
  }

  async saveAsDraft() {
    this.formError.set(null);
    const payload = this._buildPayload();
    this.savingDraft.set(true);
    try {
      const inv = await this.billingService.createInvoice(payload);
      this.lastCreated.set(inv);
      this.modalStep.set(2);
      this.invoiceCreated.emit();
    } catch (e: any) {
      this.formError.set(e?.error?.detail ?? 'Failed to save draft.');
    } finally {
      this.savingDraft.set(false);
    }
  }

  async submitInvoice() {
    this.formError.set(null);
    const payload = this._buildPayload();
    this.isSubmitting.set(true);
    try {
      const inv = await this.billingService.createInvoice(payload);
      this.lastCreated.set(inv);
      await this.billingService.sendInvoice(inv.id).catch(() => {});
      this.modalStep.set(2);
      this.invoiceCreated.emit();
    } catch (e: any) {
      this.formError.set(e?.error?.detail ?? 'Failed to create invoice.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
