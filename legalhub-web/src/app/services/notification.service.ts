import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export type NotifCategory = 'deadline' | 'document' | 'assignment' | 'payment' | 'system';
export type NotifPriority = 'urgent' | 'high' | 'normal';

export interface Notif {
  id:           string;
  category:     NotifCategory;
  priority:     NotifPriority;
  title:        string;
  body:         string;
  meta:         string;
  time:         Date;
  read:         boolean;
  actionLabel?: string;
}

export interface BadgeCounts {
  unreadNotifications?: number;
  cases?:               number;
  calendar?:            number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  private _notifications  = signal<Notif[]>([]);
  private _loading        = signal(false);
  private _unreadCount    = signal<number>(0);
  private _casesCount     = signal<number>(0);
  private _calendarCount  = signal<number>(0);

  readonly notifications  = this._notifications.asReadonly();
  readonly loading        = this._loading.asReadonly();
  readonly unreadCount    = this._unreadCount.asReadonly();
  readonly casesCount     = this._casesCount.asReadonly();
  readonly calendarCount  = this._calendarCount.asReadonly();

  // ── Notification list ──────────────────────────────────────

  private _typeToCategory(type: string): NotifCategory {
    switch (type?.toUpperCase()) {
      case 'CASE_UPDATE':
      case 'TASK_ASSIGNED':
      case 'MEETING_REQUEST':   return 'assignment';
      case 'HEARING_REMINDER':  return 'deadline';
      case 'DOCUMENT_SHARED':   return 'document';
      case 'INVOICE_DUE':       return 'payment';
      default:                  return 'system';
    }
  }

  private _typeToPriority(type: string): NotifPriority {
    switch (type?.toUpperCase()) {
      case 'HEARING_REMINDER':  return 'urgent';
      case 'INVOICE_DUE':       return 'urgent';
      case 'TASK_ASSIGNED':     return 'high';
      case 'MEETING_REQUEST':   return 'high';
      default:                  return 'normal';
    }
  }

  private _parseBody(body: string): string {
    try {
      const data = JSON.parse(body);
      if (data && typeof data === 'object') {
        const parts: string[] = [];
        if (data['event_type'])    parts.push(String(data['event_type']));
        if (data['date_display'])  parts.push(String(data['date_display']));
        if (data['amount'])        parts.push(String(data['amount']));
        if (data['document_name']) parts.push(String(data['document_name']));
        if (data['case_title'])    parts.push(String(data['case_title']));
        if (parts.length) return parts.join(' · ');
        const first = Object.values(data).find(v => typeof v === 'string' && v.length > 3);
        if (first) return String(first);
      }
    } catch { /* not JSON — return as-is */ }
    return body;
  }

  private _map(raw: Record<string, unknown>): Notif {
    const type    = String(raw['type'] ?? '');
    const rawBody = String(raw['body'] ?? raw['message'] ?? '');
    return {
      id:          String(raw['id']),
      category:    (raw['category'] as NotifCategory) ?? this._typeToCategory(type),
      priority:    (raw['priority'] as NotifPriority) ?? this._typeToPriority(type),
      title:       String(raw['title'] ?? ''),
      body:        this._parseBody(rawBody),
      meta:        String(raw['meta']  ?? ''),
      time:        raw['created_at'] ? new Date(String(raw['created_at'])) : new Date(),
      read:        Boolean(raw['is_read'] ?? false),
      actionLabel: raw['action_label'] ? String(raw['action_label']) : undefined,
    };
  }

  async loadNotifications(): Promise<void> {
    this._loading.set(true);
    try {
      const raw = await firstValueFrom(
        this.http.get<Record<string, unknown>[]>(`${this.api}/api/notifications`)
      );
      const notifs = raw.map(r => this._map(r));
      this._notifications.set(notifs);
      this._unreadCount.set(notifs.filter(n => !n.read).length);
    } finally {
      this._loading.set(false);
    }
  }

  async markRead(id: string): Promise<void> {
    const notif = this._notifications().find(n => n.id === id);
    if (!notif || notif.read) return;
    this._notifications.update(list => list.map(n => n.id === id ? { ...n, read: true } : n));
    this._unreadCount.update(v => Math.max(0, v - 1));
    await firstValueFrom(this.http.patch(`${this.api}/api/notifications/${id}/read`, {}));
  }

  async markAllRead(): Promise<void> {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
    this._unreadCount.set(0);
    await firstValueFrom(this.http.patch(`${this.api}/api/notifications/read-all`, {}));
  }

  async dismiss(id: string): Promise<void> {
    const notif = this._notifications().find(n => n.id === id);
    if (!notif) return;
    // Mark as read locally and on server (no DELETE endpoint exists)
    this._notifications.update(list => list.filter(n => n.id !== id));
    if (!notif.read) {
      this._unreadCount.update(v => Math.max(0, v - 1));
      await firstValueFrom(this.http.patch(`${this.api}/api/notifications/${id}/read`, {})).catch(() => {});
    }
  }

  // ── Sidebar badge counts ───────────────────────────────────

  async loadAllBadges(): Promise<void> {
    await Promise.all([
      this._loadActiveCases(),
      this._loadWeeklyEvents(),
      this._loadUnreadCount(),
    ]);
  }

  private async _loadUnreadCount(): Promise<void> {
    try {
      const raw = await firstValueFrom(
        this.http.get<Record<string, unknown>[]>(`${this.api}/api/notifications`)
      );
      this._unreadCount.set(raw.filter(n => !n['is_read']).length);
    } catch { /* silently ignore */ }
  }

  private async _loadActiveCases(): Promise<void> {
    try {
      const cases = await firstValueFrom(
        this.http.get<{ status: string }[]>(`${this.api}/api/cases`)
      );
      const active = new Set(['NEW', 'INVESTIGATION', 'PRE_TRIAL', 'TRIAL', 'APPEAL']);
      this._casesCount.set(cases.filter(c => active.has(c.status)).length);
    } catch { /* silently ignore */ }
  }

  private async _loadWeeklyEvents(): Promise<void> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const in7   = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const params = new HttpParams().set('from_date', today);
      const events = await firstValueFrom(
        this.http.get<{ start_datetime: string }[]>(
          `${this.api}/api/calendar/events`, { params }
        )
      );
      const count = events.filter(e => {
        const d = e.start_datetime?.slice(0, 10);
        return d >= today && d <= in7;
      }).length;
      this._calendarCount.set(count);
    } catch { /* silently ignore */ }
  }

  setUnreadCount(n: number)   { this._unreadCount.set(Math.max(0, n)); }
  setCasesCount(n: number)    { this._casesCount.set(Math.max(0, n)); }
  setCalendarCount(n: number) { this._calendarCount.set(Math.max(0, n)); }

  setBadges(counts: BadgeCounts) {
    if (counts.unreadNotifications != null) this.setUnreadCount(counts.unreadNotifications);
    if (counts.cases               != null) this.setCasesCount(counts.cases);
    if (counts.calendar            != null) this.setCalendarCount(counts.calendar);
  }

  decrementUnread(by = 1) {
    this._unreadCount.update(v => Math.max(0, v - by));
  }
}
