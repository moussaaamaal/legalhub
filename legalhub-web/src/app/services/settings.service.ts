import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface FirmProfile {
  id: string;
  name: string;
  legal_entity_type: string;
  registration_number: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  practice_areas: string[];
  description: string;
  office_code: string;
  created_at?: string;
}

export interface FirmBranding {
  logo_url?: string;
  primary_color?: string;
  display_name?: string;
}

export interface IntegrationStatus {
  connected: boolean;
  configured: boolean;
  connected_as: string | null;
}

export interface IntegrationsStatus {
  google_calendar: IntegrationStatus;
  whatsapp:        IntegrationStatus;
  stripe:          IntegrationStatus;
  sadad:           IntegrationStatus;
}

export interface FirmSubscription {
  plan_name?: string;
  status?: string;
  billing_cycle?: string;
  next_billing_date?: string;
  amount?: number;
  currency?: string;
  max_users?: number;
  max_cases?: number;
  storage_gb?: number;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  getFirmProfile(): Promise<FirmProfile> {
    return firstValueFrom(this.http.get<FirmProfile>(`${this.api}/api/firm/profile`));
  }

  updateFirmProfile(data: Partial<Omit<FirmProfile, 'id' | 'office_code'>>): Promise<FirmProfile> {
    return firstValueFrom(this.http.put<FirmProfile>(`${this.api}/api/firm/profile`, data));
  }

  getBranding(): Promise<FirmBranding> {
    return firstValueFrom(this.http.get<FirmBranding>(`${this.api}/api/firm/branding`));
  }

  updateBranding(data: FirmBranding): Promise<FirmBranding> {
    return firstValueFrom(this.http.put<FirmBranding>(`${this.api}/api/firm/branding`, data));
  }

  getSubscription(): Promise<FirmSubscription> {
    return firstValueFrom(this.http.get<FirmSubscription>(`${this.api}/api/firm/subscription`));
  }

  getFirmStats(): Promise<{ active_cases: number; closed_cases: number; total_members: number; total_clients: number; total_documents: number }> {
    return firstValueFrom(
      this.http.get<{ active_cases: number; closed_cases: number; total_members: number; total_clients: number; total_documents: number }>(`${this.api}/api/firm/stats`)
    );
  }

  getOfficeCode(): Promise<string> {
    return firstValueFrom(
      this.http.get<{ office_code: string }>(`${this.api}/api/firm/office-code`)
    ).then(r => r.office_code);
  }

  async getIntegrationStatus(): Promise<IntegrationsStatus> {
    const probe = async <T>(req: Promise<T>): Promise<{ ok: boolean; data?: T; configured: boolean }> => {
      try {
        const data = await req;
        return { ok: true, data, configured: true };
      } catch (e: any) {
        // 503 = server not configured; anything else = configured but API issue
        return { ok: e?.status !== 503, data: undefined, configured: e?.status !== 503 };
      }
    };

    const [google, whatsapp, stripe] = await Promise.all([
      probe(firstValueFrom(this.http.get<{ auth_url: string }>(`${this.api}/api/calendar/sync/google/auth-url`))),
      probe(firstValueFrom(this.http.get<{ name: string; status: string }[]>(`${this.api}/api/whatsapp/templates`))),
      probe(firstValueFrom(this.http.get<{ id: string; brand: string; last4: string }[]>(`${this.api}/api/payments/stripe/methods`))),
    ]);

    const wTemplates = whatsapp.data as { name: string; status: string }[] | undefined;
    const sMethods   = stripe.data  as { brand: string; last4: string }[] | undefined;

    return {
      google_calendar: {
        connected:    google.ok,
        configured:   google.configured,
        connected_as: null,
      },
      whatsapp: {
        connected:    whatsapp.ok,
        configured:   whatsapp.configured,
        connected_as: wTemplates?.length
          ? `${wTemplates.filter(t => t.status === 'APPROVED').length} approved template(s)`
          : whatsapp.ok ? 'Connected' : null,
      },
      stripe: {
        connected:    stripe.ok,
        configured:   stripe.configured,
        connected_as: sMethods?.length
          ? `${sMethods.length} saved method(s)`
          : stripe.ok ? 'Connected' : null,
      },
      sadad: {
        connected:    false,
        configured:   false,
        connected_as: null,
      },
    };
  }

  uploadFirmLogo(file: File): Promise<{ logo_url: string }> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.http.post<{ logo_url: string }>(`${this.api}/api/firm/branding/logo`, form)
    );
  }

  removeFirmLogo(): Promise<void> {
    return this.updateBranding({ logo_url: '' }).then(() => {});
  }

  getGoogleCalendarAuthUrl(): Promise<{ auth_url: string }> {
    return firstValueFrom(
      this.http.get<{ auth_url: string }>(`${this.api}/api/calendar/sync/google/auth-url`)
    );
  }

  syncGoogleCalendar(): Promise<{ synced: number; failed: number; total: number }> {
    return firstValueFrom(
      this.http.post<{ synced: number; failed: number; total: number }>(`${this.api}/api/calendar/sync/google`, {})
    );
  }
}
