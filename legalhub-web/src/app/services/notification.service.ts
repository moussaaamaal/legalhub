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

  private _map(raw: Record<string, unknown>): Notif {
    return {
      id:          String(raw['id']),
      category:    (raw['category']    as NotifCategory) ?? 'system',
      priority:    (raw['priority']    as NotifPriority) ?? 'normal',
      title:       String(raw['title'] ?? ''),
      body:        String(raw['body']  ?? raw['message'] ?? ''),
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
    const wasUnread = !notif.read;
    this._notifications.update(list => list.filter(n => n.id !== id));
    if (wasUnread) this._unreadCount.update(v => Math.max(0, v - 1));
    await firstValueFrom(this.http.delete(`${this.api}/api/notifications/${id}`));
  }

  // ── Sidebar badge counts ───────────────────────────────────

  async loadAllBadges(): Promise<void> {
    await Promise.all([
      this._loadActiveCases(),
      this._loadWeeklyEvents(),
    ]);
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
      const { monday, sunday } = this._currentWeekRange();
      const params = new HttpParams().set('from_date', monday);
      const events = await firstValueFrom(
        this.http.get<{ start_datetime: string }[]>(
          `${this.api}/api/calendar/events`, { params }
        )
      );
      const count = events.filter(e => e.start_datetime?.slice(0, 10) <= sunday).length;
      this._calendarCount.set(count);
    } catch { /* silently ignore */ }
  }

  private _currentWeekRange(): { monday: string; sunday: string } {
    const today = new Date();
    const day   = today.getDay();
    const diff  = day === 0 ? -6 : 1 - day;
    const mon   = new Date(today); mon.setDate(today.getDate() + diff);
    const sun   = new Date(mon);   sun.setDate(mon.getDate() + 6);
    const fmt   = (d: Date) => d.toISOString().slice(0, 10);
    return { monday: fmt(mon), sunday: fmt(sun) };
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
