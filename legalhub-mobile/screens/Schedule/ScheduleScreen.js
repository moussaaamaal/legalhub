import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { calendarAPI, casesAPI } from '../../services/api';

const COLORS = {
  pink: '#DB2777', pinkLight: '#EC4899', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray300: '#D1D5DB', gray400: '#9CA3AF',
  gray500: '#6B7280', gray600: '#4B5563',
};

// Keys must match backend EventType enum values exactly
const EVENT_TYPES = [
  { key: 'HEARING',      label: 'Court Hearing',   icon: 'gavel',          color: '#DC2626', bg: '#FEF2F2' },
  { key: 'MEETING',      label: 'Client Meeting',  icon: 'users',          color: '#2563EB', bg: '#EFF6FF' },
  { key: 'DEADLINE',     label: 'Filing Deadline', icon: 'file-signature', color: '#D97706', bg: '#FFFBEB' },
  { key: 'CONSULTATION', label: 'Consultation',    icon: 'phone',          color: '#059669', bg: '#F0FDF4' },
  { key: 'COURT_DATE',   label: 'Court Date',      icon: 'balance-scale',  color: '#7C3AED', bg: '#FAF5FF' },
];

const TIMES = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
               '12:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00',
               '17:00', '18:00'];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// Build a calendar grid (same logic as CalendarScreen)
const buildCalendarGrid = (year, month) => {
  const first       = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = first - 1; i >= 0; i--) cells.push({ d: String(daysInPrev - i), prev: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d: String(d), cur: true });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ d: String(next++), next: true });
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

const fmtDate = (d) => `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}`;

