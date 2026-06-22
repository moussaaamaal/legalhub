import { Component, signal, computed, effect, OnInit, OnDestroy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarService, CreateEventPayload } from '../../../services/calendar.service';
import { NotificationService } from '../../../services/notification.service';
import { CaseService } from '../../../services/case.service';
import { StaffService } from '../../../services/staff.service';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { SearchNavigatorService } from '../../../shared/services/search-navigator.service';

export interface MeetingRequest {
  id: string;
  client_name: string;
  email: string;
  preferred_date: string;
  preferred_time: string;
  message: string;
  status: string;
  meeting_type?: string;
  video_call_url?: string;
  client?: { id: string; first_name: string; last_name: string; email: string };
  case_file?: { id: string; title: string; case_number: string };
}

export type EventType      = 'hearing' | 'meeting' | 'deadline' | 'consultation' | 'court_date';
export type RecurrenceType = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface CalEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;        // "YYYY-MM-DD"
  startTime: string;   // "HH:MM"
  endTime: string;
  allDay: boolean;
  locationType: 'physical' | 'video' | 'phone' | '';
  location: string;
  caseRef: string;
  caseTitle: string;
  createdBy: string;
  participants: { id: string; name: string; type: string }[];
  notes: string;
  reminder: string;
  day: number;         // day-of-week Mon=0…Sun=6 (derived)
  isParticipant: boolean;
}

interface NewEventForm {
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  locationType: 'physical' | 'video' | 'phone' | '';
  location: string;
  caseRef: string;
  participants: { id: string; name: string }[];
  notes: string;
  reminder: string;
  recurrence: RecurrenceType;
  recurrenceLimitType: 'count' | 'until';
  recurrenceCount: number;
  recurrenceUntil: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [NgClass, FormsModule, HighlightPipe],
  templateUrl: './calendar.html'
})
export class Calendar implements OnInit, OnDestroy {

  private calendarSvc  = inject(CalendarService);
  private _tokenTimer?: ReturnType<typeof setInterval>;
  private notifSvc    = inject(NotificationService);
  private caseSvc     = inject(CaseService);
  private staffSvc    = inject(StaffService);
  private clientSvc   = inject(ClientService);
  private authSvc     = inject(AuthService);
  searchNav           = inject(SearchNavigatorService);

  canModifyEvent(ev: CalEvent): boolean {
    return ev.createdBy === this.authSvc.currentUser()?.id;
  }

  private _defaultParticipants: { id: string; name: string }[] = [];
  private _participantTypeMap = new Map<string, string>(); // userId → 'CLIENT' | 'TEAM_MEMBER'

  constructor() {
    // Keep sidebar calendar badge in sync with real upcoming-events count
    effect(() => {
      this.notifSvc.setCalendarCount(this.upcomingEvents().length);
    });
  }

  // ── Static today reference ────────────────────────────────
  // NOTE: _todayRef must NOT be private — the template accesses it for display labels.
  readonly _todayRef    = new Date();
  readonly todayStr     = this._isoDate(this._todayRef);
  readonly todayIndex   = (() => { const d = this._todayRef.getDay(); return d === 0 ? 6 : d - 1; })();
  readonly todayDayNum  = this._todayRef.getDate();
  private readonly _tomorrowStr = this._isoDate(new Date(this._todayRef.getTime() + 86_400_000));
  private readonly _today7Str   = this._isoDate(new Date(this._todayRef.getTime() + 6 * 86_400_000));

  // ── View + Navigation ─────────────────────────────────────
  currentView = signal<'day' | 'week' | 'month'>('week');
  navDate     = signal<Date>(new Date(this._todayRef));

  setView(v: string) { this.currentView.set(v.toLowerCase() as any); }

  prev() {
    const d = new Date(this.navDate());
    switch (this.currentView()) {
      case 'day':    d.setDate(d.getDate() - 1);   break;
      case 'week':   d.setDate(d.getDate() - 7);   break;
      case 'month':  d.setMonth(d.getMonth() - 1); break;
    }
    this.navDate.set(d);
  }

