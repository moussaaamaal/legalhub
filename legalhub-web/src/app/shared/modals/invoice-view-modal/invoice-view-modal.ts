import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-invoice-view-modal',
  standalone: true,
  imports: [NgClass],
  templateUrl: './invoice-view-modal.html',
})
export class InvoiceViewModal {
  @Input() invoice!: any;
  @Input() clientName  = '';
  @Input() clientEmail = '';
  @Input() cases: any[] = [];
  @Input() sendingId:  string | null = null;
  @Input() deletingId: string | null = null;

  @Output() closed      = new EventEmitter<void>();
  @Output() print       = new EventEmitter<void>();
  @Output() sendDraft   = new EventEmitter<string>();
  @Output() deleteDraft = new EventEmitter<string>();

  getClientName(): string {
    if (this.invoice?.client)
      return `${this.invoice.client.first_name} ${this.invoice.client.last_name}`.trim();
    return this.clientName || '—';
  }

  getClientEmail(): string {
    return this.invoice?.client?.email ?? (this.clientEmail || '—');
  }

  getCaseTitle(): string {
    const inv = this.invoice;
    if (inv?.case_file?.title || inv?.case?.title)
      return inv.case_file?.title ?? inv.case?.title;
    const found = this.cases.find((c: any) => c.id === inv?.case_id);
    return found?.title ?? found?.case_number ?? '—';
  }

  getCaseNumber(): string | null {
    const inv = this.invoice;
    const num = inv?.case_file?.case_number ?? inv?.case?.case_number;
    if (num) return num;
    const found = this.cases.find((c: any) => c.id === inv?.case_id);
    return found?.case_number ?? null;
  }

  getStatusInfo(): { label: string; bg: string; color: string } {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      DRAFT:     { label: 'Draft',     bg: 'bg-gray-100',  color: 'text-gray-700'  },
      PENDING:   { label: 'Pending',   bg: 'bg-amber-100', color: 'text-amber-700' },
      PAID:      { label: 'Paid',      bg: 'bg-green-100', color: 'text-green-700' },
      OVERDUE:   { label: 'Overdue',   bg: 'bg-red-100',   color: 'text-red-700'   },
      CANCELLED: { label: 'Cancelled', bg: 'bg-gray-200',  color: 'text-gray-500'  },
    };
    return map[this.invoice?.status] ?? { label: this.invoice?.status ?? '—', bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getDueNote(): { text: string; cls: string } {
    const inv = this.invoice;
    if (inv?.status === 'PAID')      return { text: 'Paid',      cls: 'text-green-600' };
    if (inv?.status === 'CANCELLED') return { text: 'Cancelled', cls: 'text-gray-400'  };
    if (!inv?.due_date)              return { text: '',          cls: ''               };
    const diff = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0)   return { text: `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`, cls: 'text-red-600'   };
    if (diff === 0) return { text: 'Due today',                                                       cls: 'text-amber-600' };
    return                { text: `Due in ${diff} day${diff > 1 ? 's' : ''}`,                        cls: 'text-gray-500'  };
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatAmount(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  }
}
