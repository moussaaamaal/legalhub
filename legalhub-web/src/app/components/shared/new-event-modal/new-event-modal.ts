import { Component, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarService, CreateEventPayload } from '../../../services/calendar.service';

type EventType      = 'hearing' | 'meeting' | 'deadline' | 'consultation' | 'court_date';
type RecurrenceType = 'none' | 'weekly' | 'biweekly' | 'monthly';

interface NewEventForm {
  title: string; type: EventType; date: string;
  startTime: string; endTime: string; allDay: boolean;
  locationType: 'physical' | 'video' | 'phone' | '';
  location: string; caseRef: string; participants: string[];
  notes: string; reminder: string; recurrence: RecurrenceType;
  recurrenceLimitType: 'count' | 'until';
  recurrenceCount: number; recurrenceUntil: string;
}

@Component({
  selector: 'app-new-event-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './new-event-modal.html',
})
export class NewEventModal {
  private calendarSvc = inject(CalendarService);

  private readonly _todayRef = new Date();
  readonly todayStr = this._isoDate(this._todayRef);
  googleSynced = signal(true);

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
    },
  };

  typeKeys: EventType[] = ['hearing', 'meeting', 'deadline', 'consultation', 'court_date'];

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

  showModal        = signal(false);
  modalStep        = signal<1 | 2>(1);
  isSubmitting     = signal(false);
  submitError      = signal<string | null>(null);
  participantInput = signal('');

  newEvent: NewEventForm = this.emptyForm();

  get selectedTypeCfg()    { return this.typeConfig[this.newEvent.type]; }
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

  openModal(date?: string, hour?: number) {
    this.newEvent = this.emptyForm();
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
      await this.calendarSvc.createEvent(payload);
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
