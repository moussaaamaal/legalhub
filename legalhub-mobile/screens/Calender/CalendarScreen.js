import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, Switch,
  Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Linking, RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calendarAPI, casesAPI } from '../../services/api';

// ─── COULEURS ──────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280',
  gray600: '#4B5563', gray700: '#374151',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626', red700: '#B91C1C',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706', amber700: '#B45309',
  green50: '#F0FDF4', green100: '#DCFCE7', green500: '#22C55E', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue500: '#3B82F6', blue600: '#2563EB', blue700: '#1D4ED8',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA', purple700: '#7E22CE',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
};

const Icon = ({ lib = 'FA5', name, size = 16, color = C.dark }) => {
  if (lib === 'FA5') return <FontAwesome5 name={name} size={size} color={color} />;
  if (lib === 'FA')  return <FontAwesome  name={name} size={size} color={color} />;
  if (lib === 'ION') return <Ionicons     name={name} size={size} color={color} />;
  return null;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────

// ── Timezone ──────────────────────────────────────────────────────────────────
// We store times exactly as entered by the user (no UTC conversion).
// Display uses getUTCHours() so the value shown always matches what is in Supabase,
// regardless of the device system timezone.
const APP_TZ_OFFSET_H = 0;

// Parse any ISO string (with or without timezone suffix) to a UTC Date.
// Manually resolves the offset to bypass Hermes date-parsing bugs.
const parseDate = (iso) => {
  if (!iso) return new Date(NaN);
  const s = iso.trim().replace(' ', 'T');
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const baseMs = new Date(m[1] + 'Z').getTime();
    const sign   = m[2] === '+' ? -1 : 1;
    const offMs  = (parseInt(m[3]) * 60 + parseInt(m[4])) * 60000;
    return new Date(baseMs + sign * offMs);
  }
  if (s.endsWith('Z')) return new Date(s);
  return new Date(s + 'Z');
};

// Return local (Africa/Tunis) hour from a UTC Date, regardless of device timezone.
const localH  = (d) => (d.getUTCHours() + APP_TZ_OFFSET_H) % 24;
const localM  = (d) => d.getUTCMinutes();
// Return a Date shifted to Africa/Tunis for getUTCDate/Month/Day/Year calls.
const localD  = (d) => new Date(d.getTime() + APP_TZ_OFFSET_H * 3600000);

const EVENT_TYPE_META = {
  HEARING:      { icon: 'gavel',       label: 'Hearing',      color: C.red600,    bg: C.red50,    dot: C.red500,    timeBg: C.red100,    border: C.red500    },
  MEETING:      { icon: 'handshake',   label: 'Meeting',      color: C.amber600,  bg: C.amber50,  dot: C.amber500,  timeBg: C.amber100,  border: C.amber500  },
  DEADLINE:     { icon: 'clock',       label: 'Deadline',     color: C.blue600,   bg: C.blue50,   dot: C.blue500,   timeBg: C.blue100,   border: C.secondary },
  CONSULTATION: { icon: 'comments',    label: 'Consultation', color: C.green600,  bg: C.green50,  dot: C.green500,  timeBg: C.green100,  border: C.green500  },
  COURT_DATE:   { icon: 'landmark',    label: 'Court Date',   color: C.purple600, bg: C.purple50, dot: C.purple600, timeBg: C.purple100, border: C.purple600 },
};

const getMeta = (type) => EVENT_TYPE_META[(type || '').toUpperCase()] || EVENT_TYPE_META.MEETING;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = parseDate(iso);
  if (isNaN(d)) return { time: '—', period: '' };
  const h = localH(d), m = localM(d);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return { time: `${String(hour).padStart(2,'0')}:${String(m).padStart(2,'0')}`, period };
};

const toDateKey = (iso) => {
  if (!iso) return '';
  const ld = localD(parseDate(iso));
  return `${ld.getUTCFullYear()}-${ld.getUTCMonth()}-${ld.getUTCDate()}`;
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Build calendar grid for a given year/month
const buildCalendarGrid = (year, month) => {
  const first = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const cells = [];
  // previous month padding
  for (let i = first - 1; i >= 0; i--) cells.push({ d: String(daysInPrev - i), prev: true });
  // current month
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d: String(d), cur: true });
  // next month padding
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ d: String(next++), next: true });
  // split into rows
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

const FILTER_TABS = [
  { key: 'all',          label: 'All Events',   iconLib: 'FA5', iconName: 'filter'    },
  { key: 'HEARING',      label: 'Hearings',     iconLib: 'FA5', iconName: 'gavel'     },
  { key: 'MEETING',      label: 'Meetings',     iconLib: 'FA5', iconName: 'handshake' },
  { key: 'DEADLINE',     label: 'Deadlines',    iconLib: 'FA5', iconName: 'clock'     },
  { key: 'CONSULTATION', label: 'Consultations',iconLib: 'FA5', iconName: 'comments'  },
  { key: 'COURT_DATE',   label: 'Court Dates',  iconLib: 'FA5', iconName: 'landmark'  },
];

const REMINDER_PREFS_META = [
  { key: 'push',  iconLib: 'FA5', iconName: 'bell',     iconColor: C.primary,  iconBg: C.blue100,  title: 'Push Notifications', sub: 'Get alerts on your device',   defaultOn: true, onColor: C.primary  },
  { key: 'email', iconLib: 'FA5', iconName: 'envelope', iconColor: C.green600, iconBg: C.green100, title: 'Email Reminders',    sub: 'Receive email notifications', defaultOn: true, onColor: C.green600 },
];
const REMINDER_STORAGE_KEY = 'lh_cal_reminder_prefs';
const REMINDER_TIME_KEY    = 'lh_cal_reminder_time';
const REMINDER_DEFAULTS    = { push: true, email: true };

