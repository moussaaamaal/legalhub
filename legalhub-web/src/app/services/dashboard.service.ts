import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface DashboardStats {
  active_cases: number;
  closed_cases: number;
  upcoming_hearings: number;
  pending_payments: number;
  active_reminders: number;
}

export interface DashboardActivity {
  id: string;
  action: string;
  created_at: string;
  case_file: { id: string; title: string; case_number: string } | null;
}

export interface RecentCase {
  id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  updated_at: string;
  client_name: string | null;
}

export interface TodayEvent {
  id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime?: string;
  location?: string;
  case_file: { id: string; title: string; case_number: string } | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  getStats() {
    return firstValueFrom(
      this.http.get<DashboardStats>(`${this.api}/api/dashboard/stats`)
    );
  }

  getTodaySchedule() {
    return firstValueFrom(
      this.http.get<TodayEvent[]>(`${this.api}/api/dashboard/today`)
    );
  }

  getRecentActivity(days = 3) {
    return firstValueFrom(
      this.http.get<DashboardActivity[]>(`${this.api}/api/dashboard/recent-activity`, {
        params: { days: String(days) },
      })
    );
  }

  getRecentCases() {
    return firstValueFrom(
      this.http.get<RecentCase[]>(`${this.api}/api/dashboard/recent-cases`)
    );
  }
}
