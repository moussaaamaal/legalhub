import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { tasksAPI, notesAPI, casesAPI } from '../../services/api';

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
};

// ─── Task helpers (identiques HomeScreen) ────────────────────────────────────
const TASK_PRIORITY = {
  URGENT: { label: 'Urgent', color: COLORS.red600,   bg: COLORS.red50   },
  HIGH:   { label: 'High',   color: COLORS.red600,   bg: COLORS.red50   },
  MEDIUM: { label: 'Medium', color: COLORS.amber600, bg: COLORS.amber50 },
  NORMAL: { label: 'Normal', color: COLORS.green600, bg: COLORS.green50 },
  LOW:    { label: 'Low',    color: COLORS.green600, bg: COLORS.green50 },
};

const getDueBadge = (dueDate, priority) => {
  if (!dueDate) return { badge: 'Pending', badgeColor: COLORS.amber600, badgeBg: COLORS.amber50, borderColor: COLORS.amber500, timeColor: COLORS.amber600 };
  const today = new Date().toISOString().split('T')[0];
  if (dueDate < today)   return { badge: 'Overdue',  badgeColor: COLORS.red600,   badgeBg: COLORS.red50,   borderColor: COLORS.red500,   timeColor: COLORS.red600   };
  if (dueDate === today) return { badge: 'Due Today', badgeColor: COLORS.red600,   badgeBg: COLORS.red50,   borderColor: COLORS.red500,   timeColor: COLORS.red600   };
  if (priority === 'URGENT' || priority === 'HIGH')
    return { badge: 'Urgent', badgeColor: COLORS.red600, badgeBg: COLORS.red50, borderColor: COLORS.red500, timeColor: COLORS.red600 };
  return { badge: 'Pending', badgeColor: COLORS.amber600, badgeBg: COLORS.amber50, borderColor: COLORS.amber500, timeColor: COLORS.amber600 };
};

const formatRelativeDate = (iso) => {
  if (!iso) return null;
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0)  return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7)  return `${diff}d left`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

// ─── Note helpers (identiques CaseDetailsScreen) ──────────────────────────────
const NOTE_COLORS = [
  { id: 'yellow', bg: '#FEF9C3', border: '#FDE047' },
  { id: 'blue',   bg: '#DBEAFE', border: '#93C5FD' },
  { id: 'green',  bg: '#DCFCE7', border: '#86EFAC' },
  { id: 'pink',   bg: '#FCE7F3', border: '#F9A8D4' },
  { id: 'purple', bg: '#F3E8FF', border: '#D8B4FE' },
  { id: 'orange', bg: '#FFEDD5', border: '#FED7AA' },
];
const NOTE_FALLBACKS = [
  { bg: COLORS.amber50,  border: COLORS.amber600 },
  { bg: COLORS.blue50,   border: COLORS.primary  },
  { bg: COLORS.purple50, border: COLORS.purple600 },
];

const parseInline = (text, inherited = {}) => {
  if (!text) return [];
  const patterns = [
    { re: /^\*\*\*(.+?)\*\*\*/, bold: true, italic: true },
    { re: /^\*\*(.+?)\*\*/,     bold: true               },
    { re: /^__(.+?)__/,                      underline: true },
    { re: /^\*(.+?)\*/,         italic: true              },
  ];
  const parts = [];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const p of patterns) {
      const m = p.re.exec(text.slice(i));
      if (m) {
        if (m.index > 0) parts.push({ text: text.slice(i, i + m.index), ...inherited });
        const formats = { ...inherited, ...(p.bold && { bold: true }), ...(p.italic && { italic: true }), ...(p.underline && { underline: true }) };
        parts.push(...parseInline(m[1], formats));
        i += m.index + m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const nextSpecial = text.slice(i).search(/\*\*\*|\*\*|__|(?<!\*)\*(?!\*)/);
      const take = nextSpecial === -1 ? text.length - i : nextSpecial || 1;
      parts.push({ text: text.slice(i, i + take), ...inherited });
      i += take;
    }
  }
  return parts;
};

const RichText = ({ text, style, numberOfLines }) => {
  const parts = parseInline(text || '');
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) => (
        <Text
          key={i}
          style={{
            fontWeight:      p.bold      ? '700' : undefined,
            fontStyle:       p.italic    ? 'italic' : undefined,
            textDecorationLine: p.underline ? 'underline' : undefined,
          }}
        >
          {p.text}
        </Text>
      ))}
    </Text>
  );
};

