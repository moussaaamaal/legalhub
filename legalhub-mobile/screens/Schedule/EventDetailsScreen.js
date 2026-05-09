import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { documentsAPI, tasksAPI, casesAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo600: '#4F46E5',
};

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

const localH = (d) => (d.getUTCHours() + APP_TZ_OFFSET_H) % 24;
const localM = (d) => d.getUTCMinutes();
const localD = (d) => new Date(d.getTime() + APP_TZ_OFFSET_H * 3600000);

const getEventStyle = (eventType) => {
  const t = (eventType || '').toUpperCase();
  if (['HEARING', 'COURT_DATE'].includes(t))
    return { label: 'Urgent',  color: C.red600,   bg: C.red50,   border: '#EF4444', timeBg: C.red100,   timeColor: C.red600   };
  if (['DEADLINE', 'FILING'].includes(t))
    return { label: 'High',    color: C.amber600, bg: C.amber50, border: C.amber500, timeBg: C.amber100, timeColor: C.amber600 };
  if (['MEDIATION', 'ARBITRATION', 'DEPOSITION'].includes(t))
    return { label: 'Medium',  color: C.amber600, bg: C.amber50, border: C.amber500, timeBg: C.amber100, timeColor: C.amber600 };
  return   { label: 'Normal',  color: C.blue600,  bg: C.blue50,  border: C.secondary, timeBg: C.blue100, timeColor: C.blue600  };
};

const EVENT_TYPE_LABEL = {
  HEARING: 'Court Hearing', COURT_DATE: 'Court Date', MEETING: 'Meeting',
  CONSULTATION: 'Consultation', DEADLINE: 'Deadline', FILING: 'Filing',
  DEPOSITION: 'Deposition', MEDIATION: 'Mediation', ARBITRATION: 'Arbitration',
};

const DOC_ICONS = {
  'application/pdf': { icon: 'file-pdf',  color: C.red600,  bg: C.red100  },
  'application/msword': { icon: 'file-word', color: C.blue600, bg: C.blue100 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: 'file-word', color: C.blue600, bg: C.blue100 },
  'image/jpeg': { icon: 'file-image', color: C.blue600, bg: C.blue100 },
  'image/png':  { icon: 'file-image', color: C.blue600, bg: C.blue100 },
};
const getDocIcon = (mime) => DOC_ICONS[mime] || { icon: 'file-alt', color: C.g500, bg: C.g100 };

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const PRIORITY_COLORS = {
  HIGH:   { color: C.red600,   bg: C.red50   },
  MEDIUM: { color: C.amber600, bg: C.amber50 },
  LOW:    { color: C.green600, bg: C.green50 },
};

const formatDueDate = (dateStr, done) => {
  if (done) return 'Done';
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.round((d - new Date()) / 86400000);
  if (diff === 0)  return 'Due Today';
  if (diff === 1)  return 'Due Tomorrow';
  if (diff < 0)   return `Overdue (${Math.abs(diff)}d)`;
  return `Due in ${diff}d`;
};