  next() {
    const d = new Date(this.navDate());
    switch (this.currentView()) {
      case 'day':    d.setDate(d.getDate() + 1);   break;
      case 'week':   d.setDate(d.getDate() + 7);   break;
      case 'month':  d.setMonth(d.getMonth() + 1); break;
    }
    this.navDate.set(d);
  }

  goToday() { this.navDate.set(new Date(this._todayRef)); }

  // ── Computed week structures ──────────────────────────────
  weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /** 7 Date objects Mon…Sun for the current nav week */
  weekDatesComputed = computed<Date[]>(() => {
    const d   = this.navDate();
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon);
      day.setDate(mon.getDate() + i);
      return day;
    });
  });

  /** ISO "YYYY-MM-DD" per day of the nav week */
  weekDatesISO = computed(() => this.weekDatesComputed().map(d => this._isoDate(d)));

  /** Display labels "Apr 27" */
  weekDatesLabels = computed(() =>
    this.weekDatesComputed().map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  );

  /** Index (0-6) of today inside the nav week, -1 if today is not visible */
  todayWeekIndex = computed(() => this.weekDatesISO().indexOf(this.todayStr));

  navLabel = computed(() => {
    const d    = this.navDate();
    const view = this.currentView();
    if (view === 'week') {
      const lbl  = this.weekDatesLabels();
      const year = this.weekDatesComputed()[6].getFullYear();
      return `${lbl[0]} – ${lbl[6]}, ${year}`;
    }
    if (view === 'day')
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  });

  monthLabel = computed(() =>
    this.navDate().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  );

  // ── Month grid ────────────────────────────────────────────
  monthGrid = computed<number[][]>(() => {
    const d     = this.navDate();
    const y     = d.getFullYear();
    const mo    = d.getMonth();
    const first = new Date(y, mo, 1);
    const last  = new Date(y, mo + 1, 0);
    const dim   = last.getDate();
    const prev  = new Date(y, mo, 0).getDate();
    const fdow  = first.getDay() === 0 ? 6 : first.getDay() - 1;

    const grid: number[][] = [];
    let week: number[] = [];
    for (let i = fdow - 1; i >= 0; i--) week.push(prev - i);
    for (let day = 1; day <= dim; day++) {
      week.push(day);
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length > 0) {
      let next = 1;
      while (week.length < 7) week.push(next++);
      grid.push(week);
    }
    return grid;
  });

  currentMonthDays = computed(() => {
    const d   = this.navDate();
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return new Set(Array.from({ length: dim }, (_, i) => i + 1));
  });

  navDateISO = computed(() => this._isoDate(this.navDate()));
  navDayNum  = computed(() => this.navDate().getDate());

  /** True only when the navigated month/year matches today's month/year */
  isTodayInNavMonth = computed(() => {
    const nav = this.navDate();
    return nav.getFullYear() === this._todayRef.getFullYear()
        && nav.getMonth()    === this._todayRef.getMonth();
  });

  hours = Array.from({ length: 17 }, (_, i) => {
    const h = i + 7;
    return { label: `${h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}`, hour: h };
  });

  // ── Event type config ─────────────────────────────────────
  typeConfig: Record<EventType, {
    label: string; icon: string;
    dot: string; cardCls: string; badgeCls: string;
    activeBorder: string; activeBg: string; iconBg: string; labelCls: string;
  }> = {
    hearing: {
      label: 'Hearing', icon: 'fa-solid fa-gavel',
      dot: 'bg-red-500', cardCls: 'bg-red-50 border-l-red-400 text-red-900',
      badgeCls: 'bg-red-100 text-red-700',
      activeBorder: 'border-red-400', activeBg: 'bg-red-50', iconBg: 'bg-red-500', labelCls: 'text-red-700'
    },
    meeting: {
      label: 'Meeting', icon: 'fa-solid fa-users',
      dot: 'bg-blue-500', cardCls: 'bg-blue-50 border-l-blue-400 text-blue-900',
      badgeCls: 'bg-blue-100 text-blue-700',
      activeBorder: 'border-blue-400', activeBg: 'bg-blue-50', iconBg: 'bg-blue-500', labelCls: 'text-blue-700'
    },
    deadline: {
      label: 'Deadline', icon: 'fa-solid fa-hourglass-half',
      dot: 'bg-amber-500', cardCls: 'bg-amber-50 border-l-amber-400 text-amber-900',
      badgeCls: 'bg-amber-100 text-amber-700',
      activeBorder: 'border-amber-400', activeBg: 'bg-amber-50', iconBg: 'bg-amber-500', labelCls: 'text-amber-700'
    },
    consultation: {
      label: 'Consultation', icon: 'fa-solid fa-comments',
      dot: 'bg-purple-500', cardCls: 'bg-purple-50 border-l-purple-400 text-purple-900',
      badgeCls: 'bg-purple-100 text-purple-700',
      activeBorder: 'border-purple-400', activeBg: 'bg-purple-50', iconBg: 'bg-purple-500', labelCls: 'text-purple-700'
    },
    court_date: {
      label: 'Court Date', icon: 'fa-solid fa-landmark',
      dot: 'bg-emerald-500', cardCls: 'bg-emerald-50 border-l-emerald-400 text-emerald-900',
      badgeCls: 'bg-emerald-100 text-emerald-700',
      activeBorder: 'border-emerald-400', activeBg: 'bg-emerald-50', iconBg: 'bg-emerald-500', labelCls: 'text-emerald-700'
    }
  };

  typeKeys: EventType[] = ['hearing', 'meeting', 'deadline', 'consultation', 'court_date'];

  // ── Filters & Search ──────────────────────────────────────
  activeFilters = signal<Set<EventType>>(new Set(this.typeKeys));

  private _searchSig = signal('');
  get searchStr()          { return this._searchSig(); }
  set searchStr(v: string) {
    this._searchSig.set(v);
    if (!v) { this.searchNav.reset(); return; }
    setTimeout(() => this.searchNav.scan(), 50);
  }
  clearSearch() { this.searchStr = ''; }

  isFilterActive(type: EventType): boolean { return this.activeFilters().has(type); }
  toggleFilter(type: EventType) {
    this.activeFilters.update(s => {
      const next = new Set(s);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }
  resetFilters() { this.activeFilters.set(new Set(this.typeKeys)); }

  visibleEvents = computed(() =>
    this.allEvents().filter(e => this.activeFilters().has(e.type))
  );

  filteredEvents = computed(() => {
    const q  = this._searchSig().toLowerCase().trim();
    const ev = this.visibleEvents();
    if (!q) return ev;
    return ev.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      e.caseTitle.toLowerCase().includes(q)
    );
  });

  // ── Event queries ─────────────────────────────────────────

  getEventsForWeekDay(dayIndex: number): CalEvent[] {
    const iso = this.weekDatesISO()[dayIndex];
    return this.filteredEvents().filter(e => e.date === iso);
  }

  getEventsForMonthDay(dayNum: number): CalEvent[] {
    if (!this.currentMonthDays().has(dayNum)) return [];
    const d       = this.navDate();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    return this.filteredEvents().filter(e => e.date === dateStr);
  }

  getEventsForDate(dateStr: string): CalEvent[] {
    return this.filteredEvents()
      .filter(e => e.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  getEventAtHour(dayIndex: number, hour: number): CalEvent | null {
    return this.getEventsForWeekDay(dayIndex).find(e =>
      parseInt(e.startTime.split(':')[0]) === hour
    ) ?? null;
  }

  getDayEventAtHour(hour: number): CalEvent | null {
    return this.getEventsForDate(this.navDateISO()).find(e =>
      parseInt(e.startTime.split(':')[0]) === hour
    ) ?? null;
  }

  private visibleDateRange = computed<{ start: string; end: string }>(() => {
    switch (this.currentView()) {
      case 'day':
        return { start: this.navDateISO(), end: this.navDateISO() };
      case 'week': {
        const dates = this.weekDatesISO();
        return { start: dates[0], end: dates[6] };
      }
      case 'month': {
        const d = this.navDate();
        const y = d.getFullYear();
        const m = d.getMonth();
        const lastDay = new Date(y, m + 1, 0).getDate();
        return {
          start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
          end:   `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      }
      default:
        return { start: this.navDateISO(), end: this.navDateISO() };
    }
  });

  typeCounts = computed(() => {
    const { start, end } = this.visibleDateRange();
    const counts = Object.fromEntries(this.typeKeys.map(t => [t, 0])) as Record<EventType, number>;
    for (const e of this.allEvents()) {
      if (e.date >= start && e.date <= end && (e.type in counts)) {
        counts[e.type]++;
      }
    }
    return counts;
  });

  countByType(type: EventType): number {
    return this.typeCounts()[type] ?? 0;
  }

  // ── Upcoming sidebar ──────────────────────────────────────

  todayEvents = computed(() => this.filteredEvents().filter(e => e.date === this.todayStr));

  upcomingEvents = computed(() =>
    [...this.filteredEvents()]
      .filter(e => e.date >= this.todayStr && e.date <= this._today7Str)
      .sort((a, b) => a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.startTime.localeCompare(b.startTime)
      )
      .slice(0, 8)
  );

  getUpcomingDateLabel(e: CalEvent): string {
    if (e.date === this.todayStr)     return 'Today';
    if (e.date === this._tomorrowStr) return 'Tomorrow';
    const d = new Date(e.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ── Sidebar type filter ───────────────────────────────────
  sidebarTypeFilter = signal<EventType | null>(null);

  toggleSidebarFilter(type: EventType) {
    this.sidebarTypeFilter.update(c => c === type ? null : type);
  }

  countUpcomingByType(type: EventType): number {
    return this.filteredEvents().filter(e =>
      e.type === type && e.date >= this.todayStr && e.date <= this._today7Str
    ).length;
  }

  sidebarUpcomingEvents = computed(() => {
    const tf = this.sidebarTypeFilter();
    return [...this.filteredEvents()]
      .filter(e => e.date >= this.todayStr && e.date <= this._today7Str)
      .filter(e => !tf || e.type === tf)
      .sort((a, b) => a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.startTime.localeCompare(b.startTime)
      )
      .slice(0, 8);
  });

  // ── Events signal ─────────────────────────────────────────
  allEvents = signal<CalEvent[]>([]);
  isLoading = signal(false);
  loadError = signal<string | null>(null);

  ngOnInit(): void {
    // Handle return from Google OAuth (popup or same-tab redirect)
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      if (window.opener) {
        window.close();
        return;
      }
      this.googleSynced.set(true);
      this.calendarSvc.setStoredGoogleStatus(true);
      this.triggerSync();
    }
    this.loadEvents();
    this._loadCases();
    this._loadStaff();
    this.loadMeetingRequests();

    // Refresh the JWT every 9 minutes so it never expires mid-session
    this._tokenTimer = setInterval(() => this._silentRefresh(), 9 * 60 * 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this._tokenTimer);
  }

  private async _silentRefresh(): Promise<void> {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) return;
    try {
      const res = await fetch(`http://localhost:8000/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (res.ok) {
        const data: { access_token: string } = await res.json();
        localStorage.setItem('access_token', data.access_token);
      }
    } catch { /* ignore — interceptor handles real failures */ }
  }

  private async loadEvents(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      this.allEvents.set(await this.calendarSvc.getEvents());
    } catch (err: any) {
      this.loadError.set(err?.error?.detail ?? err?.message ?? 'Failed to load events.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Sync ──────────────────────────────────────────────────
  googleSynced     = signal(this.calendarSvc.getStoredGoogleStatus());
  isSyncing        = signal(false);
  isConnecting     = signal(false);
  googleSyncResult = signal<{ synced: number; failed: number; total: number } | null>(null);
  googleSyncError  = signal<string | null>(null);

  async connectGoogle(): Promise<void> {
    this.isConnecting.set(true);
    this.googleSyncError.set(null);
    try {
      const { auth_url } = await this.calendarSvc.getGoogleAuthUrl();

      // Open OAuth in a popup so the user stays on this page
      const popup = window.open(auth_url, 'google_oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');

      if (!popup) {
        // Popup blocked — fall back to same-tab redirect
        window.location.href = auth_url;
        return;
      }

      // When the popup closes, attempt a sync to confirm the connection
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          this.isConnecting.set(false);
          this.triggerSync();
        }
      }, 500);

    } catch (err: any) {
      if (err?.status === 503) {
        this.googleSyncError.set('Google OAuth2 not configured. Add GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET to the backend .env.');
      } else {
        this.googleSyncError.set(err?.error?.detail ?? 'Failed to initiate Google connection.');
      }
      this.isConnecting.set(false);
    }
  }

  onGoogleToggle(): void {
    if (!this.googleSynced()) {
      this.connectGoogle();
    }
  }

  triggerSync() {
    this.isSyncing.set(true);
    this.googleSyncResult.set(null);
    this.googleSyncError.set(null);
    const doSync = async () => {
      try {
        const result = await this.calendarSvc.syncToGoogle();
        this.googleSynced.set(true);
        this.calendarSvc.setStoredGoogleStatus(true);
        this.googleSyncResult.set(result);
        if (result.failed > 0 && result.synced === 0) {
          this.googleSyncError.set(
            `Sync partiel : ${result.synced}/${result.total} événements synchronisés. Vérifiez les permissions Google.`
          );
        }
      } catch (err: any) {
        const detail: string = err?.error?.detail ?? err?.message ?? 'Sync failed';
        if (err?.status === 401) {
          this.googleSynced.set(false);
          this.calendarSvc.setStoredGoogleStatus(false);
          this.googleSyncError.set('Connexion Google Calendar expirée. Veuillez reconnecter Google Calendar.');
        } else if (err?.status === 400 && detail.toLowerCase().includes('not connected')) {
          this.googleSynced.set(false);
          this.calendarSvc.setStoredGoogleStatus(false);
          this.googleSyncError.set('Google Calendar not connected. Clic on "Connect Google".');
        } else {
          this.googleSyncError.set(detail);
        }
      }
      await this.loadEvents();
    };
    doSync().finally(() => this.isSyncing.set(false));
  }

  // ── Meeting Requests panel ────────────────────────────────
  showMeetingRequests  = signal(false);
  meetingRequests      = signal<MeetingRequest[]>([]);
  requestsLoading      = signal(false);
  acceptingId          = signal<string | null>(null);
  rejectingId          = signal<string | null>(null);
  requestError         = signal<string | null>(null);
  videoLinkPrompt      = signal<MeetingRequest | null>(null);
  videoLinkInput       = signal('');

  get pendingRequestCount() {
    return this.meetingRequests().filter(r => r.status === 'PENDING').length;
  }

  async loadMeetingRequests(): Promise<void> {
    this.requestsLoading.set(true);
    try {
      const raw = await this.calendarSvc.listMeetingRequests();
      this.meetingRequests.set(raw as unknown as MeetingRequest[]);
    } catch { /* non-blocking */ } finally {
      this.requestsLoading.set(false);
    }
  }

  acceptRequest(id: string): void {
    const req = this.meetingRequests().find(r => r.id === id);
    if (req?.meeting_type === 'VIDEO') {
      this.videoLinkInput.set('');
      this.videoLinkPrompt.set(req);
    } else {
      this._doAccept(id, {});
    }
  }

  async confirmAcceptWithLink(): Promise<void> {
    const req = this.videoLinkPrompt();
    if (!req) return;
    this.videoLinkPrompt.set(null);
    const link = this.videoLinkInput().trim();
    await this._doAccept(req.id, link ? { video_call_url: link } : {});
  }

  private async _doAccept(id: string, body: object): Promise<void> {
    this.acceptingId.set(id);
    this.requestError.set(null);
    try {
      await this.calendarSvc.acceptMeetingRequest(id, body);
      this.meetingRequests.update(list =>
        list.map(r => r.id === id ? { ...r, status: 'ACCEPTED' } : r)
      );
      await this.loadEvents();
    } catch (e: any) {
      this.requestError.set(e?.error?.detail ?? 'Failed to accept request.');
    } finally {
      this.acceptingId.set(null);
    }
  }

  async rejectRequest(id: string): Promise<void> {
    this.rejectingId.set(id);
    this.requestError.set(null);
    try {
      await this.calendarSvc.rejectMeetingRequest(id);
      this.meetingRequests.update(list =>
        list.map(r => r.id === id ? { ...r, status: 'REJECTED' } : r)
      );
    } catch (e: any) {
      this.requestError.set(e?.error?.detail ?? 'Failed to reject request.');
    } finally {
      this.rejectingId.set(null);
    }
  }

  // ── Event detail panel ────────────────────────────────────
  selectedEvent    = signal<CalEvent | null>(null);
  showEventDetail   = signal(false);
  isDeletingEvent   = signal(false);
  deleteEventError  = signal<string | null>(null);
  confirmDeleteEvent = signal(false);

  openEventDetail(ev: CalEvent, domEvent?: MouseEvent) {
    domEvent?.stopPropagation();
    this.selectedEvent.set(ev);
    this.deleteEventError.set(null);
    this.showEventDetail.set(true);
  }

  closeEventDetail() {
    this.showEventDetail.set(false);
    this.selectedEvent.set(null);
    this.confirmDeleteEvent.set(false);
  }

  async deleteSelectedEvent() {
    const ev = this.selectedEvent();
    if (!ev) return;
    this.isDeletingEvent.set(true);
    this.deleteEventError.set(null);
    try {
      await this.calendarSvc.deleteEvent(ev.id);
      this.allEvents.update(list => list.filter(e => e.id !== ev.id));
      this.closeEventDetail();
    } catch (err: any) {
      this.deleteEventError.set(err?.error?.detail ?? err?.message ?? 'Failed to delete event.');
      this.confirmDeleteEvent.set(false);
    } finally {
      this.isDeletingEvent.set(false);
    }
  }

  // ── Modal: New / Edit Event ───────────────────────────────
  showModal        = signal(false);
  modalStep        = signal<1 | 2>(1);
  isSubmitting     = signal(false);
  submitError      = signal<string | null>(null);
  participantInput = signal('');
  isEditMode       = signal(false);
  editingEventId   = signal<string | null>(null);

  newEvent: NewEventForm = this.emptyForm();

  locationTypes: { value: 'physical' | 'video' | 'phone' | ''; label: string; icon: string }[] = [
    { value: 'physical', label: 'In-Person', icon: 'fa-solid fa-location-dot' },
    { value: 'video',    label: 'Video',     icon: 'fa-solid fa-video' },
    { value: 'phone',    label: 'Phone',     icon: 'fa-solid fa-phone' },
    { value: '',         label: 'N/A',       icon: 'fa-solid fa-ban' },
  ];

  recurrenceOptions: { value: RecurrenceType; label: string; icon: string }[] = [
    { value: 'none',     label: 'None',      icon: 'fa-solid fa-ban' },
    { value: 'weekly',   label: 'Weekly',    icon: 'fa-solid fa-rotate' },
    { value: 'biweekly', label: 'Bi-weekly', icon: 'fa-solid fa-arrows-rotate' },
    { value: 'monthly',  label: 'Monthly',   icon: 'fa-solid fa-calendar-days' },
  ];

  cases                = this.caseSvc.cases;
  casesLoading         = signal(false);
  availableParticipants = signal<{ id: string; name: string }[]>([]);
  participantsLoading  = signal(false);

  getCaseLabel(caseId: string): string {
    if (!caseId) return '';
    const c = this.caseSvc.getCaseById(caseId);
    return c ? `${c.caseNumber} — ${c.title}` : caseId;
  }

  onStartTimeChange(startTime: string) {
    this.newEvent.startTime = startTime;
    const [h, m] = startTime.split(':').map(Number);
    this.newEvent.endTime = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  async onCaseRefChange(caseId: string) {
    this.newEvent.caseRef      = caseId;
    this.newEvent.participants = [];
    this.participantsLoading.set(true);
    try {
      if (caseId) {
        const raw = await this.calendarSvc.getAvailableParticipants(caseId);
        for (const p of raw) this._participantTypeMap.set(p.user_id, p.participant_type);
        this.availableParticipants.set(
          raw
            .map(p => ({ id: p.user_id, name: p.full_name || p.email || p.user_id }))
            .filter(m => m.id && m.name)
        );
      } else {
        this.availableParticipants.set([...this._defaultParticipants]);
      }
    } finally {
      this.participantsLoading.set(false);
    }
  }

  private async _loadCases() {
    if (this.caseSvc.cases().length > 0) return;
    this.casesLoading.set(true);
    try { await this.caseSvc.loadCases(); } finally { this.casesLoading.set(false); }
  }

  private async _loadStaff() {
    if (this.staffSvc.staff().length === 0) await this.staffSvc.loadStaff();
    await this._loadDefaultParticipants();
  }

  private async _loadDefaultParticipants(): Promise<void> {
    try {
      const [members] = await Promise.all([
        this.calendarSvc.getAvailableParticipants(),
        this.clientSvc.clients().length === 0 ? this.clientSvc.loadClients() : Promise.resolve(),
      ]);
      const seen = new Set<string>();
      const list: { id: string; name: string }[] = [];
      for (const m of members) {
        if (m.user_id && !seen.has(m.user_id)) {
          seen.add(m.user_id);
          this._participantTypeMap.set(m.user_id, m.participant_type);
          list.push({ id: m.user_id, name: m.full_name || m.email || m.user_id });
        }
      }
      for (const c of this.clientSvc.clients()) {
        if (c.userId && !seen.has(c.userId)) {
          seen.add(c.userId);
          this._participantTypeMap.set(c.userId, 'CLIENT');
          list.push({ id: c.userId, name: c.name });
        }
      }
      this._defaultParticipants = list.filter(m => m.id && m.name);
    } catch {
      this._defaultParticipants = this.staffSvc.staff().map(s => ({ id: s.id, name: s.name }));
    }
    this.availableParticipants.set([...this._defaultParticipants]);
  }

  resolveParticipantType(p: { id: string; type: string }): string {
    return this._participantTypeMap.get(p.id) ?? p.type;
  }

  reminderOptions = [
    { value: '0',    label: 'No reminder' },
    { value: '15',   label: '15 minutes before' },
    { value: '30',   label: '30 minutes before' },
    { value: '60',   label: '1 hour before' },
    { value: '1440', label: '1 day before' },
  ];

  get selectedTypeCfg()   { return this.typeConfig[this.newEvent.type]; }
  get isFormValid()        { return this.newEvent.title.trim().length > 0 && this.newEvent.date.length > 0; }
  get showRecurrenceLimit(){ return this.newEvent.recurrence !== 'none'; }

  emptyForm(): NewEventForm {
    const oneMonth = new Date(this._todayRef);
    oneMonth.setMonth(oneMonth.getMonth() + 1);
    return {
      title: '', type: 'meeting', date: this.todayStr,
      startTime: '09:00', endTime: '10:00', allDay: false,
      locationType: 'physical', location: '', caseRef: '',
      participants: [], notes: '', reminder: '15',
      recurrence: 'none', recurrenceLimitType: 'count',
      recurrenceCount: 4, recurrenceUntil: this._isoDate(oneMonth),
    };
  }

  /**
   * Open the New Event modal.
   * @param date     Optional ISO date "YYYY-MM-DD" to pre-fill (e.g. clicked cell).
   * @param hour     Optional integer hour (7–18) to pre-fill start/end times.
   */
  openModal(date?: string, hour?: number) {
    this.newEvent = this.emptyForm();
    if (date) this.newEvent.date = date;
    if (hour !== undefined) {
      this.newEvent.startTime = String(hour).padStart(2, '0') + ':00';
      this.newEvent.endTime   = String(Math.min(hour + 1, 23)).padStart(2, '0') + ':00';
    }
    this.isEditMode.set(false);
    this.editingEventId.set(null);
    this.availableParticipants.set([...this._defaultParticipants]);
    this.modalStep.set(1);
    this.isSubmitting.set(false);
    this.submitError.set(null);
    this.showModal.set(true);
  }

  /** Open the modal pre-filled with an existing event for editing. */
  async openEditModal(ev: CalEvent) {
    const preSelected = ev.participants.map(p => ({ id: p.id, name: p.name }));

    this.newEvent = {
      title:               ev.title,
      type:                ev.type,
      date:                ev.date,
      startTime:           ev.startTime,
      endTime:             ev.endTime,
      allDay:              ev.allDay,
      locationType:        ev.locationType,
      location:            ev.location,
      caseRef:             ev.caseRef,
      participants:        preSelected,
      notes:               ev.notes,
      reminder:            ev.reminder,
      recurrence:          'none',
      recurrenceLimitType: 'count',
      recurrenceCount:     4,
      recurrenceUntil:     this._isoDate(new Date(this._todayRef.getTime() + 30 * 86_400_000)),
    };
    this.isEditMode.set(true);
    this.editingEventId.set(ev.id);
    this.modalStep.set(1);
    this.isSubmitting.set(false);
    this.submitError.set(null);
    this.closeEventDetail();
    this.showModal.set(true);

    // Load the case's available participants, then restore the pre-selected ones
    // (onCaseRefChange resets participants to [], so we re-apply after it resolves)
    if (ev.caseRef) {
      await this.onCaseRefChange(ev.caseRef);
      this.newEvent.participants = preSelected;
    } else {
      this.availableParticipants.set([...this._defaultParticipants]);
    }
  }

  /** Returns the ISO date "YYYY-MM-DD" for a day-number in the current nav month,
   *  or undefined if the day is outside the current month (overflow cell). */
  getMonthDayISO(dayNum: number): string | undefined {
    if (!this.currentMonthDays().has(dayNum)) return undefined;
    const d = this.navDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }
  closeModal() {
    this.showModal.set(false);
    this.isEditMode.set(false);
    this.editingEventId.set(null);
  }
  addAnother() {
    this.newEvent = this.emptyForm();
    this.isEditMode.set(false);
    this.editingEventId.set(null);
    this.availableParticipants.set([...this._defaultParticipants]);
    this.modalStep.set(1);
    this.submitError.set(null);
  }

  addParticipant(id: string) {
    if (!id) return;
    const member = this.availableParticipants().find(m => m.id === id);
    if (member && !this.newEvent.participants.some(p => p.id === id))
      this.newEvent.participants = [...this.newEvent.participants, member];
  }

  removeParticipant(i: number) {
    this.newEvent.participants = this.newEvent.participants.filter((_, idx) => idx !== i);
  }

  async submitEvent() {
    if (!this.isFormValid) return;
    this.isSubmitting.set(true);
    this.submitError.set(null);
    try {
      const payload = this._buildPayload(this.newEvent);
      if (this.isEditMode() && this.editingEventId()) {
        const updated = await this.calendarSvc.updateEvent(this.editingEventId()!, payload);
        this.allEvents.update(list => list.map(e => e.id === updated.id ? updated : e));
      } else {
        await this.calendarSvc.createEvent(payload);
        // Reload all events: recurring creation generates N occurrences server-side
        const fresh = await this.calendarSvc.getEvents();
        this.allEvents.set(fresh);
      }
      this.modalStep.set(2);
    } catch (err: any) {
      const raw = err?.error?.detail ?? err?.message ?? 'Failed to save event.';
      this.submitError.set(Array.isArray(raw) ? (raw[0]?.msg ?? String(raw)) : raw);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatTime(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h > 12 ? h - 12 : h || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // ── Private helpers ───────────────────────────────────────

  private _buildPayload(form: NewEventForm): CreateEventPayload {
    const payload: CreateEventPayload = {
      title:          form.title,
      event_type:     form.type.toUpperCase(),
      start_datetime: `${form.date}T${form.startTime}:00`,
      end_datetime:   !form.allDay ? `${form.date}T${form.endTime}:00` : undefined,
      is_video_call:  form.locationType === 'video',
      recurrence:     form.recurrence,
    };

    if (form.caseRef) payload.case_id = form.caseRef;
    if (form.location) {
      payload.location = form.location;
      if (form.locationType === 'video') payload.video_call_url = form.location;
    }

    if (form.reminder && form.reminder !== '0')
      payload.reminder_minutes = [parseInt(form.reminder, 10)];

    if (form.participants.length > 0)
      payload.participant_ids = form.participants.map(p => p.id);

    if (form.recurrence !== 'none') {
      if (form.recurrenceLimitType === 'count')
        payload.recurrence_count = form.recurrenceCount;
      else
        payload.recurrence_until = form.recurrenceUntil;
    }

    return payload;
  }

  private _isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
