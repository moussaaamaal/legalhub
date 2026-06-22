import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface InvoiceItemPayload {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateInvoicePayload {
  client_id: string;
  case_id?: string;
  items: InvoiceItemPayload[];
  tax_rate: number;
  due_date: string;   // ISO: "YYYY-MM-DD"
  currency: string;
  notes?: string;
}

export interface MonthlyRevenue {
  month: string;     // "YYYY-MM"
  revenue: number;
  invoiced: number;
}

export interface BillingAnalytics {
  total_revenue: number;
  outstanding: number;
  overdue: number;
  total_invoices: number;
  collection_rate: number;
}

export interface UpdateInvoicePayload {
  client_id?: string;
  case_id?: string;
  items?: InvoiceItemPayload[];
  tax_rate?: number;
  due_date?: string;
  currency?: string;
  notes?: string;
}

export interface InvoiceRaw {
  id: string;
  invoice_number: string;
  client_id: string;
  case_id?: string;
  lawyer_id?: string;
  status: string;         // DRAFT | PENDING | PAID | OVERDUE | CANCELLED
  case_file?: { id: string; title: string; case_number: string } | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  notes?: string;
  invoice_item?: {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }[];
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  private _invoices        = signal<InvoiceRaw[]>([]);
  private _analytics       = signal<BillingAnalytics | null>(null);
  private _monthlyRevenue  = signal<MonthlyRevenue[]>([]);
  private _loading         = signal(false);
  private _error           = signal<string | null>(null);

  invoices       = this._invoices.asReadonly();
  analytics      = this._analytics.asReadonly();
  monthlyRevenue = this._monthlyRevenue.asReadonly();
  loading        = this._loading.asReadonly();
  error          = this._error.asReadonly();

  async loadAnalytics(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<BillingAnalytics>(`${this.api}/api/invoices/analytics/summary`)
      );
      this._analytics.set(data);
    } catch { /* silent — metrics will stay null */ }
  }

  // No backend endpoint for monthly-revenue — computed from loaded invoices
  async loadMonthlyRevenue(): Promise<void> {
    const invoices = this._invoices();
    const byMonth: Record<string, { revenue: number; invoiced: number }> = {};
    for (const inv of invoices) {
      const month = (inv.issue_date ?? '').slice(0, 7); // "YYYY-MM"
      if (!month) continue;
      if (!byMonth[month]) byMonth[month] = { revenue: 0, invoiced: 0 };
      if (inv.status === 'PAID')                          byMonth[month].revenue  += inv.total_amount;
      if (inv.status !== 'DRAFT' && inv.status !== 'CANCELLED') byMonth[month].invoiced += inv.total_amount;
    }
    const result: MonthlyRevenue[] = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, revenue: v.revenue, invoiced: v.invoiced }));
    this._monthlyRevenue.set(result);
  }

  async loadInvoices(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<InvoiceRaw[]>(`${this.api}/api/invoices`)
      );
      this._invoices.set(data ?? []);
    } catch (e: any) {
      this._error.set(e?.error?.detail ?? 'Failed to load invoices');
    } finally {
      this._loading.set(false);
    }
  }

  async createInvoice(payload: CreateInvoicePayload): Promise<InvoiceRaw> {
    const result = await firstValueFrom(
      this.http.post<InvoiceRaw>(`${this.api}/api/invoices`, payload)
    );
    this._invoices.update(list => [result, ...list]);
    return result;
  }

  async sendInvoice(invoiceId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/invoices/${invoiceId}/send`, {})
    );
    this._invoices.update(list =>
      list.map(inv => inv.id === invoiceId ? { ...inv, status: 'PENDING' } : inv)
    );
  }

  async sendReminder(invoiceId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/invoices/${invoiceId}/reminder`, {})
    );
  }

  async updateInvoice(invoiceId: string, payload: UpdateInvoicePayload): Promise<InvoiceRaw> {
    const result = await firstValueFrom(
      this.http.put<InvoiceRaw>(`${this.api}/api/invoices/${invoiceId}`, payload)
    );
    this._invoices.update(list =>
      list.map(inv => inv.id === invoiceId ? result : inv)
    );
    return result;
  }

  async listForCase(caseId: string): Promise<InvoiceRaw[]> {
    const data = await firstValueFrom(
      this.http.get<InvoiceRaw[]>(`${this.api}/api/invoices`, { params: { case_id: caseId } })
    );
    return data ?? [];
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/invoices/${invoiceId}`)
    );
    this._invoices.update(list => list.filter(inv => inv.id !== invoiceId));
  }

  // Mark invoice as paid via Stripe (card required) — passes through the payment flow
  async markAsPaidWithCard(invoiceId: string, card: {
    card_number: string; card_name: string; exp_month: string; exp_year: string; cvc: string; currency?: string;
  }): Promise<void> {
    await firstValueFrom(
      this.http.post<{ status: string; message: string }>(`${this.api}/api/payments/stripe/create`, {
        invoice_id:  invoiceId,
        currency:    card.currency ?? 'usd',
        card_number: card.card_number,
        card_name:   card.card_name,
        exp_month:   card.exp_month,
        exp_year:    card.exp_year,
        cvc:         card.cvc,
      })
    );
    // Refresh invoice status locally
    await this.loadInvoices();
  }

  // Mark invoice as paid via SADAD (no card required, returns a bill reference)
  async markAsPaidViaSadad(invoiceId: string): Promise<{ bill_reference: string; instructions: string }> {
    const result = await firstValueFrom(
      this.http.post<{ bill_reference: string; instructions: string }>(
        `${this.api}/api/payments/sadad/initiate`,
        { invoice_id: invoiceId }
      )
    );
    return result;
  }

  async sendInvoiceWhatsapp(invoiceId: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/whatsapp/send-invoice-notif`, { invoice_id: invoiceId })
    );
  }

  async cancelInvoice(invoiceId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/invoices/${invoiceId}/cancel`, {})
    );
    this._invoices.update(list =>
      list.map(inv => inv.id === invoiceId ? { ...inv, status: 'CANCELLED' } : inv)
    );
  }

  async exportInvoices(format: 'pdf' | 'excel' = 'pdf', status?: string): Promise<void> {
    const params: Record<string, string> = { format };
    if (status) params['status'] = status;
    const token = localStorage.getItem('access_token') ?? '';
    const query = new URLSearchParams(params).toString();
    const resp  = await fetch(`${this.api}/api/invoices/export?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('Export failed');
    const blob     = await resp.blob();
    const filename = resp.headers.get('Content-Disposition')
      ?.match(/filename="?([^"]+)"?/)?.[1]
      ?? `invoices.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