function InfoRow({ icon, label, value }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>
        <FontAwesome5 name={icon} size={12} color={C.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function TabPlaceholder({ icon, text }) {
  return (
    <View style={s.emptyState}>
      <FontAwesome5 name={icon} size={36} color={C.g400} />
      <Text style={s.emptyTxt}>{text}</Text>
    </View>
  );
}

export default function EventDetailsScreen({ event, navigation }) {
  const [activeTab,  setActiveTab]  = useState('overview');
  const [documents,  setDocuments]  = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [timeline,   setTimeline]   = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);

  const evStyle   = getEventStyle(event?.event_type);
  const dt        = event?.start_datetime ? parseDate(event.start_datetime) : null;
  const h         = dt ? localH(dt) : 0;
  const m         = dt ? localM(dt) : 0;
  const time      = dt ? `${h % 12 || 12}:${String(m).padStart(2, '0')}` : '--:--';
  const period    = dt ? (h >= 12 ? 'PM' : 'AM') : '';
  const dateStr   = dt ? localD(dt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const typeLabel = EVENT_TYPE_LABEL[(event?.event_type || '').toUpperCase()]
                  || (event?.event_type || '').replace(/_/g, ' ').trim()
                  || 'Event';
  const caseTitle = event?.case_file?.title || null;
  const caseId    = event?.case_id || null;

  const loadTabData = useCallback(async (tab) => {
    if (!caseId) return;
    setLoadingTab(true);
    try {
      if (tab === 'documents') {
        const data = await documentsAPI.list({ case_id: caseId });
        setDocuments(Array.isArray(data) ? data : []);
      } else if (tab === 'tasks') {
        const data = await tasksAPI.list({ case_id: caseId });
        setTasks(Array.isArray(data) ? data : []);
      } else if (tab === 'timeline') {
        const data = await casesAPI.getTimeline(caseId);
        setTimeline(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('EventDetails tab error:', e.message);
    } finally {
      setLoadingTab(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (activeTab !== 'overview') loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const TABS = ['overview', 'documents', 'tasks', 'timeline'];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── Header ── */}
      <View style={[s.header, { borderBottomColor: evStyle.border }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{event?.title || 'Event Details'}</Text>
            <Text style={s.headerSub}>{typeLabel}</Text>
          </View>
          <TouchableOpacity style={s.moreBtn}>
            <FontAwesome5 name="ellipsis-v" size={16} color={C.white} />
          </TouchableOpacity>
        </View>
        <View style={s.headerMeta}>
          <View style={[s.timePill, { backgroundColor: evStyle.timeBg }]}>
            <FontAwesome5 name="clock" size={11} color={evStyle.timeColor} />
            <Text style={[s.timePillTxt, { color: evStyle.timeColor }]}>{time} {period}</Text>
          </View>
          <View style={[s.priorityPill, { backgroundColor: evStyle.bg }]}>
            <Text style={[s.priorityPillTxt, { color: evStyle.color }]}>{evStyle.label}</Text>
          </View>
          <View style={[s.tagPill, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Text style={s.tagPillTxt}>{typeLabel}</Text>
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <View>
            {/* Linked case */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>{caseTitle ? 'Linked Case' : 'Case'}</Text>
              {caseTitle ? (
                <View style={s.row}>
                  <View style={s.caseIconWrap}>
                    <FontAwesome5 name="briefcase" size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.clientName}>{caseTitle}</Text>
                  </View>
                </View>
              ) : (
                <Text style={[s.noteText, { color: C.g400 }]}>No case linked to this event.</Text>
              )}
            </View>

            {/* Event details */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Event Details</Text>
              <View style={s.infoGrid}>
                <InfoRow icon="calendar-alt"  label="Date"     value={dateStr} />
                <InfoRow icon="clock"         label="Time"     value={`${time} ${period}`} />
                <InfoRow icon="tag"           label="Type"     value={typeLabel} />
                {event?.location    ? <InfoRow icon="map-marker-alt" label="Location" value={event.location} /> : null}
                {event?.is_video_call ? <InfoRow icon="video"  label="Format"   value="Video Call" /> : null}
              </View>
            </View>

            {/* Notes / description */}
            {event?.description ? (
              <View style={[s.card, { backgroundColor: C.amber50, borderColor: '#FCD34D', borderWidth: 1 }]}>
                <View style={[s.row, { marginBottom: 10 }]}>
                  <FontAwesome5 name="sticky-note" size={14} color={C.amber600} />
                  <Text style={[s.sectionTitle, { marginLeft: 8, color: C.amber600, marginBottom: 0 }]}>Notes</Text>
                </View>
                <Text style={s.noteText}>{event.description}</Text>
              </View>
            ) : null}

            {/* Quick actions */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Quick Actions</Text>
              <View style={s.actionGrid}>
                {[
                  { icon: 'map-marker-alt', label: 'Directions', bg: C.blue50,   color: C.primary   },
                  { icon: 'bell',           label: 'Reminder',   bg: C.amber50,  color: C.amber600  },
                  { icon: 'robot',          label: 'AI Prep',    bg: C.indigo50, color: C.indigo600 },
                  { icon: 'share-alt',      label: 'Share',      bg: C.green50,  color: C.green600  },
                ].map((a, i) => (
                  <TouchableOpacity key={i} style={[s.actionCard, { backgroundColor: a.bg }]}>
                    <FontAwesome5 name={a.icon} size={18} color={a.color} />
                    <Text style={[s.actionLabel, { color: a.color }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ══ DOCUMENTS ══ */}
        {activeTab === 'documents' && (
          loadingTab ? (
            <View style={s.center}>
              <ActivityIndicator color={C.primary} />
              <Text style={s.centerTxt}>Loading documents…</Text>
            </View>
          ) : !caseId ? (
            <TabPlaceholder icon="unlink" text="No case linked to this event" />
          ) : documents.length === 0 ? (
            <TabPlaceholder icon="folder-open" text="No documents for this case" />
          ) : (
            documents.map((doc) => {
              const di = getDocIcon(doc.file_type);
              return (
                <View key={doc.id} style={s.card}>
                  <View style={s.row}>
                    <View style={[s.docIconWrap, { backgroundColor: di.bg }]}>
                      <FontAwesome5 name={di.icon} size={22} color={di.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.docName} numberOfLines={1}>{doc.filename || doc.name || 'Document'}</Text>
                      <Text style={s.docSize}>{formatFileSize(doc.file_size)}</Text>
                    </View>
                    <View style={s.row}>
                      <TouchableOpacity style={[s.docBtn, { backgroundColor: C.blue50 }]}>
                        <FontAwesome5 name="eye" size={13} color={C.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.docBtn, { backgroundColor: C.green50, marginLeft: 6 }]}>
                        <FontAwesome5 name="download" size={13} color={C.green600} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )
        )}

        {/* ══ TASKS ══ */}
        {activeTab === 'tasks' && (
          loadingTab ? (
            <View style={s.center}>
              <ActivityIndicator color={C.primary} />
              <Text style={s.centerTxt}>Loading tasks…</Text>
            </View>
          ) : !caseId ? (
            <TabPlaceholder icon="unlink" text="No case linked to this event" />
          ) : tasks.length === 0 ? (
            <TabPlaceholder icon="tasks" text="No tasks for this case" />
          ) : (
            tasks.map((task) => {
              const done = task.status === 'DONE';
              const p    = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.LOW;
              return (
                <View key={task.id} style={[s.card, s.row, { gap: 12 }]}>
                  <View style={[s.checkbox, done && s.checkboxDone]}>
                    {done && <FontAwesome5 name="check" size={10} color={C.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.taskTitle, done && s.taskTitleDone]}>{task.title}</Text>
                    <View style={[s.row, { gap: 6, marginTop: 4 }]}>
                      {task.priority ? (
                        <View style={[s.miniPill, { backgroundColor: p.bg }]}>
                          <Text style={[s.miniPillTxt, { color: p.color }]}>{task.priority}</Text>
                        </View>
                      ) : null}
                      <Text style={[s.taskDue, { color: done ? C.green600 : C.amber600 }]}>
                        {formatDueDate(task.due_date, done)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )
        )}

        {/* ══ TIMELINE ══ */}
        {activeTab === 'timeline' && (
          loadingTab ? (
            <View style={s.center}>
              <ActivityIndicator color={C.primary} />
              <Text style={s.centerTxt}>Loading timeline…</Text>
            </View>
          ) : !caseId ? (
            <TabPlaceholder icon="unlink" text="No case linked to this event" />
          ) : timeline.length === 0 ? (
            <TabPlaceholder icon="history" text="No timeline entries" />
          ) : (
            timeline.map((item, i) => {
              const tDate = item.created_at ? new Date(item.created_at) : null;
              const tStr  = tDate ? tDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              return (
                <View key={item.id || i} style={s.timelineRow}>
                  <View style={s.timelineLeft}>
                    <View style={[s.timelineIcon, { backgroundColor: C.blue100 }]}>
                      <FontAwesome5 name="history" size={14} color={C.primary} />
                    </View>
                    {i < timeline.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  <View style={[s.card, { flex: 1, marginBottom: 12 }]}>
                    <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                      <View style={[s.tlBadge, { backgroundColor: C.blue50 }]}>
                        <Text style={[s.tlBadgeTxt, { color: C.primary }]}>Update</Text>
                      </View>
                      <Text style={s.tlTime}>{tStr}</Text>
                    </View>
                    <Text style={s.tlText}>{item.action || item.description || 'Event recorded'}</Text>
                  </View>
                </View>
              );
            })
          )
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  row:    { flexDirection: 'row', alignItems: 'center' },
  center: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  centerTxt: { fontSize: 13, color: C.g500 },

  header:    { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, borderBottomWidth: 3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  moreBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  headerMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timePill:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  timePillTxt:   { fontSize: 12, fontWeight: '700' },
  priorityPill:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  priorityPillTxt: { fontSize: 11, fontWeight: '700' },
  tagPill:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  tagPillTxt:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  tabBar:    { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200 },
  tab:       { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabTxt:    { fontSize: 12, fontWeight: '600', color: C.g500 },
  tabTxtActive: { color: C.primary, fontWeight: '700' },

  card:         { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 12 },

  caseIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  clientName:   { fontSize: 14, fontWeight: '700', color: C.dark },

  infoGrid:    { gap: 10 },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  infoIconWrap:{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoLabel:   { fontSize: 10, color: C.g400, marginBottom: 1 },
  infoValue:   { fontSize: 13, fontWeight: '600', color: C.dark },

  noteText: { fontSize: 13, color: C.g600, lineHeight: 20 },

  actionGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard:  { width: '47%', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  actionLabel: { fontSize: 12, fontWeight: '700' },

  docIconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docName:     { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 2 },
  docSize:     { fontSize: 11, color: C.g400 },
  docBtn:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.g400, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxDone:  { backgroundColor: C.primary, borderColor: C.primary },
  taskTitle:     { fontSize: 14, fontWeight: '700', color: C.dark },
  taskTitleDone: { textDecorationLine: 'line-through', color: C.g400 },
  taskDue:       { fontSize: 11, fontWeight: '600' },
  miniPill:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  miniPillTxt:   { fontSize: 10, fontWeight: '700' },

  timelineRow:  { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center' },
  timelineIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  timelineLine: { width: 2, flex: 1, backgroundColor: C.g200, marginVertical: 4 },
  tlBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tlBadgeTxt:   { fontSize: 10, fontWeight: '700' },
  tlTime:       { fontSize: 11, color: C.g400 },
  tlText:       { fontSize: 13, color: C.g600, lineHeight: 18 },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTxt:   { fontSize: 14, color: C.g400, fontWeight: '500' },
});
