import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  location?: string | null;
  is_video_call: boolean;
  video_call_url?: string | null;
  reminder_minutes?: number[] | null;
  firm_id: string;
  created_by: string;
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
    const result = await firstValueFrom(
      this.http.put<BackendEvent>(`${this.api}/api/calendar/events/${id}`, payload)
    );
    return this._mapToCalEvent(result);
  }

  async deleteEvent(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/calendar/events/${id}`)
    );
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
      location:     e.location ?? '',
      caseRef:      '',
      participants: [],
      notes:        '',
      reminder:     e.reminder_minutes?.[0]?.toString() ?? '0',
      day,
    };
  }
}
