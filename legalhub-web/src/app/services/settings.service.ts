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
}

export interface FirmBranding {
  logo_url?: string;
  primary_color?: string;
  display_name?: string;
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

  getOfficeCode(): Promise<string> {
    return firstValueFrom(
      this.http.get<{ office_code: string }>(`${this.api}/api/firm/office-code`)
    ).then(r => r.office_code);
  }
}