const toNoteDisplay = (note, idx) => {
  const raw        = note.content || '';
  const colorMatch = raw.match(/^\[color:(\w+)\]\n?/);
  const colorId    = colorMatch ? colorMatch[1] : null;
  const theme      = NOTE_COLORS.find(c => c.id === colorId);
  const style      = theme
    ? { bg: theme.bg, border: theme.border }
    : NOTE_FALLBACKS[idx % NOTE_FALLBACKS.length];
  const content    = colorMatch ? raw.slice(colorMatch[0].length) : raw;
  const dateLabel  = note.created_at
    ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  return {
    id: note.id, case_id: note.case_id,
    author: note.app_user?.full_name || note.author_name || 'Team Member',
    content, time: dateLabel,
    borderColor: style.border, bg: style.bg,
  };
};

// ─── Filter tabs (sans "In Progress") ────────────────────────────────────────
const STATUS_TABS = [
  { label: 'All',       key: 'ALL'       },
  { label: 'Pending',   key: 'PENDING'   },
  { label: 'Completed', key: 'COMPLETED' },
  { label: 'Notes',     key: 'NOTES'     },
];

// ─── TaskCard (identique HomeScreen) ─────────────────────────────────────────
function TaskCard({ item, onDone, onDelete }) {
  const done = item.status === 'COMPLETED';
  return (
    <View style={[st.card, { borderLeftWidth: 4, borderLeftColor: done ? COLORS.gray200 : item.borderColor, opacity: done ? 0.75 : 1 }]}>
      <View style={st.row}>
        <TouchableOpacity
          style={[st.checkbox, done && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
          onPress={() => onDone && onDone(item)}
        >
          {done && <FontAwesome5 name="check" size={10} color={COLORS.white} />}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          {/* Title + priority badge */}
          <View style={[st.row, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }]}>
            <Text style={[st.cardTitle, { flex: 1 }, done && { textDecorationLine: 'line-through', color: COLORS.gray400 }]}>{item.title}</Text>
            <View style={[st.tag, { backgroundColor: item.prioBg }]}>
              <Text style={[st.tagText, { color: item.prioColor }]}>{item.prioLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => onDelete && onDelete(item)} style={{ padding: 2 }}>
              <FontAwesome5 name="trash-alt" size={12} color={COLORS.gray400} />
            </TouchableOpacity>
          </View>
          {/* Description */}
          {!!item.description && (
            <Text style={[st.cardSubtitle, { marginBottom: 6 }, done && { textDecorationLine: 'line-through', color: COLORS.gray400 }]} numberOfLines={2}>{item.description}</Text>
          )}
          {/* Case name */}
          {!!item.caseName && (
            <View style={[st.row, { marginBottom: 3 }]}>
              <FontAwesome5 name="briefcase" size={10} color={COLORS.gray400} />
              <Text style={[st.gray500Sm, { marginLeft: 5 }]} numberOfLines={1}>{item.caseName}</Text>
            </View>
          )}
          {/* Lawyer + due date */}
          <View style={st.row}>
            {item.lawyerName ? (
              <>
                <FontAwesome5 name="user-tie" size={10} color={COLORS.gray400} />
                <Text style={[st.gray500Sm, { marginLeft: 5, flex: 1 }]} numberOfLines={1}>{item.lawyerName}</Text>
              </>
            ) : <View style={{ flex: 1 }} />}
            {!!item.timeLeft && (
              <View style={st.row}>
                <FontAwesome5 name="clock" size={10} color={item.timeColor} />
                <Text style={[st.gray500Sm, { color: item.timeColor, fontWeight: '600', marginLeft: 4 }]}>{item.timeLeft}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── NoteCard (identique CaseDetailsScreen + case label) ─────────────────────
function NoteCard({ note, caseName, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[nt.card, { backgroundColor: note.bg, borderLeftColor: note.borderColor }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={[nt.avatar, { backgroundColor: COLORS.blue100, alignItems: 'center', justifyContent: 'center' }]}>
          <FontAwesome5 name="user" size={14} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={nt.author}>{note.author}</Text>
          <Text style={nt.time}>{note.time}</Text>
        </View>
        <TouchableOpacity onPress={() => onDelete && onDelete(note)} style={{ padding: 4 }}>
          <FontAwesome5 name="trash-alt" size={13} color={COLORS.gray400} />
        </TouchableOpacity>
      </View>

      <RichText
        text={note.content}
        style={{ fontSize: 13, color: COLORS.gray600, lineHeight: 20 }}
        numberOfLines={expanded ? undefined : 4}
      />

      {/* Case badge */}
      {!!caseName && (
        <View style={[st.row, { marginTop: 8, gap: 5 }]}>
          <FontAwesome5 name="briefcase" size={10} color={note.borderColor} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: note.borderColor }}>{caseName}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[nt.readMore, { borderTopColor: note.borderColor + '40' }]}
        onPress={() => setExpanded(e => !e)}
      >
        <Text style={[nt.readMoreTxt, { color: note.borderColor }]}>{expanded ? 'Show less' : 'Read more'}</Text>
        <FontAwesome5 name={expanded ? 'chevron-up' : 'chevron-right'} size={10} color={note.borderColor} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function TasksNotesManagementScreen({ navigation }) {
  const [activeTab,  setActiveTab]  = useState(0);
  const [tasks,      setTasks]      = useState([]);
  const [notes,      setNotes]      = useState([]);
  const [caseMap,    setCaseMap]    = useState({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [t, n, cases] = await Promise.all([
        tasksAPI.list(),
        notesAPI.list(),
        casesAPI.list().catch(() => []),
      ]);
      setTasks(t || []);
      setNotes(n || []);
      const map = {};
      (cases || []).forEach(c => { map[c.id] = c.title || c.case_number || 'Case'; });
      setCaseMap(map);
    } catch (e) {
      if (!isRefresh) Alert.alert('Error', e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Map raw task → display shape (même logique que HomeScreen)
  const mapTask = (task) => {
    const dueBadge = getDueBadge(task.due_date, task.priority);
    const prioKey  = (task.priority || 'NORMAL').toUpperCase();
    const prioCfg  = TASK_PRIORITY[prioKey] || TASK_PRIORITY.NORMAL;
    return {
      id:          task.id,
      _raw:        task,
      status:      task.status,
      title:       task.title,
      description: task.description || null,
      caseName:    task.case_file?.title || task.case_file?.case_number || null,
      lawyerName:  task.app_user?.full_name || null,
      prioLabel:   prioCfg.label,
      prioColor:   prioCfg.color,
      prioBg:      prioCfg.bg,
      timeLeft:    task.due_date ? formatRelativeDate(task.due_date) : null,
      ...dueBadge,
    };
  };

  const handleToggle = useCallback(async (item) => {
    const task      = item._raw;
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await tasksAPI.updateStatus(task.id, newStatus);
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      Alert.alert('Error', e.message || 'Failed to update task');
    }
  }, []);

  const handleDeleteTask = useCallback((item) => {
    Alert.alert('Delete Task', `Delete "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setTasks(prev => prev.filter(t => t.id !== item.id));
          try { await tasksAPI.delete(item.id); } catch { load(); }
        },
      },
    ]);
  }, [load]);

  const handleDeleteNote = useCallback((note) => {
    Alert.alert('Delete Note', 'Delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setNotes(prev => prev.filter(n => n.id !== note.id));
          try { await notesAPI.delete(note.id); } catch { load(); }
        },
      },
    ]);
  }, [load]);

  const tabKey = STATUS_TABS[activeTab].key;
  const q      = search.toLowerCase();

  const filteredTasks = tasks
    .filter(t => tabKey === 'ALL' || tabKey === 'NOTES' || t.status === tabKey)
    .filter(t => !q || (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));

  const filteredNotes = notes.filter(n => !q || (n.content || '').toLowerCase().includes(q));

  const total     = tasks.length;
  const pending   = tasks.filter(t => t.status === 'PENDING').length;
  const completed = tasks.filter(t => t.status === 'COMPLETED').length;

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.gray50 }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* HEADER */}
      <View style={st.header}>
        <View style={st.headerRow}>
          <TouchableOpacity style={st.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.headerTitle}>Tasks & Notes</Text>
            <Text style={st.headerSub}>{total} task{total !== 1 ? 's' : ''} · {notes.length} note{notes.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>
        <View style={st.searchRow}>
          <FontAwesome5 name="search" size={14} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={st.searchInput}
            placeholder="Search tasks, notes..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <FontAwesome5 name="times" size={13} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
      >
        {/* STATS */}
        <View style={[st.section, { backgroundColor: COLORS.blue50 }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { icon: 'tasks',       iconColor: COLORS.primary,   iconBg: COLORS.blue100,   value: String(total),        label: 'Total'   },
              { icon: 'clock',       iconColor: COLORS.amber600,  iconBg: COLORS.amber100,  value: String(pending),      label: 'Pending' },
              { icon: 'check',       iconColor: COLORS.green600,  iconBg: COLORS.green100,  value: String(completed),    label: 'Done'    },
              { icon: 'sticky-note', iconColor: COLORS.purple600, iconBg: COLORS.purple100, value: String(notes.length), label: 'Notes'   },
            ].map((st2, i) => (
              <View key={i} style={st.statCard}>
                <View style={[st.statIcon, { backgroundColor: st2.iconBg }]}>
                  <FontAwesome5 name={st2.icon} size={16} color={st2.iconColor} />
                </View>
                <Text style={st.statVal}>{st2.value}</Text>
                <Text style={st.statLabel}>{st2.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* QUICK ACTIONS */}
        <View style={st.section}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[st.qaCard, { backgroundColor: COLORS.primary, flex: 1 }]}
              onPress={() => navigation?.navigate?.('AddTask')}
            >
              <View style={st.qaIconWrap}><FontAwesome5 name="plus" size={20} color={COLORS.white} /></View>
              <View><Text style={st.qaLabel}>Add Task</Text><Text style={st.qaSub}>Create new task</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.qaCard, { backgroundColor: COLORS.purple600, flex: 1 }]}
              onPress={() => navigation?.navigate?.('VoiceNote')}
            >
              <View style={st.qaIconWrap}><FontAwesome5 name="microphone" size={20} color={COLORS.white} /></View>
              <View><Text style={st.qaLabel}>Voice Note</Text><Text style={st.qaSub}>Record & transcribe</Text></View>
            </TouchableOpacity>
          </View>
        </View>

        {/* FILTER TABS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.filterBar}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
        >
          {STATUS_TABS.map((t, i) => {
            const count = t.key === 'NOTES' ? notes.length
              : t.key === 'ALL' ? tasks.length
              : tasks.filter(tk => tk.status === t.key).length;
            return (
              <TouchableOpacity
                key={i}
                style={[st.filterTab, activeTab === i && st.filterTabActive]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[st.filterTabTxt, activeTab === i && st.filterTabTxtActive]}>{t.label}</Text>
                <View style={[st.filterBadge, activeTab === i && st.filterBadgeActive]}>
                  <Text style={[st.filterBadgeTxt, activeTab === i && st.filterBadgeTxtActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* NOTES TAB */}
        {tabKey === 'NOTES' ? (
          <View style={[st.section, { backgroundColor: COLORS.purple50 }]}>
            <View style={st.sHRow}>
              <View style={st.row}>
                <View style={[st.sIconWrap, { backgroundColor: COLORS.purple100 }]}>
                  <FontAwesome5 name="sticky-note" size={13} color={COLORS.purple600} />
                </View>
                <Text style={[st.sectionTitle, { marginLeft: 10 }]}>Notes</Text>
              </View>
              <TouchableOpacity
                style={st.addNoteBtn}
                onPress={() => navigation?.navigate?.('AddNote')}
              >
                <FontAwesome5 name="plus" size={11} color={COLORS.purple600} />
                <Text style={st.addNoteBtnTxt}>Add Note</Text>
              </TouchableOpacity>
            </View>
            {filteredNotes.length === 0 ? (
              <View style={st.emptyBox}>
                <FontAwesome5 name="sticky-note" size={28} color={COLORS.gray400} />
                <Text style={st.emptyTxt}>No notes yet</Text>
              </View>
            ) : (
              filteredNotes.map((n, idx) => (
                <NoteCard
                  key={n.id}
                  note={toNoteDisplay(n, idx)}
                  caseName={n.case_id ? caseMap[n.case_id] : null}
                  onDelete={() => handleDeleteNote(n)}
                />
              ))
            )}
          </View>
        ) : (
          /* TASKS TAB */
          <View style={[st.section, { backgroundColor: COLORS.amber50 }]}>
            <View style={st.sHRow}>
              <View style={st.row}>
                <View style={[st.sIconWrap, { backgroundColor: COLORS.amber100 }]}>
                  <FontAwesome5 name="tasks" size={13} color={COLORS.amber600} />
                </View>
                <Text style={[st.sectionTitle, { marginLeft: 10 }]}>
                  {STATUS_TABS[activeTab].label === 'All' ? 'All Tasks' : `${STATUS_TABS[activeTab].label} Tasks`}
                </Text>
              </View>
              <Text style={st.sectionCount}>{filteredTasks.length}</Text>
            </View>
            {filteredTasks.length === 0 ? (
              <View style={st.emptyBox}>
                <FontAwesome5 name="clipboard-check" size={28} color={COLORS.gray400} />
                <Text style={st.emptyTxt}>{search ? 'No tasks match your search' : 'No tasks here'}</Text>
              </View>
            ) : (
              filteredTasks.map(t => (
                <TaskCard
                  key={t.id}
                  item={mapTask(t)}
                  onDone={handleToggle}
                  onDelete={handleDeleteTask}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles tâches (copie fidèle des styles HomeScreen) ───────────────────────
const st = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.primary },
  scroll:     { flex: 1, backgroundColor: COLORS.gray50 },
  header:     { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: COLORS.white },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  searchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput:{ flex: 1, color: COLORS.white, fontSize: 13 },

  section:    { paddingHorizontal: 16, paddingVertical: 18, backgroundColor: COLORS.white, marginBottom: 2 },
  sHRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ fontSize: 16, fontWeight: '800', color: COLORS.dark },
  sectionCount:{ fontSize: 13, color: COLORS.gray500 },
  row:        { flexDirection: 'row', alignItems: 'center' },

  filterBar:      { backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray200, maxHeight: 56, flexGrow: 0 },
  filterTab:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: COLORS.gray100 },
  filterTabActive:{ backgroundColor: COLORS.primary },
  filterTabTxt:   { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  filterTabTxtActive:{ color: COLORS.white },
  filterBadge:    { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterBadgeActive:{ backgroundColor: 'rgba(255,255,255,0.3)' },
  filterBadgeTxt: { fontSize: 10, fontWeight: '700', color: COLORS.gray600 },
  filterBadgeTxtActive:{ color: COLORS.white },

  statCard:   { flex: 1, backgroundColor: COLORS.white, borderRadius: 16, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2 },
  statIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statVal:    { fontSize: 20, fontWeight: '800', color: COLORS.dark },
  statLabel:  { fontSize: 10, color: COLORS.gray500, marginTop: 1 },

  qaCard:     { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  qaIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  qaLabel:    { fontSize: 14, fontWeight: '700', color: COLORS.white },
  qaSub:      { fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  // ─── Task card (fidèle HomeScreen) ─────────────────────────────────────────
  card:        { backgroundColor: COLORS.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: COLORS.gray100, marginBottom: 10 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  cardSubtitle:{ fontSize: 13, color: COLORS.gray600, marginTop: 2 },
  tag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText:     { fontSize: 11, fontWeight: '600' },
  checkbox:    { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.gray400, marginRight: 12, marginTop: 2 },
  gray500Sm:   { fontSize: 12, color: COLORS.gray500 },

  addNoteBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.purple100 },
  addNoteBtnTxt: { fontSize: 12, fontWeight: '700', color: COLORS.purple600 },

  emptyBox:   { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTxt:   { fontSize: 14, color: COLORS.gray500, fontWeight: '600' },
});

// ─── Note card styles (fidèles CaseDetailsScreen) ─────────────────────────────
const nt = StyleSheet.create({
  card:        { borderLeftWidth: 4, borderRadius: 16, padding: 14, marginBottom: 12 },
  avatar:      { width: 36, height: 36, borderRadius: 10 },
  author:      { fontSize: 13, fontWeight: '700', color: COLORS.dark },
  time:        { fontSize: 10, color: COLORS.gray400, marginTop: 1 },
  readMore:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 8, borderTopWidth: 1 },
  readMoreTxt: { fontSize: 12, fontWeight: '700' },
});