// ─── EVENT CARD ───────────────────────────────────────────────────────────
const EventCard = ({ ev, onDelete, onEdit, currentUserId, showDate = false }) => {
  const meta    = getMeta(ev.event_type);
  const tf      = formatTime(ev.start_datetime);
  const d       = localD(parseDate(ev.start_datetime));
  const hasVideo = ev.is_video_call && ev.video_call_url;
  const isPast   = parseDate(ev.start_datetime) < new Date();

  const handleJoin = () => {
    Linking.openURL(ev.video_call_url).catch(() =>
      Alert.alert('Cannot Open Link', 'The meeting link could not be opened.')
    );
  };

  return (
    <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: meta.border, padding: 0, marginBottom: 10, overflow: 'hidden' }]}>
      <View style={{ padding: 14 }}>
        <View style={[s.row, { gap: 10 }]}>
          <View style={[s.timeBox, { backgroundColor: meta.timeBg }]}>
            <Text style={[s.timeText, { color: meta.color }]}>{tf.time || '—'}</Text>
            <Text style={[s.timePeriod, { color: meta.color }]}>{tf.period || ''}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {showDate && !isNaN(d) && (
              <Text style={[s.xs, { color: meta.color, fontWeight: '700', marginBottom: 2 }]}>
                {DAY_NAMES[d.getUTCDay()]} {d.getUTCDate()} {MONTH_NAMES[d.getUTCMonth()]}
              </Text>
            )}
            <View style={[s.row, { marginBottom: 4, gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }]}>
              <View style={s.row}>
                <View style={[s.tag, { backgroundColor: meta.bg, marginRight: 6 }]}>
                  <View style={s.row}>
                    <Icon lib="FA5" name={meta.icon} size={10} color={meta.color} />
                    <Text style={[s.tagText, { color: meta.color, marginLeft: 4 }]}>{meta.label}</Text>
                  </View>
                </View>
                {ev.is_video_call && (
                  <View style={[s.tag, { backgroundColor: C.green50 }]}>
                    <View style={s.row}>
                      <Icon lib="FA5" name="video" size={10} color={C.green600} />
                      <Text style={[s.tagText, { color: C.green600, marginLeft: 4 }]}>Video</Text>
                    </View>
                  </View>
                )}
              </View>
              {ev.is_participant && (
                <View style={[s.tag, { backgroundColor: C.indigo100 }]}>
                  <View style={s.row}>
                    <Icon lib="FA5" name="user-check" size={10} color={C.indigo600} />
                    <Text style={[s.tagText, { color: C.indigo600, marginLeft: 4 }]}>Participant</Text>
                  </View>
                </View>
              )}
            </View>
            <Text style={s.cardTitle}>{ev.title}</Text>
            {ev.description ? <Text style={[s.xs, { marginTop: 2 }]}>{ev.description}</Text> : null}
            {ev.case_title ? (
              <View style={[s.row, { marginTop: 5, gap: 5 }]}>
                <Icon lib="FA5" name="folder-open" size={10} color={C.indigo600} />
                <Text style={[s.xs, { color: C.indigo600, fontWeight: '600' }]} numberOfLines={1}>
                  {ev.case_title}
                </Text>
              </View>
            ) : null}
            {ev.participants && ev.participants.length > 0 ? (
              <View style={[s.row, { marginTop: 5, gap: 4, flexWrap: 'wrap' }]}>
                <Icon lib="FA5" name="users" size={10} color={C.gray500} />
                <Text style={[s.xs, { color: C.gray600, flexShrink: 1 }]} numberOfLines={1}>
                  {ev.participants.map(p => p.full_name).filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 4 }}>
            {ev.created_by === currentUserId && (
              <TouchableOpacity style={s.iconActionBtn} onPress={() => onEdit && onEdit(ev)}>
                <Icon lib="FA5" name="pen" size={13} color={C.primary} />
              </TouchableOpacity>
            )}
            {ev.created_by === currentUserId && (
              <TouchableOpacity style={s.iconActionBtn} onPress={() => onDelete(ev.id)}>
                <Icon lib="FA5" name="trash-alt" size={14} color={C.red500} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {hasVideo && !isPast && (
          <TouchableOpacity style={s.joinBtn} onPress={handleJoin} activeOpacity={0.8}>
            <Icon lib="FA5" name="video" size={13} color={C.white} />
            <Text style={s.joinBtnTxt}>Join Video Call</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};


// ─── MINI CALENDAR PICKER (pure JS) ───────────────────────────────────────
function CalendarPicker({ selectedDate, onSelect, onClose }) {
  const [viewYear, setViewYear]   = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const grid = buildCalendarGrid(viewYear, viewMonth);
  const prevM = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextM = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  return (
    <View style={m.calPicker}>
      <View style={[m.calPickerHeader]}>
        <TouchableOpacity onPress={prevM} style={m.calNavBtn}><Icon lib="FA5" name="chevron-left" size={13} color={C.white} /></TouchableOpacity>
        <Text style={m.calPickerTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextM} style={m.calNavBtn}><Icon lib="FA5" name="chevron-right" size={13} color={C.white} /></TouchableOpacity>
      </View>
      <View style={{ padding: 8 }}>
        <View style={s.calRow}>
          {DAY_NAMES.map(d => <Text key={d} style={[s.calDayLabel, { fontSize: 10 }]}>{d}</Text>)}
        </View>
        {grid.map((row, ri) => (
          <View key={ri} style={s.calRow}>
            {row.map((cell, ci) => {
              const isSelected = cell.cur &&
                Number(cell.d) === selectedDate.getDate() &&
                viewMonth === selectedDate.getMonth() &&
                viewYear === selectedDate.getFullYear();
              const isToday = cell.cur &&
                Number(cell.d) === new Date().getDate() &&
                viewMonth === new Date().getMonth() &&
                viewYear === new Date().getFullYear();
              return (
                <TouchableOpacity
                  key={ci}
                  style={[s.calCell, isSelected && { backgroundColor: C.primary }, isToday && !isSelected && { borderWidth: 1, borderColor: C.primary }]}
                  disabled={!cell.cur}
                  onPress={() => {
                    const d = new Date(viewYear, viewMonth, Number(cell.d));
                    onSelect(d);
                    onClose();
                  }}
                >
                  <Text style={[s.calCellText, { fontSize: 12 }, (cell.prev || cell.next) && { color: C.gray400 }, isSelected && { color: C.white, fontWeight: '700' }]}>{cell.d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── ADD EVENT MODAL ───────────────────────────────────────────────────────
const EVENT_TYPES = ['HEARING', 'MEETING', 'DEADLINE', 'CONSULTATION', 'COURT_DATE'];
const fmtDate = (d) => `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}`;

const buildUtcISO = (calDate, hours, minutes) => {
  const pad = n => String(n).padStart(2, '0');
  return `${calDate.getFullYear()}-${pad(calDate.getMonth()+1)}-${pad(calDate.getDate())}T${pad(hours)}:${pad(minutes)}:00.000Z`;
};

const RECURRENCE_OPTS = [
  { val: 'none',     lab: 'None'     },
  { val: 'weekly',   lab: 'Weekly'   },
  { val: 'biweekly', lab: 'Bi-weekly'},
  { val: 'monthly',  lab: 'Monthly'  },
];
const UNIT_LABEL = { weekly: 'week(s)', biweekly: 'bi-week(s)', monthly: 'month(s)' };

function AddEventModal({ visible, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [type, setType]   = useState('MEETING');
  const [saving, setSaving] = useState(false);

  const [selDate, setSelDate]         = useState(new Date());
  const [startH, setStartH]           = useState('09');
  const [startM, setStartM]           = useState('00');
  const [endH, setEndH]               = useState('10');
  const [endM, setEndM]               = useState('00');
  const [showCal, setShowCal]         = useState(false);

  // Linked case
  const [cases,   setCases]   = useState([]);
  const [caseId,  setCaseId]  = useState(null);

  // Participants
  const [availableParticipants, setAvailableParticipants] = useState([]);
  const [selectedParticipants,  setSelectedParticipants]  = useState(new Set());
  const [loadingParticipants,   setLoadingParticipants]   = useState(false);

  // Video call
  const [isVideoCall,   setIsVideoCall]   = useState(false);
  const [videoCallUrl,  setVideoCallUrl]  = useState('');

  // Recurrence
  const [recurrence,      setRecurrence]      = useState('none');
  const [limitType,       setLimitType]       = useState('count');   // 'count' | 'until'
  const [recCount,        setRecCount]        = useState('4');
  const [untilDate,       setUntilDate]       = useState(new Date());
  const [showUntilCal,    setShowUntilCal]    = useState(false);

  useEffect(() => {
    if (visible) casesAPI.list().then(data => setCases(Array.isArray(data) ? data : [])).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setLoadingParticipants(true);
    setSelectedParticipants(new Set());
    calendarAPI.getAvailableParticipants(caseId || null)
      .then(data => setAvailableParticipants(Array.isArray(data) ? data : []))
      .catch(() => setAvailableParticipants([]))
      .finally(() => setLoadingParticipants(false));
  }, [visible, caseId]);

  const reset = () => {
    setTitle(''); setType('MEETING');
    setSelDate(new Date()); setStartH('09'); setStartM('00');
    setEndH('10'); setEndM('00'); setShowCal(false);
    setCaseId(null);
    setSelectedParticipants(new Set());
    setAvailableParticipants([]);
    setIsVideoCall(false); setVideoCallUrl('');
    setRecurrence('none'); setLimitType('count'); setRecCount('4');
    setUntilDate(new Date()); setShowUntilCal(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }

    const sh = parseInt(startH) || 0, sm = parseInt(startM) || 0;
    const eh = parseInt(endH)   || 0, em = parseInt(endM)   || 0;

    const payload = {
      title:          title.trim(),
      event_type:     type,
      start_datetime: buildUtcISO(selDate, sh, sm),
      end_datetime:   (eh > sh || (eh === sh && em > sm)) ? buildUtcISO(selDate, eh, em) : null,
      recurrence,
    };
    if (caseId) payload.case_id = caseId;
    if (selectedParticipants.size > 0) payload.participant_ids = [...selectedParticipants];
    if (isVideoCall) {
      payload.is_video_call = true;
      if (videoCallUrl.trim()) payload.video_call_url = videoCallUrl.trim();
    }

    if (recurrence !== 'none') {
      if (limitType === 'count') {
        const count = parseInt(recCount, 10);
        if (!count || count < 1) { Alert.alert('Validation', 'Enter a valid number of occurrences (≥ 1).'); return; }
        if (count > 104)         { Alert.alert('Validation', 'Maximum 104 occurrences.');                  return; }
        payload.recurrence_count = count;
      } else {
        const toLocalDateStr = (d) => {
          const p = n => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
        };
        const untilIso = toLocalDateStr(untilDate);
        const startIso = toLocalDateStr(selDate);
        if (untilIso <= startIso) { Alert.alert('Validation', 'End date must be after the event date.'); return; }
        payload.recurrence_until = untilIso;
      }
    }

    setSaving(true);
    try {
      await calendarAPI.createEvent(payload);
      reset();
      onCreated();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not create event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={m.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={m.sheet}>
          <View style={m.sheetHeader}>
            <Text style={m.sheetTitle}>New Event</Text>
            <TouchableOpacity onPress={onClose}><Icon lib="FA5" name="times" size={18} color={C.gray600} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <Text style={m.label}>Title *</Text>
            <TextInput style={m.input} placeholder="e.g. Court Hearing — Smith vs. State" value={title} onChangeText={setTitle} />

            {/* Type */}
            <Text style={m.label}>Type *</Text>
            <View style={m.typeRow}>
              {EVENT_TYPES.map(t => {
                const mt = getMeta(t);
                const active = type === t;
                return (
                  <TouchableOpacity key={t} style={[m.typeBtn, active && { backgroundColor: mt.bg, borderColor: mt.color }]} onPress={() => setType(t)}>
                    <Icon lib="FA5" name={mt.icon} size={14} color={active ? mt.color : C.gray500} />
                    <Text style={[m.typeBtnText, active && { color: mt.color }]}>{mt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date */}
            <Text style={m.label}>Date *</Text>
            <TouchableOpacity style={m.pickerBtn} onPress={() => setShowCal(v => !v)}>
              <Icon lib="FA5" name="calendar" size={14} color={C.primary} />
              <Text style={m.pickerBtnText}>{fmtDate(selDate)}</Text>
              <Icon lib="FA5" name={showCal ? 'chevron-up' : 'chevron-down'} size={11} color={C.gray500} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {showCal && (
              <CalendarPicker selectedDate={selDate} onSelect={setSelDate} onClose={() => setShowCal(false)} />
            )}

            {/* Start time */}
            <Text style={m.label}>Start Time *</Text>
            <View style={m.timeRow}>
              <TextInput style={[m.input, m.timeInput]} placeholder="09" value={startH} onChangeText={t => setStartH(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} />
              <Text style={m.timeSep}>:</Text>
              <TextInput style={[m.input, m.timeInput]} placeholder="00" value={startM} onChangeText={t => setStartM(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} />
            </View>

            {/* End time */}
            <Text style={m.label}>End Time</Text>
            <View style={m.timeRow}>
              <TextInput style={[m.input, m.timeInput]} placeholder="10" value={endH} onChangeText={t => setEndH(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} />
              <Text style={m.timeSep}>:</Text>
              <TextInput style={[m.input, m.timeInput]} placeholder="00" value={endM} onChangeText={t => setEndM(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} />
            </View>

            {/* Video Call */}
            <Text style={m.label}>Video Call</Text>
            <TouchableOpacity
              style={[m.videoToggleRow, isVideoCall && m.videoToggleRowActive]}
              onPress={() => setIsVideoCall(v => !v)}
              activeOpacity={0.8}
            >
              <View style={[m.videoIconWrap, { backgroundColor: isVideoCall ? C.green100 : C.gray100 }]}>
                <Icon lib="FA5" name="video" size={16} color={isVideoCall ? C.green600 : C.gray400} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[m.videoToggleTitle, isVideoCall && { color: C.green600 }]}>
                  {isVideoCall ? 'Video Call Enabled' : 'Enable Video Call'}
                </Text>
                <Text style={m.videoToggleSub}>This event takes place online</Text>
              </View>
              <Switch
                value={isVideoCall}
                onValueChange={setIsVideoCall}
                trackColor={{ false: C.gray200, true: C.green500 }}
                thumbColor={C.white}
              />
            </TouchableOpacity>

            {isVideoCall && (
              <>
                <Text style={m.label}>Meeting Link</Text>
                <View style={m.videoUrlRow}>
                  <Icon lib="FA5" name="link" size={14} color={C.gray400} style={{ marginRight: 8 }} />
                  <TextInput
                    style={m.videoUrlInput}
                    placeholder="https://meet.google.com/..."
                    placeholderTextColor={C.gray400}
                    value={videoCallUrl}
                    onChangeText={setVideoCallUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              </>
            )}

            {/* Linked Case */}
            {cases.length > 0 && (
              <>
                <Text style={m.label}>Linked Case</Text>
                <View style={m.caseList}>
                  {[{ id: null, title: 'None', case_number: '' }, ...cases].map(c => {
                    const label = c.id ? `${c.case_number} — ${c.title}` : 'None';
                    const isActive = caseId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id ?? 'none'}
                        style={[m.caseRow, isActive && m.caseRowActive]}
                        onPress={() => setCaseId(c.id)}
                      >
                        <View style={[m.radio, isActive && m.radioActive]}>
                          {isActive && <View style={m.radioDot} />}
                        </View>
                        <Text style={[m.caseText, isActive && m.caseTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Participants ─────────────────────────────────────────── */}
            {(availableParticipants.length > 0 || loadingParticipants) && (
              <>
                <Text style={m.label}>
                  Participants{caseId ? ' (case team + client)' : ' (firm members)'}
                </Text>
                {loadingParticipants ? (
                  <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} />
                ) : (
                  <View style={m.participantList}>
                    {availableParticipants.map(p => {
                      const selected = selectedParticipants.has(p.user_id);
                      const isClient = p.participant_type === 'CLIENT';
                      const accentColor = isClient ? C.green600 : C.primary;
                      const accentBg    = isClient ? C.green50  : C.blue50;
                      return (
                        <TouchableOpacity
                          key={p.user_id}
                          style={[m.participantRow, selected && { borderColor: accentColor, backgroundColor: accentBg }]}
                          onPress={() => {
                            setSelectedParticipants(prev => {
                              const next = new Set(prev);
                              next.has(p.user_id) ? next.delete(p.user_id) : next.add(p.user_id);
                              return next;
                            });
                          }}
                        >
                          <View style={[m.participantAvatar, { backgroundColor: selected ? accentColor : C.gray200 }]}>
                            <Text style={{ color: selected ? C.white : C.gray600, fontWeight: '700', fontSize: 13 }}>
                              {(p.full_name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[m.participantName, selected && { color: accentColor }]}>{p.full_name || p.email}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <View style={[m.roleTag, { backgroundColor: isClient ? C.green100 : C.blue100 }]}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: isClient ? C.green600 : C.primary }}>
                                  {isClient ? 'Client' : (p.role === 'FIRM_ADMIN' ? 'Admin' : 'Lawyer')}
                                </Text>
                              </View>
                              {p.email ? <Text style={[m.participantEmail]}>{p.email}</Text> : null}
                            </View>
                          </View>
                          <View style={[m.checkbox, selected && { backgroundColor: accentColor, borderColor: accentColor }]}>
                            {selected && <Icon lib="FA5" name="check" size={10} color={C.white} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* ── Recurrence ───────────────────────────────────────────── */}
            <Text style={m.label}>Recurrence</Text>
            <View style={m.recRow}>
              {RECURRENCE_OPTS.map(({ val, lab }) => (
                <TouchableOpacity
                  key={val}
                  style={[m.recBtn, recurrence === val && m.recBtnActive]}
                  onPress={() => setRecurrence(val)}
                >
                  <Text style={[m.recText, recurrence === val && m.recTextActive]}>{lab}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurrence !== 'none' && (
              <View style={m.limitBox}>
                <Text style={[m.label, { marginTop: 0, marginBottom: 10 }]}>Repeat limit</Text>

                {/* Toggle count / until */}
                <View style={m.limitToggle}>
                  <TouchableOpacity
                    style={[m.limitTab, limitType === 'count' && m.limitTabActive]}
                    onPress={() => setLimitType('count')}
                  >
                    <Icon lib="FA5" name="hashtag" size={11} color={limitType === 'count' ? C.white : C.gray600} />
                    <Text style={[m.limitTabTxt, limitType === 'count' && m.limitTabTxtActive]}>Number of times</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[m.limitTab, limitType === 'until' && m.limitTabActive]}
                    onPress={() => { setLimitType('until'); setShowUntilCal(false); }}
                  >
                    <Icon lib="FA5" name="calendar-times" size={11} color={limitType === 'until' ? C.white : C.gray600} />
                    <Text style={[m.limitTabTxt, limitType === 'until' && m.limitTabTxtActive]}>End date</Text>
                  </TouchableOpacity>
                </View>

                {limitType === 'count' ? (
                  <View style={m.countRow}>
                    <TouchableOpacity style={m.countBtn} onPress={() => setRecCount(v => String(Math.max(1, parseInt(v||'1',10) - 1)))}>
                      <Icon lib="FA5" name="minus" size={12} color={C.primary} />
                    </TouchableOpacity>
                    <TextInput
                      style={m.countInput}
                      keyboardType="number-pad"
                      value={recCount}
                      onChangeText={v => setRecCount(v.replace(/[^0-9]/g,''))}
                      maxLength={3}
                    />
                    <TouchableOpacity style={m.countBtn} onPress={() => setRecCount(v => String(Math.min(104, parseInt(v||'0',10) + 1)))}>
                      <Icon lib="FA5" name="plus" size={12} color={C.primary} />
                    </TouchableOpacity>
                    <Text style={m.countUnit}>{UNIT_LABEL[recurrence] || 'time(s)'}</Text>
                  </View>
                ) : (
                  <View>
                    <TouchableOpacity style={m.pickerBtn} onPress={() => setShowUntilCal(v => !v)}>
                      <Icon lib="FA5" name="calendar-times" size={14} color={C.primary} />
                      <Text style={m.pickerBtnText}>{fmtDate(untilDate)}</Text>
                      <Icon lib="FA5" name={showUntilCal ? 'chevron-up' : 'chevron-down'} size={11} color={C.gray500} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                    {showUntilCal && (
                      <CalendarPicker
                        selectedDate={untilDate}
                        onSelect={setUntilDate}
                        onClose={() => setShowUntilCal(false)}
                      />
                    )}
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={[m.createBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={m.createBtnText}>Create Event</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── EDIT EVENT MODAL ─────────────────────────────────────────────────────
function EditEventModal({ visible, event, onClose, onUpdated }) {
  const [title,  setTitle]  = useState('');
  const [selDate, setSelDate] = useState(new Date());
  const [startH, setStartH] = useState('09');
  const [startM, setStartM] = useState('00');
  const [endH,   setEndH]   = useState('10');
  const [endM,   setEndM]   = useState('00');
  const [showCal, setShowCal] = useState(false);
  const [saving, setSaving]  = useState(false);

  const [availableParticipants, setAvailableParticipants] = useState([]);
  const [selectedParticipants,  setSelectedParticipants]  = useState(new Set());
  const [loadingParticipants,   setLoadingParticipants]   = useState(false);

  useEffect(() => {
    if (!visible || !event) return;
    setTitle(event.title || '');
    const d = parseDate(event.start_datetime);
    if (!isNaN(d)) {
      setSelDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      setStartH(String(localH(d)).padStart(2, '0'));
      setStartM(String(localM(d)).padStart(2, '0'));
    }
    if (event.end_datetime) {
      const de = parseDate(event.end_datetime);
      if (!isNaN(de)) {
        setEndH(String(localH(de)).padStart(2, '0'));
        setEndM(String(localM(de)).padStart(2, '0'));
      }
    }
    setSelectedParticipants(new Set((event.participants || []).map(p => p.user_id)));
    setShowCal(false);
    setLoadingParticipants(true);
    calendarAPI.getAvailableParticipants(event.case_id || null)
      .then(data => setAvailableParticipants(Array.isArray(data) ? data : []))
      .catch(() => setAvailableParticipants([]))
      .finally(() => setLoadingParticipants(false));
  }, [visible, event]);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }
    const sh = parseInt(startH) || 0, sm = parseInt(startM) || 0;
    const eh = parseInt(endH)   || 0, em = parseInt(endM)   || 0;
    const payload = {
      title:          title.trim(),
      event_type:     event.event_type,
      start_datetime: buildUtcISO(selDate, sh, sm),
      recurrence:     'none',
    };
    if (eh > sh || (eh === sh && em > sm)) payload.end_datetime = buildUtcISO(selDate, eh, em);
    if (selectedParticipants.size > 0) payload.participant_ids = [...selectedParticipants];
    setSaving(true);
    try {
      await calendarAPI.updateEvent(event.id, payload);
      onUpdated();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update event.');
    } finally {
      setSaving(false);
    }
  };

  const meta = event ? getMeta(event.event_type) : getMeta('MEETING');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={m.sheet}>
          <View style={m.sheetHeader}>
            <View style={s.row}>
              <View style={[s.tag, { backgroundColor: meta.bg, marginRight: 8 }]}>
                <Icon lib="FA5" name={meta.icon} size={11} color={meta.color} />
                <Text style={[s.tagText, { color: meta.color, marginLeft: 4 }]}>{meta.label}</Text>
              </View>
              <Text style={m.sheetTitle}>Edit Event</Text>
            </View>
            <TouchableOpacity onPress={onClose}><Icon lib="FA5" name="times" size={18} color={C.gray600} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <Text style={m.label}>Title *</Text>
            <TextInput style={m.input} value={title} onChangeText={setTitle} placeholder="Event title" />

            {/* Date */}
            <Text style={m.label}>Date *</Text>
            <TouchableOpacity style={m.pickerBtn} onPress={() => setShowCal(v => !v)}>
              <Icon lib="FA5" name="calendar" size={14} color={C.primary} />
              <Text style={m.pickerBtnText}>{fmtDate(selDate)}</Text>
              <Icon lib="FA5" name={showCal ? 'chevron-up' : 'chevron-down'} size={11} color={C.gray500} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {showCal && <CalendarPicker selectedDate={selDate} onSelect={setSelDate} onClose={() => setShowCal(false)} />}

            {/* Start time */}
            <Text style={m.label}>Start Time *</Text>
            <View style={m.timeRow}>
              <TextInput style={[m.input, m.timeInput]} value={startH} onChangeText={t => setStartH(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} placeholder="09" />
              <Text style={m.timeSep}>:</Text>
              <TextInput style={[m.input, m.timeInput]} value={startM} onChangeText={t => setStartM(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} placeholder="00" />
            </View>

            {/* End time */}
            <Text style={m.label}>End Time</Text>
            <View style={m.timeRow}>
              <TextInput style={[m.input, m.timeInput]} value={endH} onChangeText={t => setEndH(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} placeholder="10" />
              <Text style={m.timeSep}>:</Text>
              <TextInput style={[m.input, m.timeInput]} value={endM} onChangeText={t => setEndM(t.replace(/\D/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} placeholder="00" />
            </View>

            {/* Participants */}
            {(availableParticipants.length > 0 || loadingParticipants) && (
              <>
                <Text style={m.label}>Participants</Text>
                {loadingParticipants ? (
                  <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} />
                ) : (
                  <View style={m.participantList}>
                    {availableParticipants.map(p => {
                      const selected = selectedParticipants.has(p.user_id);
                      const isClient = p.participant_type === 'CLIENT';
                      const accent   = isClient ? C.green600 : C.primary;
                      const accentBg = isClient ? C.green50  : C.blue50;
                      return (
                        <TouchableOpacity
                          key={p.user_id}
                          style={[m.participantRow, selected && { borderColor: accent, backgroundColor: accentBg }]}
                          onPress={() => setSelectedParticipants(prev => {
                            const next = new Set(prev);
                            next.has(p.user_id) ? next.delete(p.user_id) : next.add(p.user_id);
                            return next;
                          })}
                        >
                          <View style={[m.participantAvatar, { backgroundColor: selected ? accent : C.gray200 }]}>
                            <Text style={{ color: selected ? C.white : C.gray600, fontWeight: '700', fontSize: 13 }}>
                              {(p.full_name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[m.participantName, selected && { color: accent }]}>{p.full_name || p.email}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <View style={[m.roleTag, { backgroundColor: isClient ? C.green100 : C.blue100 }]}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: isClient ? C.green600 : C.primary }}>
                                  {isClient ? 'Client' : (p.role === 'FIRM_ADMIN' ? 'Admin' : 'Lawyer')}
                                </Text>
                              </View>
                              {p.email ? <Text style={m.participantEmail}>{p.email}</Text> : null}
                            </View>
                          </View>
                          <View style={[m.checkbox, selected && { backgroundColor: accent, borderColor: accent }]}>
                            {selected && <Icon lib="FA5" name="check" size={10} color={C.white} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity style={[m.createBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={m.createBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ÉCRAN ─────────────────────────────────────────────────────────────────
export default function CalendarScreen({ navigation }) {
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState('week');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedReminder, setSelectedReminder] = useState('30min');
  const [reminderToggles, setReminderToggles]   = useState(REMINDER_DEFAULTS);
  const [addModal, setAddModal] = useState(false);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editEvent,  setEditEvent]  = useState(null);

  const intervalRef = useRef(null);

  // Load events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await calendarAPI.listEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on focus + polling every 60 s while screen is active
  useFocusEffect(
    useCallback(() => {
      loadEvents();
      intervalRef.current = setInterval(loadEvents, 60000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [loadEvents])
  );

  // Load saved reminder prefs + current user ID
  useEffect(() => {
    AsyncStorage.getItem(REMINDER_STORAGE_KEY).then(v => { if (v) setReminderToggles(JSON.parse(v)); });
    AsyncStorage.getItem(REMINDER_TIME_KEY).then(v => { if (v) setSelectedReminder(v); });
    AsyncStorage.getItem('lh_user').then(v => { if (v) { try { setCurrentUserId(JSON.parse(v).id); } catch {} } });
  }, []);

  const handleReminderToggle = (key, val) => {
    const updated = { ...reminderToggles, [key]: val };
    setReminderToggles(updated);
    AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleReminderTime = (key) => {
    setSelectedReminder(key);
    AsyncStorage.setItem(REMINDER_TIME_KEY, key);
  };

  // Filtered events
  const filteredEvents = activeFilter === 'all' ? events : events.filter(e => (e.event_type || '').toUpperCase() === activeFilter);

  // Today's key uses Africa/Tunis local date (device-independent)
  const todayUtcMs  = Date.now();
  const todayLocal  = new Date(todayUtcMs + APP_TZ_OFFSET_H * 3600000);
  const todayKey    = `${todayLocal.getUTCFullYear()}-${todayLocal.getUTCMonth()}-${todayLocal.getUTCDate()}`;
  const todayEvents = filteredEvents.filter(e => toDateKey(e.start_datetime) === todayKey);

  // Week view: compute in UTC so device timezone doesn't shift day boundaries
  const nowUtc     = Date.now() + APP_TZ_OFFSET_H * 3600000; // Africa/Tunis "now" in UTC ms
  const nowLocal   = new Date(nowUtc);
  const dowOffset  = nowLocal.getUTCDay(); // 0=Sun
  const weekStartMs = nowUtc - dowOffset * 86400000 - (nowUtc % 86400000); // Sun 00:00 Africa/Tunis in UTC
  const weekEndMs   = weekStartMs + 7 * 86400000- 1;
  const weekAllEvents = filteredEvents
    .filter(e => { const d = parseDate(e.start_datetime); return !isNaN(d) && d.getTime() >= weekStartMs - APP_TZ_OFFSET_H*3600000 && d.getTime() <= weekEndMs - APP_TZ_OFFSET_H*3600000; })
    .sort((a, b) => parseDate(a.start_datetime) - parseDate(b.start_datetime));

  // Group week events by day
  const weekByDay = DAY_NAMES.map((dayName, i) => {
    const dayLocal = new Date(weekStartMs + i * 86400000);
    const key = `${dayLocal.getUTCFullYear()}-${dayLocal.getUTCMonth()}-${dayLocal.getUTCDate()}`;
    return { dayName, day: dayLocal, events: filteredEvents.filter(e => toDateKey(e.start_datetime) === key) };
  });

  // Month view: compare in Africa/Tunis local
  const monthEvents = filteredEvents
    .filter(e => { const ld = localD(parseDate(e.start_datetime)); return !isNaN(ld) && ld.getUTCFullYear() === calYear && ld.getUTCMonth() === calMonth; })
    .sort((a, b) => parseDate(a.start_datetime) - parseDate(b.start_datetime));

  // List view: all future events sorted
  const listEvents = filteredEvents
    .filter(e => !isNaN(parseDate(e.start_datetime)))
    .sort((a, b) => parseDate(a.start_datetime) - parseDate(b.start_datetime));


  // Build event dot map for calendar
  const eventDotMap = {};
  events.forEach(e => {
    const key = toDateKey(e.start_datetime);
    if (!eventDotMap[key]) eventDotMap[key] = [];
    const meta = getMeta(e.event_type);
    if (!eventDotMap[key].includes(meta.dot)) eventDotMap[key].push(meta.dot);
  });

  // Calendar grid
  const calGrid = buildCalendarGrid(calYear, calMonth);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await calendarAPI.listEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleEventCreated = () => { setAddModal(false); loadEvents(); };
  const handleEventUpdated = () => { setEditModal(false); setEditEvent(null); loadEvents(); };
  const handleOpenEdit = (ev) => { setEditEvent(ev); setEditModal(true); };

  const handleDeleteEvent = (id) => {
    Alert.alert('Delete Event', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await calendarAPI.deleteEvent(id);
          setEvents(prev => prev.filter(e => e.id !== id));
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not delete event.');
        }
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
          <View style={s.row}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
              <Icon lib="FA5" name="arrow-left" size={18} color={C.white} />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={s.headerTitle}>Calendar & Schedule</Text>
              <Text style={s.headerSub}>Manage hearings & meetings</Text>
            </View>
          </View>
        </View>
        <View style={s.row}>
          <View style={[s.monthBtn, { flex: 1, marginRight: 10 }]}>
            <Icon lib="FA5" name="calendar-day" size={14} color={C.white} />
            <Text style={s.monthBtnText}>{MONTH_NAMES[calMonth]} {calYear}</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => setAddModal(true)}>
            <Icon lib="ION" name="add" size={22} color={C.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} tintColor={C.primary} />}
      >

        {/* VIEW TOGGLE */}
        <View style={s.viewToggleWrap}>
          <View style={s.viewToggleInner}>
            {[
              { key: 'week',  iconLib: 'FA5', iconName: 'calendar-week', label: 'Week'  },
              { key: 'month', iconLib: 'FA5', iconName: 'calendar',      label: 'Month' },
              { key: 'list',  iconLib: 'FA5', iconName: 'list',          label: 'List'  },
            ].map((v) => (
              <TouchableOpacity key={v.key} style={[s.viewToggleBtn, viewMode === v.key && s.viewToggleBtnActive]} onPress={() => setViewMode(v.key)}>
                <Icon lib={v.iconLib} name={v.iconName} size={13} color={viewMode === v.key ? C.primary : C.gray600} />
                <Text style={[s.viewToggleText, viewMode === v.key && { color: C.primary }]}> {v.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* MINI CALENDAR */}
        <View style={[s.section, { backgroundColor: C.blue50 }]}>
          <View style={s.calendarCard}>
            <View style={s.calendarHeader}>
              <TouchableOpacity onPress={prevMonth}><Icon lib="FA5" name="chevron-left" size={14} color={C.white} /></TouchableOpacity>
              <Text style={s.calendarHeaderText}>{MONTH_NAMES[calMonth]} {calYear}</Text>
              <TouchableOpacity onPress={nextMonth}><Icon lib="FA5" name="chevron-right" size={14} color={C.white} /></TouchableOpacity>
            </View>
            <View style={s.calendarBody}>
              <View style={s.calRow}>
                {DAY_NAMES.map(d => <Text key={d} style={s.calDayLabel}>{d}</Text>)}
              </View>
              {calGrid.map((row, ri) => (
                <View key={ri} style={s.calRow}>
                  {row.map((cell, ci) => {
                    const isToday = cell.cur && Number(cell.d) === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
                    const key = cell.cur ? `${calYear}-${calMonth}-${Number(cell.d)}` : null;
                    const dots = key ? (eventDotMap[key] || []) : [];
                    return (
                      <TouchableOpacity key={ci} style={[s.calCell, isToday && s.calCellToday]}>
                        <Text style={[s.calCellText, (cell.prev || cell.next) && { color: C.gray400 }, isToday && { color: C.white, fontWeight: '700' }]}>{cell.d}</Text>
                        {dots.length > 0 && <View style={[s.calDot, { backgroundColor: dots[0] }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={{ paddingBottom: 12, paddingHorizontal: 8 }}>
              <View style={[s.row, { justifyContent: 'center', flexWrap: 'wrap', gap: 12 }]}>
                {[
                  { color: C.red500,    label: 'Hearing'      },
                  { color: C.amber500,  label: 'Meeting'      },
                  { color: C.blue500,   label: 'Deadline'     },
                  { color: C.green500,  label: 'Consultation' },
                  { color: C.purple600, label: 'Court Date'   },
                ].map((l, i) => (
                  <View key={i} style={s.row}>
                    <View style={[s.legendDot, { backgroundColor: l.color }]} />
                    <Text style={s.legendText}>{l.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* FILTER TABS */}
        <View style={s.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTER_TABS.map((t) => {
              const active = activeFilter === t.key;
              return (
                <TouchableOpacity key={t.key} style={[s.filterTab, { backgroundColor: active ? C.primary : C.white, borderWidth: 1, borderColor: active ? C.primary : C.gray200, marginRight: 8 }]} onPress={() => setActiveFilter(t.key)}>
                  <Icon lib={t.iconLib} name={t.iconName} size={12} color={active ? C.white : C.gray700} />
                  <Text style={[s.filterTabText, { color: active ? C.white : C.gray700, marginLeft: 6 }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── WEEK VIEW ── */}
        {viewMode === 'week' && (
          <>
            {/* Today */}
            <View style={[s.section, { backgroundColor: '#FFF5F5' }]}>
              <Text style={s.sectionTitle}>Today — {now.getDate()} {MONTH_NAMES[now.getMonth()]}</Text>
              <Text style={[s.xs, { marginBottom: 12 }]}>{todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}</Text>
              {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />}
              {!loading && todayEvents.length === 0 && <View style={s.emptyBox}><Icon lib="FA5" name="calendar-check" size={28} color={C.gray400} /><Text style={[s.xs, { marginTop: 8, color: C.gray500 }]}>No events today</Text></View>}
              {todayEvents.map(ev => <EventCard key={ev.id} ev={ev} onDelete={handleDeleteEvent} onEdit={handleOpenEdit} currentUserId={currentUserId} />)}
            </View>
            {/* Rest of week */}
            <View style={s.section}>
              <Text style={[s.sectionTitle, { marginBottom: 12 }]}>This Week</Text>
              {!loading && weekByDay.every(d => d.events.length === 0) && <View style={s.emptyBox}><Icon lib="FA5" name="calendar" size={28} color={C.gray400} /><Text style={[s.xs, { marginTop: 8, color: C.gray500 }]}>No events this week</Text></View>}
              {weekByDay.map(({ dayName, day, events: dayEvs }) => dayEvs.length === 0 ? null : (
                <View key={dayName} style={{ marginBottom: 14 }}>
                  <View style={[s.row, { marginBottom: 8 }]}>
                    <View style={[s.dayLabelBadge, day.toDateString() === now.toDateString() && { backgroundColor: C.primary }]}>
                      <Text style={[s.dayLabelText, day.toDateString() === now.toDateString() && { color: C.white }]}>{dayName} {day.getDate()}</Text>
                    </View>
                  </View>
                  {dayEvs.map(ev => <EventCard key={ev.id} ev={ev} onDelete={handleDeleteEvent} onEdit={handleOpenEdit} currentUserId={currentUserId} />)}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── MONTH VIEW ── */}
        {viewMode === 'month' && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { marginBottom: 12 }]}>{MONTH_NAMES[calMonth]} {calYear}</Text>
            {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />}
            {!loading && monthEvents.length === 0 && <View style={s.emptyBox}><Icon lib="FA5" name="calendar" size={28} color={C.gray400} /><Text style={[s.xs, { marginTop: 8, color: C.gray500 }]}>No events this month</Text></View>}
            {monthEvents.map(ev => <EventCard key={ev.id} ev={ev} onDelete={handleDeleteEvent} onEdit={handleOpenEdit} currentUserId={currentUserId} showDate />)}
          </View>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === 'list' && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { marginBottom: 12 }]}>All Events</Text>
            {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />}
            {!loading && listEvents.length === 0 && <View style={s.emptyBox}><Icon lib="FA5" name="list" size={28} color={C.gray400} /><Text style={[s.xs, { marginTop: 8, color: C.gray500 }]}>No events found</Text></View>}
            {listEvents.map(ev => <EventCard key={ev.id} ev={ev} onDelete={handleDeleteEvent} onEdit={handleOpenEdit} currentUserId={currentUserId} showDate />)}
          </View>
        )}

        {/* REMINDER PREFERENCES */}
        <View style={[s.section, { backgroundColor: C.indigo50 }]}>
          <Text style={[s.sectionTitle, { marginBottom: 14 }]}>Reminder Preferences</Text>
          <View style={s.prefCard}>
            {REMINDER_PREFS_META.map((p, i) => (
              <View key={p.key} style={[s.prefRow, i < REMINDER_PREFS_META.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.gray100, marginBottom: 14 }]}>
                <View style={[s.iconBtn40, { backgroundColor: p.iconBg }]}>
                  <Icon lib={p.iconLib} name={p.iconName} size={16} color={p.iconColor} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.smBold}>{p.title}</Text>
                  <Text style={s.xs}>{p.sub}</Text>
                </View>
                <Switch
                  value={!!reminderToggles[p.key]}
                  onValueChange={val => handleReminderToggle(p.key, val)}
                  trackColor={{ false: C.gray200, true: p.onColor }}
                  thumbColor={C.white}
                />
              </View>
            ))}
            <View style={{ marginTop: 14 }}>
              <Text style={[s.smBold, { marginBottom: 10 }]}>Default Reminder Time</Text>
              {[
                { key: '30min', label: '30 minutes before' },
                { key: '1h',    label: '1 hour before'     },
                { key: '1d',    label: '1 day before'      },
              ].map((r) => (
                <TouchableOpacity key={r.key} style={[s.reminderOption, selectedReminder === r.key && { backgroundColor: C.blue50 }]} onPress={() => handleReminderTime(r.key)}>
                  <Text style={[s.sm, selectedReminder === r.key && { color: C.primary, fontWeight: '600' }]}>{r.label}</Text>
                  {selectedReminder === r.key && <Icon lib="FA5" name="check" size={12} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </View>

          </View>
        </View>

      </ScrollView>

      <AddEventModal visible={addModal} onClose={() => setAddModal(false)} onCreated={handleEventCreated} />
      <EditEventModal visible={editModal} event={editEvent} onClose={() => { setEditModal(false); setEditEvent(null); }} onUpdated={handleEventUpdated} />
    </SafeAreaView>
  );
}

// ─── MODAL STYLES ─────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%', flexShrink: 1 },
  sheetHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.dark },
  label:      { fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 6, marginTop: 14 },
  input:      { borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark, backgroundColor: C.gray50 },
  typeRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.white },
  typeBtnText:{ fontSize: 13, fontWeight: '600', color: C.gray500 },
  pickerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.gray50 },
  pickerBtnText: { fontSize: 14, color: C.dark, fontWeight: '500', flex: 1 },
  calPicker:     { borderWidth: 1, borderColor: C.gray200, borderRadius: 14, overflow: 'hidden', marginTop: 8, marginBottom: 4 },
  calPickerHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 10 },
  calPickerTitle:{ color: C.white, fontWeight: '700', fontSize: 14 },
  calNavBtn:     { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  timeRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput:     { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  timeSep:       { fontSize: 22, fontWeight: '700', color: C.dark },
  createBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  createBtnText: { color: C.white, fontWeight: '700', fontSize: 15 },
  caseList:      { gap: 6, marginBottom: 4 },
  caseRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200 },
  caseRowActive: { borderColor: C.primary, backgroundColor: C.blue50 },
  radio:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.gray400, alignItems: 'center', justifyContent: 'center' },
  radioActive:   { borderColor: C.primary },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  caseText:      { fontSize: 13, color: C.gray600, flex: 1 },
  caseTextActive:{ color: C.primary, fontWeight: '600' },
  // Video call
  videoToggleRow:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.gray200, borderRadius: 14, padding: 14, backgroundColor: C.gray50 },
  videoToggleRowActive: { borderColor: C.green500, backgroundColor: C.green50 },
  videoIconWrap:        { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  videoToggleTitle:     { fontSize: 14, fontWeight: '700', color: C.dark },
  videoToggleSub:       { fontSize: 12, color: C.gray500, marginTop: 2 },
  videoUrlRow:          { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.gray50, marginBottom: 4 },
  videoUrlInput:        { flex: 1, fontSize: 13, color: C.dark },
  // Participants
  participantList:   { gap: 8, marginBottom: 4 },
  participantRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, padding: 10, backgroundColor: C.white },
  participantAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  participantName:   { fontSize: 13, fontWeight: '700', color: C.dark },
  participantEmail:  { fontSize: 11, color: C.gray500, flexShrink: 1 },
  roleTag:           { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  checkbox:          { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.gray300, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  // Recurrence
  recRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  recBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.gray200 },
  recBtnActive:    { backgroundColor: C.primary, borderColor: C.primary },
  recText:         { fontSize: 12, fontWeight: '600', color: C.gray600 },
  recTextActive:   { color: C.white },
  limitBox:        { marginTop: 12, backgroundColor: C.gray50, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: C.gray200 },
  limitToggle:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  limitTab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray200 },
  limitTabActive:  { backgroundColor: C.primary, borderColor: C.primary },
  limitTabTxt:     { fontSize: 12, fontWeight: '600', color: C.gray600 },
  limitTabTxtActive: { color: C.white },
  countRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBtn:        { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  countInput:      { width: 56, textAlign: 'center', fontSize: 20, fontWeight: '800', color: C.dark, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingVertical: 4 },
  countUnit:       { fontSize: 13, fontWeight: '600', color: C.gray500 },
});

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.primary },
  scroll:             { flex: 1, backgroundColor: C.gray50 },
  row:                { flexDirection: 'row', alignItems: 'center' },
  header:             { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:            { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle:        { fontSize: 17, fontWeight: '700', color: C.white },
  headerSub:          { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  monthBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingVertical: 10, gap: 8 },
  monthBtnText:       { color: C.white, fontWeight: '600', fontSize: 14 },
  addBtn:             { width: 44, height: 44, backgroundColor: C.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  viewToggleWrap:     { backgroundColor: C.white, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  viewToggleInner:    { flexDirection: 'row', backgroundColor: C.gray100, borderRadius: 12, padding: 4 },
  viewToggleBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  viewToggleBtnActive:{ backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  viewToggleText:     { fontSize: 13, fontWeight: '600', color: C.gray600 },
  section:            { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white, marginBottom: 2 },
  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:       { fontSize: 17, fontWeight: '700', color: C.dark },
  sectionAction:      { fontSize: 13, fontWeight: '600', color: C.primary },
  calendarCard:       { backgroundColor: C.white, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  calendarHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 12 },
  calendarHeaderText: { color: C.white, fontWeight: '700', fontSize: 15 },
  calendarBody:       { padding: 12 },
  calRow:             { flexDirection: 'row', marginBottom: 4 },
  calDayLabel:        { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: C.gray500, paddingVertical: 6 },
  calCell:            { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  calCellToday:       { backgroundColor: C.primary },
  calCellText:        { fontSize: 13, fontWeight: '500', color: C.dark },
  calDot:             { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  legendDot:          { width: 8, height: 8, borderRadius: 4 },
  legendText:         { fontSize: 11, color: C.gray600, marginLeft: 4 },
  filterTab:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  filterTabText:      { fontSize: 13, fontWeight: '600' },
  card:               { backgroundColor: C.white, borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  timeBox:            { width: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 8, marginRight: 12 },
  timeText:           { fontSize: 15, fontWeight: '700' },
  timePeriod:         { fontSize: 11, fontWeight: '600' },
  tag:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText:            { fontSize: 11, fontWeight: '600' },
  cardTitle:          { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  smBold:             { fontSize: 14, fontWeight: '700', color: C.dark },
  sm:                 { fontSize: 13, color: C.gray700 },
  xs:                 { fontSize: 12, color: C.gray500 },
  weekDayBox:         { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  weekDayShort:       { fontSize: 11, fontWeight: '600' },
  weekDayNum:         { fontSize: 18, fontWeight: '700' },
  prefCard:           { backgroundColor: C.white, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  prefRow:            { flexDirection: 'row', alignItems: 'center', paddingBottom: 14 },
  iconBtn40:          { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reminderOption:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 6 },
  joinBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green600, borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  joinBtnTxt:         { color: C.white, fontWeight: '700', fontSize: 13 },
  iconActionBtn:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.gray100 },
  emptyBox:           { alignItems: 'center', paddingVertical: 24 },
  dayLabelBadge:      { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: C.gray100 },
  dayLabelText:       { fontSize: 13, fontWeight: '700', color: C.gray700 },
});
