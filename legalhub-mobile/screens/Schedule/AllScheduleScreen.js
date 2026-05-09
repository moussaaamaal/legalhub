import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { calendarAPI } from '../../services/api';
import EventDetailsScreen from './EventDetailsScreen';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
};

const FILTER_TABS = ['All', 'Today', 'Tomorrow', 'This Week', 'Urgent'];

// ─── Style par type d'événement ──────────────────────────────────────────────
const EVENT_TYPE_META = {
  HEARING:      { icon: 'gavel',          label: 'Court Hearing', color: C.red600,    bg: C.red50,    border: C.red500,    timeBg: C.red100,    timeColor: C.red600    },
  COURT_DATE:   { icon: 'landmark',       label: 'Court Date',    color: C.purple600, bg: C.purple50, border: C.purple600, timeBg: C.purple100, timeColor: C.purple600 },
  MEETING:      { icon: 'handshake',      label: 'Meeting',       color: C.amber600,  bg: C.amber50,  border: C.amber500,  timeBg: C.amber100,  timeColor: C.amber600  },
  CONSULTATION: { icon: 'comments',       label: 'Consultation',  color: C.green600,  bg: C.green50,  border: C.green600,  timeBg: C.green100,  timeColor: C.green600  },
  DEADLINE:     { icon: 'clock',          label: 'Deadline',      color: C.blue600,   bg: C.blue50,   border: C.blue600,   timeBg: C.blue100,   timeColor: C.blue600   },
  FILING:       { icon: 'file-signature', label: 'Filing',        color: C.amber600,  bg: C.amber50,  border: C.amber500,  timeBg: C.amber100,  timeColor: C.amber600  },
  DEPOSITION:   { icon: 'microphone',     label: 'Deposition',    color: C.red600,    bg: C.red50,    border: C.red500,    timeBg: C.red100,    timeColor: C.red600    },
  MEDIATION:    { icon: 'balance-scale',  label: 'Mediation',     color: C.green600,  bg: C.green50,  border: C.green600,  timeBg: C.green100,  timeColor: C.green600  },
  ARBITRATION:  { icon: 'balance-scale',  label: 'Arbitration',   color: C.purple600, bg: C.purple50, border: C.purple600, timeBg: C.purple100, timeColor: C.purple600 },
};
const EV_DEFAULT_META = { icon: 'calendar-check', label: 'Event', color: C.blue600, bg: C.blue50, border: C.secondary, timeBg: C.blue100, timeColor: C.blue600 };

const EVENT_TYPE_LABEL = {
  HEARING:      'Court Hearing',
  COURT_DATE:   'Court Date',
  MEETING:      'Meeting',
  CONSULTATION: 'Consultation',
  DEADLINE:     'Deadline',
  FILING:       'Filing',
  DEPOSITION:   'Deposition',
  MEDIATION:    'Mediation',
  ARBITRATION:  'Arbitration',
};

// ─── Helpers date ─────────────────────────────────────────────────────────────

// No UTC conversion — times are stored and displayed as entered by the user.
const APP_TZ_OFFSET_H = 0;

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

// Africa/Tunis local hour and shifted date (device-timezone-independent)
const localH = (d) => (d.getUTCHours() + APP_TZ_OFFSET_H) % 24;
const localM = (d) => d.getUTCMinutes();
const localD = (d) => new Date(d.getTime() + APP_TZ_OFFSET_H * 3600000);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const formatGroupDate = (date) => {
  const today    = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString())    return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const groupByDate = (events) => {
  const map = {};
  for (const ev of events) {
    const d   = localD(parseDate(ev.start_datetime)); // shift to Africa/Tunis
    const key = d.toUTCString().slice(0, 16);         // "Mon, 27 Apr 2026" as stable key
    if (!map[key]) map[key] = { date: d, events: [] };
    map[key].events.push(ev);
  }
  return Object.entries(map)
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([key, { date, events }]) => ({
      dateKey: key,
      label:   formatGroupDate(date),
      isToday: key === localD(new Date()).toUTCString().slice(0, 16),
      events:  events.sort((a, b) => parseDate(a.start_datetime) - parseDate(b.start_datetime)),
    }));
};

