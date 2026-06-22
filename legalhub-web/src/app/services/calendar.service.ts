import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SKIP_AUTH_REDIRECT } from './auth.interceptor';
import { environment } from '../environments/environment';
import { CalEvent, EventType } from '../components/calendar/calendar/calendar';

// ── Backend DTOs ──────────────────────────────────────────────────────────────

export interface BackendEvent {
  id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime?: string | null;
  case_id?: string | null;
  case_title?: string | null;
  location?: string | null;
  is_video_call: boolean;
  video_call_url?: string | null;
  reminder_minutes?: number[] | null;
  firm_id: string;
  created_by: string;
  is_participant?: boolean;
  participants?: { user_id: string; full_name: string; participant_type: string }[];
}


export interface CreateEventPayload {
  title: string;
  event_type: string;                                   // uppercase: HEARING, MEETING…
  start_datetime: string;                               // naive ISO: "YYYY-MM-DDTHH:MM:SS"
  end_datetime?: string;
  case_id?: string;
  location?: string;
  is_video_call: boolean;
  video_call_url?: string;
  reminder_minutes?: number[];
  recurrence: 'none' | 'weekly' | 'biweekly' | 'monthly';
  recurrence_count?: number;                            // required when recurrence != none
  recurrence_until?: string;                            // ISO date, alternative to count
  participant_ids?: string[];                           // user IDs to invite
}

export interface AvailableParticipant {
  user_id:          string;
  full_name:        string;
  email:            string;
  role:             string;
  participant_type: 'TEAM_MEMBER' | 'CLIENT';
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  async getEvents(filters?: {
    event_type?: string;
    case_id?: string;
    from_date?: string;
  }): Promise<CalEvent[]> {
    let params = new HttpParams();
    if (filters?.event_type) params = params.set('event_type', filters.event_type);
    if (filters?.case_id)    params = params.set('case_id',    filters.case_id);
    if (filters?.from_date)  params = params.set('from_date',  filters.from_date);

    const events = await firstValueFrom(
      this.http.get<BackendEvent[]>(`${this.api}/api/calendar/events`, { params })
    );
    return events.map(e => this._mapToCalEvent(e));
  }

  async createEvent(payload: CreateEventPayload): Promise<CalEvent> {
    const result = await firstValueFrom(
      this.http.post<BackendEvent>(`${this.api}/api/calendar/events`, payload)
    );
    return this._mapToCalEvent(result);
  }

  async updateEvent(id: string, payload: CreateEventPayload): Promise<CalEvent> {
    const { recurrence, recurrence_count, recurrence_until, ...updateBody } = payload as any;
    const result = await firstValueFrom(
      this.http.put<BackendEvent>(`${this.api}/api/calendar/events/${id}`, updateBody)
    );
    return this._mapToCalEvent(result);
  }

  async deleteEvent(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/calendar/events/${id}`)
    );
  }

  // ── Google Calendar Sync ──────────────────────────────────────────────────

  async getGoogleAuthUrl(mobileCallback?: string): Promise<{ auth_url: string }> {
    const params: Record<string, string> = {};
    if (mobileCallback) params['mobile_callback'] = mobileCallback;
    return firstValueFrom(
      this.http.get<{ auth_url: string }>(`${this.api}/api/calendar/sync/google/auth-url`, { params })
    );
  }

  async syncToGoogle(): Promise<{ synced: number; failed: number; total: number }> {
    return firstValueFrom(
      this.http.post<{ synced: number; failed: number; total: number }>(
        `${this.api}/api/calendar/sync/google`, {},
        { context: new HttpContext().set(SKIP_AUTH_REDIRECT, true) }
      )
    );
  }

  async exchangeGoogleCode(code: string, redirectUri: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${this.api}/api/calendar/sync/google/exchange-code`, {
        code,
        redirect_uri: redirectUri,
      })
    );
  }

  async getAvailableParticipants(caseId?: string): Promise<AvailableParticipant[]> {
    let params = new HttpParams();
    if (caseId) params = params.set('case_id', caseId);
    return firstValueFrom(
      this.http.get<AvailableParticipant[]>(`${this.api}/api/calendar/available-participants`, { params })
    );
  }

  // ── Meeting Requests ──────────────────────────────────────────────────────

  async listMeetingRequests(): Promise<Record<string, unknown>[]> {
    return firstValueFrom(
      this.http.get<Record<string, unknown>[]>(`${this.api}/api/calendar/meeting-requests`)
    );
  }

  async acceptMeetingRequest(
    requestId: string,
    body: {
      title?:          string;
      start_datetime?: string;
      end_datetime?:   string;
      location?:       string;
      video_call_url?: string;
    }
  ): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.http.post<Record<string, unknown>>(
        `${this.api}/api/calendar/meeting-requests/${requestId}/accept`,
        body
      )
    );
  }

  async rejectMeetingRequest(requestId: string, reason?: string): Promise<{ status: string }> {
    return firstValueFrom(
      this.http.post<{ status: string }>(
        `${this.api}/api/calendar/meeting-requests/${requestId}/reject`,
        { reason: reason ?? '' }
      )
    );
  }

  getStoredGoogleStatus(): boolean {
    return localStorage.getItem('legalhub_google_calendar_connected') === 'true';
  }

  setStoredGoogleStatus(connected: boolean): void {
    if (connected) localStorage.setItem('legalhub_google_calendar_connected', 'true');
    else localStorage.removeItem('legalhub_google_calendar_connected');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Convert backend calendar_event row → frontend CalEvent.
   * Times are extracted directly from the ISO string (no JS Date timezone
   * conversion) so the user always sees the exact hours they saved,
   * regardless of the browser's local timezone.
   */
  private _mapToCalEvent(e: BackendEvent): CalEvent {
    const rawStart = e.start_datetime ?? '';

    // Extract date and time directly from the string — avoids any TZ shift.
    // Handles both "2026-04-27T09:00:00" and "2026-04-27T09:00:00+00:00"
    const datePart  = rawStart.slice(0, 10);    // "YYYY-MM-DD"
    const startTime = rawStart.slice(11, 16);   // "HH:MM"

    let endTime = '';
    if (e.end_datetime) {
      endTime = e.end_datetime.slice(11, 16);
    }

    // Compute day-of-week from the local date (no TZ conversion)
    const [y, m, d] = datePart.split('-').map(Number);
    const localDate  = new Date(y, m - 1, d);
    const dow        = localDate.getDay();       // 0=Sun … 6=Sat
    const day        = dow === 0 ? 6 : dow - 1; // Mon=0 … Sun=6

    const type = e.event_type.toLowerCase() as EventType;

    let locationType: 'physical' | 'video' | 'phone' | '' = '';
    if (e.is_video_call)  locationType = 'video';
    else if (e.location)  locationType = 'physical';

    return {
      id:           e.id,
      title:        e.title,
      type,
      date:         datePart,
      startTime,
      endTime,
      allDay:       false,
      locationType,
      location:     (e.is_video_call ? (e.video_call_url ?? e.location) : e.location) ?? '',
      caseRef:      e.case_id ?? '',
      caseTitle:    e.case_title ?? '',
      createdBy:    e.created_by,
      participants: (e.participants ?? []).map(p => ({ id: p.user_id, name: p.full_name, type: p.participant_type })),
      isParticipant: e.is_participant ?? false,
      notes:        '',
      reminder:     e.reminder_minutes?.[0]?.toString() ?? '0',
      day,
    };
  }
}
