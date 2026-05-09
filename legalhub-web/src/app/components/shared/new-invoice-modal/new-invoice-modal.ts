import { Component, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService } from '../../../services/billing.service';
import { ClientService } from '../../../services/client.service';
import { CaseService } from '../../../services/case.service';

interface FormItem { description: string; qty: number | null; rate: number | null; }

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

  showModal    = signal(false);
  modalStep    = signal<1|2>(1);
  isSubmitting = signal(false);
  savingDraft  = signal(false);
  formError    = signal<string | null>(null);
  lastCreated  = signal<any>(null);

  selectedClientId    = signal('');
  selectedClientName  = signal('');
  selectedCaseId      = signal('');
  selectedBillingType = signal('Hourly Rate');
  invoiceDate         = signal('');
  dueDate             = signal('');
  notes               = signal('');
  invoiceItems        = signal<FormItem[]>([
    { description: '', qty: null, rate: null },
    { description: '', qty: null, rate: null },
  ]);

  billingTypes = ['Hourly Rate', 'Flat Fee', 'Contingency', 'Retainer'];

  get isFormValid() { return this.selectedClientId().trim().length > 0; }

  openModal() {
    if (this.clientService.clients().length === 0) {
      this.clientService.loadClients().catch(() => {});
    }
    if (this.caseService.cases().length === 0) {
      this.caseService.loadCases().catch(() => {});
    }
    this.resetForm();
    this.modalStep.set(1);
    this.showModal.set(true);
  }

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
    this.formError.set(null);
    this.lastCreated.set(null);
    this.invoiceItems.set([
      { description: '', qty: null, rate: null },
      { description: '', qty: null, rate: null },
    ]);
  }

  onClientChange(id: string) {
    this.selectedClientId.set(id);
    const c = this.clientService.clients().find(cl => cl.id === id);
    this.selectedClientName.set(c?.name ?? '');
  }

  getItemAmount(item: FormItem): string {
    return item.qty && item.rate ? '$' + (item.qty * item.rate).toFixed(2) : '$0.00';
  }

  getSubtotal(): number { return this.invoiceItems().reduce((s,i) => s + (i.qty && i.rate ? i.qty * i.rate : 0), 0); }
  getTax(): number      { return this.getSubtotal() * 0.08; }
  getTotal(): string    { return '$' + (this.getSubtotal() + this.getTax()).toFixed(2); }
  addItem(): void       { this.invoiceItems.update(items => [...items, {description:'',qty:null,rate:null}]); }
  removeItem(i: number): void { this.invoiceItems.update(items => items.filter((_,idx) => idx !== i)); }

  private _buildPayload() {
    return {
      client_id: this.selectedClientId(),
      case_id:   this.selectedCaseId() || undefined,
      items: this.invoiceItems()
        .filter(i => i.description.trim() && i.qty && i.rate)
        .map(i => ({ description: i.description, quantity: i.qty!, unit_price: i.rate! })),
      tax_rate: 8,
      due_date: this.dueDate(),
      currency: 'USD',
      notes:    this.notes() || undefined,
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
    } catch (e: any) {
      this.formError.set(e?.error?.detail ?? 'Failed to create invoice.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
