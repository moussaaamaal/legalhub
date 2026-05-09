import { Component, signal, computed, effect, OnInit, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarService, CreateEventPayload } from '../../../services/calendar.service';
import { NotificationService } from '../../../services/notification.service';

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
  participants: string[];
  notes: string;
  reminder: string;
  day: number;         // day-of-week Mon=0…Sun=6 (derived)
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
  participants: string[];
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
  imports: [NgClass, FormsModule],
  templateUrl: './calendar.html'
})
export class Calendar implements OnInit {

  private calendarSvc = inject(CalendarService);
  private notifSvc    = inject(NotificationService);

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
  currentView = signal<'day' | 'week' | 'month' | 'agenda'>('week');
  navDate     = signal<Date>(new Date(this._todayRef));

  setView(v: string) { this.currentView.set(v.toLowerCase() as any); }

  prev() {
    const d = new Date(this.navDate());
    switch (this.currentView()) {
      case 'day':    d.setDate(d.getDate() - 1);   break;
      case 'week':   d.setDate(d.getDate() - 7);   break;
      case 'month':  d.setMonth(d.getMonth() - 1); break;
      case 'agenda': d.setDate(d.getDate() - 7);   break;
    }
    this.navDate.set(d);
  }

  next() {
    const d = new Date(this.navDate());
    switch (this.currentView()) {
      case 'day':    d.setDate(d.getDate() + 1);   break;
      case 'week':   d.setDate(d.getDate() + 7);   break;
      case 'month':  d.setMonth(d.getMonth() + 1); break;
      case 'agenda': d.setDate(d.getDate() + 7);   break;
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

  /** Agenda: 7 days from navDate */
  agendaDays = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d       = new Date(this.navDate());
      d.setDate(d.getDate() + i);
      const dateStr = this._isoDate(d);
      const label   = dateStr === this.todayStr ? 'Today'
                    : dateStr === this._tomorrowStr ? 'Tomorrow' : '';
      return {
        label,
        date:    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        dateStr,
      };
    })
  );

  hours = Array.from({ length: 12 }, (_, i) => {
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
  get searchStr()              { return this._searchSig(); }
  set searchStr(v: string)     { this._searchSig.set(v); }

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
      e.caseRef.toLowerCase().includes(q)
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

  countByType(type: EventType): number {
    return this.allEvents().filter(e => e.type === type).length;
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

  ngOnInit(): void { this.loadEvents(); }

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
  googleSynced  = signal(true);
  outlookSynced = signal(false);
  isSyncing     = signal(false);

  triggerSync() {
    this.isSyncing.set(true);
    this.loadEvents().finally(() => this.isSyncing.set(false));
  }

  // ── Event detail panel ────────────────────────────────────
  selectedEvent    = signal<CalEvent | null>(null);
  showEventDetail  = signal(false);
  isDeletingEvent  = signal(false);
  deleteEventError = signal<string | null>(null);

  openEventDetail(ev: CalEvent, domEvent?: MouseEvent) {
    domEvent?.stopPropagation();
    this.selectedEvent.set(ev);
    this.deleteEventError.set(null);
    this.showEventDetail.set(true);
  }

  closeEventDetail() {
    this.showEventDetail.set(false);
    this.selectedEvent.set(null);
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
    } finally {
      this.isDeletingEvent.set(false);
    }
  }

  // ── Modal: New Event ─────────────────────────────────────
  showModal        = signal(false);
  modalStep        = signal<1 | 2>(1);
  isSubmitting     = signal(false);
  submitError      = signal<string | null>(null);
  participantInput = signal('');

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

  cases = [
    'CASE-2024-001 — Smith vs. Johnson',
    'CASE-2024-003 — Martinez Family Trust',
    'CASE-2024-005 — Anderson Filing',
    'CASE-2024-007 — Thompson Real Estate',
    'CASE-2024-009 — Wilson Medical Malpractice',
    'CASE-2024-012 — Davis Employment',
  ];

  teamMembers = ['Sarah Williams', 'Michael Chen', 'Jennifer Lopez', 'Robert Taylor', 'Amanda Foster'];

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
    // Pre-fill from calendar cell click
    if (date) this.newEvent.date = date;
    if (hour !== undefined) {
      this.newEvent.startTime = String(hour).padStart(2, '0') + ':00';
      this.newEvent.endTime   = String(Math.min(hour + 1, 23)).padStart(2, '0') + ':00';
    }
    this.participantInput.set('');
    this.modalStep.set(1);
    this.isSubmitting.set(false);
    this.submitError.set(null);
    this.showModal.set(true);
  }

  /** Returns the ISO date "YYYY-MM-DD" for a day-number in the current nav month,
   *  or undefined if the day is outside the current month (overflow cell). */
  getMonthDayISO(dayNum: number): string | undefined {
    if (!this.currentMonthDays().has(dayNum)) return undefined;
    const d = this.navDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }
  closeModal() { this.showModal.set(false); }
  addAnother() {
    this.newEvent = this.emptyForm();
    this.participantInput.set('');
    this.modalStep.set(1);
    this.submitError.set(null);
  }

  addParticipant(name: string) {
    const n = name.trim();
    if (n && !this.newEvent.participants.includes(n))
      this.newEvent.participants = [...this.newEvent.participants, n];
    this.participantInput.set('');
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
      const created = await this.calendarSvc.createEvent(payload);
      this.allEvents.update(list => [...list, created]);
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

    if (form.location) {
      payload.location = form.location;
      if (form.locationType === 'video') payload.video_call_url = form.location;
    }

    if (form.reminder && form.reminder !== '0')
      payload.reminder_minutes = [parseInt(form.reminder, 10)];

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
