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
  billing_type?: string;
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

export interface InvoiceRaw {
  id: string;
  invoice_number: string;
  client_id: string;
  case_id?: string;
  billing_type?: string;
  status: string;         // DRAFT | PENDING | PAID | OVERDUE | CANCELLED
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

  async loadMonthlyRevenue(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<MonthlyRevenue[]>(`${this.api}/api/invoices/analytics/monthly-revenue`)
      );
      this._monthlyRevenue.set(data ?? []);
    } catch { /* silent */ }
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
}
