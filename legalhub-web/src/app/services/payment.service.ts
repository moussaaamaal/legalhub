import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface StripePaymentPayload {
  invoice_id:   string;
  currency?:    string;
  card_number?: string;
  card_name?:   string;
  exp_month?:   string;
  exp_year?:    string;
  cvc?:         string;
}

export interface StripePaymentResult {
  status?:            string;
  message?:           string;
  client_secret?:     string;
  payment_intent_id?: string;
  amount?:            number;
  currency?:          string;
}

export interface SavedPaymentMethod {
  id:        string;
  brand:     string;
  last4:     string;
  exp_month: number;
  exp_year:  number;
}

export interface SadadResult {
  bill_reference:  string;
  sadad_reference?: string;
  amount:          number;
  currency:        string;
  instructions:    string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  // ── Stripe ──────────────────────────────────────────────────

  async createStripePayment(payload: StripePaymentPayload): Promise<StripePaymentResult> {
    return firstValueFrom(
      this.http.post<StripePaymentResult>(`${this.api}/api/payments/stripe/create`, payload)
    );
  }

  async confirmStripePayment(paymentIntentId: string): Promise<{ message: string; status: string }> {
    return firstValueFrom(
      this.http.post<{ message: string; status: string }>(
        `${this.api}/api/payments/stripe/confirm`,
        null,
        { params: { payment_intent_id: paymentIntentId } }
      )
    );
  }

  async listSavedMethods(): Promise<SavedPaymentMethod[]> {
    try {
      return await firstValueFrom(
        this.http.get<SavedPaymentMethod[]>(`${this.api}/api/payments/stripe/methods`)
      );
    } catch { return []; }
  }

  async savePaymentMethod(card: {
    card_number: string;
    card_name:   string;
    exp_month:   string;
    exp_year:    string;
    cvc:         string;
  }): Promise<SavedPaymentMethod> {
    return firstValueFrom(
      this.http.post<SavedPaymentMethod>(`${this.api}/api/payments/stripe/methods/save`, card)
    );
  }

  async deleteSavedMethod(methodId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/payments/stripe/methods/${methodId}`)
    );
  }

  async payWithSavedMethod(invoiceId: string, paymentMethodId: string, currency = 'usd'): Promise<StripePaymentResult> {
    return firstValueFrom(
      this.http.post<StripePaymentResult>(`${this.api}/api/payments/stripe/pay-with-method`, {
        invoice_id:        invoiceId,
        payment_method_id: paymentMethodId,
        currency,
      })
    );
  }

  // ── SADAD ───────────────────────────────────────────────────

  async initiateSadad(invoiceId: string): Promise<SadadResult> {
    return firstValueFrom(
      this.http.post<SadadResult>(`${this.api}/api/payments/sadad/initiate`, {
        invoice_id: invoiceId,
      })
    );
  }
}