const applyFilter = (events, idx) => {
  const today    = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const weekEnd  = new Date(today); weekEnd.setDate(today.getDate() + 7);
  switch (idx) {
    case 1: return events.filter(ev => { const d = parseDate(ev.start_datetime); return d >= today && d < tomorrow; });
    case 2: return events.filter(ev => { const d = parseDate(ev.start_datetime); return d >= tomorrow && d < new Date(tomorrow.getTime() + 86400000); });
    case 3: return events.filter(ev => { const d = parseDate(ev.start_datetime); return d >= today && d < weekEnd; });
    case 4: return events.filter(ev => ['HEARING', 'COURT_DATE', 'DEADLINE', 'FILING'].includes((ev.event_type || '').toUpperCase()));
    default: return events;
  }
};

// ─── ÉCRAN ────────────────────────────────────────────────────────────────────
export default function AllScheduleScreen({ navigation }) {
  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState(null);
  const [activeFilter,  setActiveFilter]  = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const now  = new Date().toISOString();
      const data = await calendarAPI.listEvents({ from_date: now });
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Schedule load error:', e.message);
      setError('Could not load events');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Stats calculées ───────────────────────────────────────────────────────
  const todayStart = startOfDay(new Date());
  const todayStr   = todayStart.toDateString();
  const weekEnd    = new Date(todayStart); weekEnd.setDate(todayStart.getDate() + 7);

  const todayCount  = events.filter(ev => new Date(ev.start_datetime).toDateString() === todayStr).length;
  const urgentCount = events.filter(ev => ['HEARING', 'COURT_DATE', 'DEADLINE'].includes((ev.event_type || '').toUpperCase())).length;
  const weekCount   = events.filter(ev => { const d = new Date(ev.start_datetime); return d >= todayStart && d < weekEnd; }).length;

  const STATS = [
    { val: String(todayCount),  label: "Today's Events", iconBg: C.blue100,  iconColor: C.primary,  icon: 'calendar-day'  },
    { val: String(urgentCount), label: 'Urgent',         iconBg: C.red100,   iconColor: C.red600,   icon: 'exclamation'   },
    { val: String(weekCount),   label: 'This Week',      iconBg: C.green100, iconColor: C.green600, icon: 'calendar-week' },
  ];

  // ── Filtrage et groupement ────────────────────────────────────────────────
  const filtered = applyFilter(events, activeFilter);
  const groups   = groupByDate(filtered);

  // ── Navigation vers détail ────────────────────────────────────────────────
  if (selectedEvent) {
    return (
      <EventDetailsScreen
        event={selectedEvent}
        navigation={{ goBack: () => setSelectedEvent(null) }}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>Schedule</Text>
            <Text style={s.headerSub}>All upcoming events & hearings</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {STATS.map((st, i) => (
            <View key={i} style={s.statItem}>
              <View style={[s.statIcon, { backgroundColor: st.iconBg }]}>
                <FontAwesome5 name={st.icon} size={14} color={st.iconColor} />
              </View>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
      >
        {FILTER_TABS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[s.filterTab, activeFilter === i && s.filterTabActive]}
            onPress={() => setActiveFilter(i)}
          >
            <Text style={[s.filterTabTxt, activeFilter === i && s.filterTabTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Contenu ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.centerTxt}>Loading events…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <FontAwesome5 name="exclamation-circle" size={36} color={C.g400} />
          <Text style={s.centerTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={handleRefresh}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} tintColor={C.primary} />
          }
        >
          {groups.length === 0 ? (
            <View style={s.emptyBox}>
              <FontAwesome5 name="calendar-times" size={40} color={C.g400} />
              <Text style={s.emptyTitle}>No events found</Text>
              <Text style={s.emptySubtitle}>
                {activeFilter === 0 ? 'Your schedule is clear.' : `No events match the "${FILTER_TABS[activeFilter]}" filter.`}
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.dateKey} style={{ marginBottom: 8 }}>

                {/* ── En-tête de groupe ── */}
                <View style={s.groupHeader}>
                  <View style={[s.groupDot, { backgroundColor: group.isToday ? C.red500 : C.g400 }]} />
                  <Text style={[s.groupTitle, group.isToday && { color: C.primary }]}>{group.label}</Text>
                  {group.isToday && (
                    <View style={s.todayPill}>
                      <Text style={s.todayPillTxt}>TODAY</Text>
                    </View>
                  )}
                  <Text style={s.groupCount}>{group.events.length} event{group.events.length > 1 ? 's' : ''}</Text>
                </View>

                {/* ── Événements ── */}
                {group.events.map((ev) => {
                  const evMeta   = EVENT_TYPE_META[(ev.event_type || '').toUpperCase()] ?? EV_DEFAULT_META;
                  const dt       = parseDate(ev.start_datetime);
                  const h        = localH(dt), m = localM(dt);
                  const time     = `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
                  const period   = h >= 12 ? 'PM' : 'AM';
                  const caseTitle = ev.case_file?.title || null;

                  return (
                    <View key={ev.id} style={[s.card, { borderLeftWidth: 4, borderLeftColor: evMeta.border }]}>
                      <View style={s.cardTop}>
                        {/* Icône + Heure */}
                        <View style={[s.timeBox, { backgroundColor: evMeta.timeBg }]}>
                          <FontAwesome5 name={evMeta.icon} size={12} color={evMeta.timeColor} style={{ marginBottom: 3 }} />
                          <Text style={[s.timeVal,    { color: evMeta.timeColor }]}>{time}</Text>
                          <Text style={[s.timePeriod, { color: evMeta.timeColor }]}>{period}</Text>
                        </View>

                        {/* Info */}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                          {ev.location ? (
                            <Text style={s.eventSub} numberOfLines={1}>📍 {ev.location}</Text>
                          ) : caseTitle ? (
                            <Text style={s.eventSub} numberOfLines={1}>📁 {caseTitle}</Text>
                          ) : null}
                          <View style={s.tagRow}>
                            <View style={[s.pill, { backgroundColor: evMeta.bg }]}>
                              <Text style={[s.pillTxt, { color: evMeta.color }]}>{evMeta.label}</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Footer */}
                      <View style={s.cardFooter}>
                        <View style={s.clientRow}>
                          <View style={[s.avatarCircle, { backgroundColor: evMeta.bg }]}>
                            <FontAwesome5 name={evMeta.icon} size={12} color={evMeta.color} />
                          </View>
                          <View style={{ marginLeft: 8 }}>
                            {caseTitle ? (
                              <Text style={s.clientName} numberOfLines={1}>{caseTitle}</Text>
                            ) : (
                              <Text style={[s.clientName, { color: C.g400 }]}>No case linked</Text>
                            )}
                            {ev.is_video_call && (
                              <Text style={s.videoTag}>📹 Video call</Text>
                            )}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={s.viewBtn}
                          onPress={() => setSelectedEvent(ev)}
                        >
                          <Text style={s.viewBtnTxt}>View</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.primary },
  scroll:     { flex: 1, backgroundColor: C.g50 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, gap: 12 },
  centerTxt:  { fontSize: 13, color: C.g500 },
  retryBtn:   { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12, marginTop: 4 },
  retryTxt:   { color: C.white, fontWeight: '700', fontSize: 13 },

  header:     { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },

  statsRow:   { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statItem:   { alignItems: 'center', gap: 4 },
  statIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statVal:    { fontSize: 18, fontWeight: '800', color: C.white },
  statLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.72)' },

  filterBar:        { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 52, flexGrow: 0 },
  filterTab:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:  { backgroundColor: C.primary },
  filterTabTxt:     { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive:{ color: C.white },

  groupHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  groupDot:     { width: 8, height: 8, borderRadius: 4 },
  groupTitle:   { fontSize: 14, fontWeight: '700', color: C.dark, flex: 1 },
  groupCount:   { fontSize: 11, color: C.g400 },
  todayPill:    { backgroundColor: C.red50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  todayPillTxt: { fontSize: 10, fontWeight: '800', color: C.red600 },

  card:       { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 10 },
  cardTop:    { flexDirection: 'row', marginBottom: 12 },
  timeBox:    { width: 56, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  timeVal:    { fontSize: 13, fontWeight: '800' },
  timePeriod: { fontSize: 10, fontWeight: '600' },
  eventTitle: { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  eventSub:   { fontSize: 12, color: C.g500, marginBottom: 6 },
  tagRow:     { flexDirection: 'row', gap: 6 },
  pill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillTxt:    { fontSize: 11, fontWeight: '600' },

  cardFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  clientRow:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  clientName:   { fontSize: 12, fontWeight: '700', color: C.dark, maxWidth: 160 },
  videoTag:     { fontSize: 10, color: C.g400, marginTop: 1 },
  viewBtn:      { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  viewBtnTxt:   { fontSize: 12, fontWeight: '700', color: C.white },

  emptyBox:      { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: C.dark },
  emptySubtitle: { fontSize: 13, color: C.g400, textAlign: 'center' },
});