// Inline calendar picker — same UX as CalendarScreen but themed pink
function MiniCalPicker({ selectedDate, onSelect, onClose }) {
  const [viewYear,  setViewYear]  = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const grid = buildCalendarGrid(viewYear, viewMonth);
  const prevM = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextM = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const today = new Date();

  return (
    <View style={cp.picker}>
      <View style={cp.header}>
        <TouchableOpacity onPress={prevM} style={cp.navBtn}>
          <FontAwesome5 name="chevron-left"  size={13} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={cp.title}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextM} style={cp.navBtn}>
          <FontAwesome5 name="chevron-right" size={13} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <View style={{ padding: 8 }}>
        <View style={cp.row}>
          {DAYS.map(d => <Text key={d} style={cp.dayLabel}>{d}</Text>)}
        </View>
        {grid.map((row, ri) => (
          <View key={ri} style={cp.row}>
            {row.map((cell, ci) => {
              const isSelected = cell.cur &&
                Number(cell.d) === selectedDate.getDate() &&
                viewMonth === selectedDate.getMonth() &&
                viewYear  === selectedDate.getFullYear();
              const isToday = cell.cur &&
                Number(cell.d) === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear  === today.getFullYear();
              return (
                <TouchableOpacity
                  key={ci}
                  style={[cp.cell,
                    isSelected && { backgroundColor: COLORS.pink },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: COLORS.pink },
                  ]}
                  disabled={!cell.cur}
                  onPress={() => {
                    onSelect(new Date(viewYear, viewMonth, Number(cell.d)));
                    onClose();
                  }}
                >
                  <Text style={[cp.cellText,
                    (cell.prev || cell.next) && { color: COLORS.gray300 },
                    isSelected && { color: COLORS.white, fontWeight: '700' },
                  ]}>
                    {cell.d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const cp = StyleSheet.create({
  picker:   { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.pink, paddingHorizontal: 12, paddingVertical: 10 },
  navBtn:   { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  title:    { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  row:      { flexDirection: 'row' },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: COLORS.gray500, paddingVertical: 4 },
  cell:     { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, margin: 1 },
  cellText: { fontSize: 12, color: COLORS.dark },
});

export default function ScheduleScreen({ navigation }) {
  const [form, setForm] = useState({
    title: '', event_type: '', case_id: null, location: '',
    is_video_call: false, video_call_url: '',
    date: '', time: '', duration: '60',
    reminders: ['30'], recurrence: 'none',
    limitType: 'count',
    recurrence_count: '4',
  });
  const [untilDate,    setUntilDate]    = useState(new Date());
  const [showUntilCal, setShowUntilCal] = useState(false);
  const [selectedDay,  setSelectedDay]  = useState(0);
  const [cases,        setCases]        = useState([]);
  const [loading,      setLoading]      = useState(false);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Generate a week starting from today
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  // Pre-select today's date
  useEffect(() => {
    update('date', weekDays[0].toISOString().split('T')[0]);
  }, []);

  // Load real cases from API
  useEffect(() => {
    casesAPI.list().then(data => setCases(data)).catch(() => {});
  }, []);

  const buildPayload = () => {
    if (!form.title.trim()) throw new Error('Event title is required.');
    if (!form.event_type)   throw new Error('Please select an event type.');
    if (!form.date)         throw new Error('Please select a date.');
    if (!form.time)         throw new Error('Please select a start time.');

    const [hour, minute] = form.time.split(':').map(Number);
    const start = new Date(form.date);
    start.setHours(hour, minute, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + parseInt(form.duration, 10));

    const payload = {
      title:            form.title.trim(),
      event_type:       form.event_type,
      start_datetime:   start.toISOString(),
      end_datetime:     end.toISOString(),
      reminder_minutes: form.reminders.map(v => parseInt(v, 10)),
      recurrence:       form.recurrence || 'none',
      is_video_call:    form.is_video_call,
    };

    if (form.recurrence !== 'none') {
      if (form.limitType === 'count') {
        const count = parseInt(form.recurrence_count, 10);
        if (!count || count < 1) throw new Error('Enter a valid number of occurrences (≥ 1).');
        if (count > 104)         throw new Error('Maximum 104 occurrences.');
        payload.recurrence_count = count;
      } else {
        const untilIso = untilDate.toISOString().split('T')[0];
        if (untilIso <= form.date)
          throw new Error('Recurrence end date must be after the start date.');
        payload.recurrence_until = untilIso;
      }
    }

    if (form.location.trim())                        payload.location      = form.location.trim();
    if (form.case_id)                                payload.case_id       = form.case_id;
    if (form.is_video_call && form.video_call_url.trim())
                                                     payload.video_call_url = form.video_call_url.trim();

    return payload;
  };

  const handleSubmit = async () => {
    let payload;
    try {
      payload = buildPayload();
    } catch (err) {
      Alert.alert('Validation Error', err.message);
      return;
    }

    setLoading(true);
    try {
      await calendarAPI.createEvent(payload);
      Alert.alert('Success', 'Event scheduled successfully!', [
        { text: 'OK', onPress: () => navigation?.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to schedule event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.pink} />

      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Schedule Event</Text>
          <View style={s.backBtn} />
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Calendar Strip */}
        <View style={s.calStrip}>
          <View style={s.monthRow}>
            <FontAwesome5 name="chevron-left" size={13} color={COLORS.pink} />
            <Text style={s.monthText}>{today.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <FontAwesome5 name="chevron-right" size={13} color={COLORS.pink} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {weekDays.map((d, i) => {
              const isToday    = i === 0;
              const isSelected = selectedDay === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.dayBtn, isSelected && s.dayBtnSelected]}
                  onPress={() => {
                    setSelectedDay(i);
                    update('date', d.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={[s.dayName, isSelected && s.dayNameSelected]}>{DAYS[d.getDay()]}</Text>
                  <Text style={[s.dayNum,  isSelected && s.dayNumSelected]}>{d.getDate()}</Text>
                  {isToday && <View style={[s.todayDot, isSelected && { backgroundColor: COLORS.white }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Event Type */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Event Type</Text>
          <View style={s.typeGrid}>
            {EVENT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[s.typeCard, { backgroundColor: t.bg, borderColor: form.event_type === t.key ? t.color : '#E5E7EB' }]}
                onPress={() => update('event_type', t.key)}
              >
                <FontAwesome5 name={t.icon} size={18} color={t.color} />
                <Text style={[s.typeLabel, { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Event Details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Event Details</Text>
          <Field label="Event Title *" placeholder="e.g., Criminal Court Hearing" value={form.title} onChange={v => update('title', v)} icon="calendar-alt" />
          <Field label="Location / Room"   placeholder="e.g., Courtroom 204, City Hall" value={form.location} onChange={v => update('location', v)} icon="map-marker-alt" />

          {/* Video call toggle */}
          <View style={s.videoRow}>
            <View style={s.videoLeft}>
              <View style={[s.videoIconWrap, form.is_video_call && { backgroundColor: COLORS.pink + '22' }]}>
                <FontAwesome5 name="video" size={14} color={form.is_video_call ? COLORS.pink : COLORS.gray500} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.videoTitle}>Video Call</Text>
                <Text style={s.videoSub}>This event takes place online</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.toggle, form.is_video_call && s.toggleOn]}
              onPress={() => update('is_video_call', !form.is_video_call)}
            >
              <View style={[s.knob, form.is_video_call && s.knobOn]} />
            </TouchableOpacity>
          </View>

          {form.is_video_call && (
            <View style={{ marginTop: 10 }}>
              <Field label="Video Call URL" placeholder="https://meet.google.com/..." value={form.video_call_url} onChange={v => update('video_call_url', v)} icon="link" />
            </View>
          )}

          {cases.length > 0 && (
            <>
              <Text style={s.label}>Related Case</Text>
              <View style={s.caseList}>
                {[{ id: null, title: 'None', case_number: '' }, ...cases].map(c => {
                  const label = c.id ? `${c.case_number} — ${c.title}` : 'None';
                  const isActive = form.case_id === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id ?? 'none'}
                      style={[s.caseRow, isActive && s.caseRowActive]}
                      onPress={() => update('case_id', c.id)}
                    >
                      <View style={[s.radio, isActive && s.radioActive]}>
                        {isActive && <View style={s.radioDot} />}
                      </View>
                      <Text style={[s.caseText, isActive && s.caseTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Date & Time */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Date & Time</Text>

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Date</Text>
              <View style={s.dateBtn}>
                <FontAwesome5 name="calendar" size={14} color={COLORS.pink} />
                <Text style={s.dateBtnText}>
                  {form.date || weekDays[selectedDay]?.toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.label}>Duration</Text>
              <View style={s.durationRow}>
                {['30', '60', '90', '120'].map(d => (
                  <TouchableOpacity key={d} style={[s.durBtn, form.duration === d && s.durBtnActive]} onPress={() => update('duration', d)}>
                    <Text style={[s.durText, form.duration === d && s.durTextActive]}>{d}m</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={[s.label, { marginTop: 14 }]}>Start Time *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {TIMES.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.timeChip, form.time === t && s.timeChipActive]}
                onPress={() => update('time', t)}
              >
                <Text style={[s.timeChipText, form.time === t && s.timeChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Notifications */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notifications</Text>
          <Text style={s.label}>Remind me before (multi-select)</Text>
          <View style={s.reminderRow}>
            {[['15', '15 min'], ['30', '30 min'], ['60', '1 hour'], ['1440', '1 day']].map(([val, lab]) => {
              const active = form.reminders.includes(val);
              return (
                <TouchableOpacity
                  key={val}
                  style={[s.remBtn, active && s.remBtnActive]}
                  onPress={() => {
                    const next = active
                      ? form.reminders.filter(r => r !== val)
                      : [...form.reminders, val];
                    update('reminders', next);
                  }}
                >
                  <Text style={[s.remText, active && s.remTextActive]}>{lab}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.label, { marginTop: 14 }]}>Recurrence</Text>
          <View style={s.recRow}>
            {[['none', 'None'], ['weekly', 'Weekly'], ['biweekly', 'Bi-weekly'], ['monthly', 'Monthly']].map(([val, lab]) => (
              <TouchableOpacity
                key={val}
                style={[s.recBtn, form.recurrence === val && s.recBtnActive]}
                onPress={() => update('recurrence', val)}
              >
                <Text style={[s.recText, form.recurrence === val && s.recTextActive]}>{lab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recurrence limit — only shown when recurrence is active */}
          {form.recurrence !== 'none' && (
            <View style={s.limitBox}>
              <Text style={s.label}>Repeat limit</Text>

              {/* Toggle: count vs until-date */}
              <View style={s.limitToggle}>
                <TouchableOpacity
                  style={[s.limitTab, form.limitType === 'count' && s.limitTabActive]}
                  onPress={() => update('limitType', 'count')}
                >
                  <FontAwesome5 name="hashtag" size={12} color={form.limitType === 'count' ? COLORS.white : COLORS.gray600} />
                  <Text style={[s.limitTabText, form.limitType === 'count' && s.limitTabTextActive]}>
                    Number of times
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.limitTab, form.limitType === 'until' && s.limitTabActive]}
                  onPress={() => update('limitType', 'until')}
                >
                  <FontAwesome5 name="calendar-times" size={12} color={form.limitType === 'until' ? COLORS.white : COLORS.gray600} />
                  <Text style={[s.limitTabText, form.limitType === 'until' && s.limitTabTextActive]}>
                    End date
                  </Text>
                </TouchableOpacity>
              </View>

              {form.limitType === 'count' ? (
                <View style={s.countRow}>
                  <TouchableOpacity
                    style={s.countBtn}
                    onPress={() => {
                      const v = Math.max(1, parseInt(form.recurrence_count || '1', 10) - 1);
                      update('recurrence_count', String(v));
                    }}
                  >
                    <FontAwesome5 name="minus" size={13} color={COLORS.pink} />
                  </TouchableOpacity>
                  <TextInput
                    style={s.countInput}
                    keyboardType="number-pad"
                    value={form.recurrence_count}
                    onChangeText={v => {
                      const num = v.replace(/[^0-9]/g, '');
                      update('recurrence_count', num);
                    }}
                    maxLength={3}
                  />
                  <TouchableOpacity
                    style={s.countBtn}
                    onPress={() => {
                      const v = Math.min(104, parseInt(form.recurrence_count || '0', 10) + 1);
                      update('recurrence_count', String(v));
                    }}
                  >
                    <FontAwesome5 name="plus" size={13} color={COLORS.pink} />
                  </TouchableOpacity>
                  <Text style={s.countUnit}>
                    {(() => {
                      const map = { weekly: 'week(s)', biweekly: 'bi-week(s)', monthly: 'month(s)' };
                      return map[form.recurrence] || 'time(s)';
                    })()}
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <TouchableOpacity
                    style={s.dateBtn}
                    onPress={() => setShowUntilCal(v => !v)}
                  >
                    <FontAwesome5 name="calendar-times" size={14} color={COLORS.pink} />
                    <Text style={s.dateBtnText}>{fmtDate(untilDate)}</Text>
                    <FontAwesome5
                      name={showUntilCal ? 'chevron-up' : 'chevron-down'}
                      size={11} color={COLORS.gray400}
                      style={{ marginLeft: 'auto' }}
                    />
                  </TouchableOpacity>
                  {showUntilCal && (
                    <MiniCalPicker
                      selectedDate={untilDate}
                      onSelect={setUntilDate}
                      onClose={() => setShowUntilCal(false)}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation?.goBack()}>
          <Text style={s.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnPrimary, { backgroundColor: COLORS.pink, opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <>
                <FontAwesome5 name="calendar-plus" size={14} color={COLORS.white} />
                <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Schedule Event</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const Field = ({ label, placeholder, value, onChange, icon }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <View style={{ position: 'relative' }}>
      {icon && <FontAwesome5 name={icon} size={13} color={COLORS.gray400} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} />}
      <TextInput style={[s.input, icon && { paddingLeft: 42 }]} placeholder={placeholder} placeholderTextColor={COLORS.gray400} value={value} onChangeText={onChange} />
    </View>
  </View>
);

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: COLORS.pink },
  scroll:          { flex: 1, backgroundColor: COLORS.gray50 },
  header:          { backgroundColor: COLORS.pink, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:         { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { fontSize: 18, fontWeight: '700', color: COLORS.white },
  calStrip:        { backgroundColor: COLORS.white, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  monthRow:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 12 },
  monthText:       { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  dayBtn:          { width: 52, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.gray50, borderWidth: 1.5, borderColor: COLORS.gray200 },
  dayBtnSelected:  { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  dayName:         { fontSize: 11, color: COLORS.gray500, fontWeight: '600' },
  dayNameSelected: { color: 'rgba(255,255,255,0.8)' },
  dayNum:          { fontSize: 17, fontWeight: '800', color: COLORS.dark },
  dayNumSelected:  { color: COLORS.white },
  todayDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.pink },
  section:         { margin: 16, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 14 },
  label:           { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  input:           { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },
  typeGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard:        { width: '30%', padding: 12, borderRadius: 14, borderWidth: 2, alignItems: 'center', gap: 6 },
  typeLabel:       { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  caseList:        { gap: 6 },
  caseRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.gray200 },
  caseRowActive:   { borderColor: COLORS.pink, backgroundColor: '#FDF2F8' },
  radio:           { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.gray300, alignItems: 'center', justifyContent: 'center' },
  radioActive:     { borderColor: COLORS.pink },
  radioDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.pink },
  caseText:        { fontSize: 13, color: COLORS.gray600, flex: 1 },
  caseTextActive:  { color: COLORS.pink, fontWeight: '600' },
  row:             { flexDirection: 'row', alignItems: 'flex-start' },
  dateBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dateBtnText:     { fontSize: 13, color: COLORS.dark, fontWeight: '500' },
  durationRow:     { flexDirection: 'row', gap: 6 },
  durBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center' },
  durBtnActive:    { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  durText:         { fontSize: 11, fontWeight: '700', color: COLORS.gray600 },
  durTextActive:   { color: COLORS.white },
  timeChip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  timeChipActive:  { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  timeChipText:    { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  timeChipTextActive: { color: COLORS.white },
  // Video call toggle
  videoRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  videoLeft:       { flexDirection: 'row', alignItems: 'center', flex: 1 },
  videoIconWrap:   { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  videoTitle:      { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  videoSub:        { fontSize: 11, color: COLORS.gray500 },
  toggle:          { width: 48, height: 26, borderRadius: 13, backgroundColor: COLORS.gray200, paddingHorizontal: 2, justifyContent: 'center' },
  toggleOn:        { backgroundColor: COLORS.pink },
  knob:            { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  knobOn:          { marginLeft: 22 },

  reminderRow:     { flexDirection: 'row', gap: 8 },
  remBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center' },
  remBtnActive:    { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  remText:         { fontSize: 11, fontWeight: '600', color: COLORS.gray600 },
  remTextActive:   { color: COLORS.white },
  recRow:          { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  recBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200 },
  recBtnActive:    { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  recText:         { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  recTextActive:   { color: COLORS.white },
  // Recurrence limit block
  limitBox:        { marginTop: 16, backgroundColor: COLORS.gray50, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: COLORS.gray200 },
  limitToggle:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  limitTab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200 },
  limitTabActive:  { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  limitTabText:    { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  limitTabTextActive: { color: COLORS.white },
  countRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  countBtn:        { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.pink, alignItems: 'center', justifyContent: 'center' },
  countInput:      { width: 60, textAlign: 'center', fontSize: 20, fontWeight: '800', color: COLORS.dark, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 10, paddingVertical: 6 },
  countUnit:       { fontSize: 13, fontWeight: '600', color: COLORS.gray500 },
  footer:          { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary:      { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:  { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnSecondary:    { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText:{ fontSize: 15, fontWeight: '600', color: COLORS.gray600 },
});
