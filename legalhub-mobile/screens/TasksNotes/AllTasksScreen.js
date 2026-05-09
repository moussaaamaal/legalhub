import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, RefreshControl,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { tasksAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple600: '#9333EA',
};

const PRIORITY_META = {
  URGENT: { label: 'Urgent', color: C.red600,    bg: C.red50,    border: C.red500    },
  HIGH:   { label: 'High',   color: C.red600,    bg: C.red50,    border: C.red500    },
  MEDIUM: { label: 'Medium', color: C.amber600,  bg: C.amber50,  border: C.amber500  },
  NORMAL: { label: 'Normal', color: C.green600,  bg: C.green50,  border: C.green600  },
  LOW:    { label: 'Low',    color: C.green600,  bg: C.green50,  border: C.green600  },
};

const STATUS_META = {
  PENDING:     { label: 'Pending',     color: C.amber600, bg: C.amber50  },
  IN_PROGRESS: { label: 'In Progress', color: C.blue600,  bg: C.blue50   },
  COMPLETED:   { label: 'Completed',   color: C.green600, bg: C.green50  },
  CANCELLED:   { label: 'Cancelled',   color: C.g500,     bg: C.g100     },
};

const FILTERS = ['All', 'Pending', 'Completed', 'Urgent'];

const formatDue = (dateStr) => {
  if (!dateStr) return null;
  const due   = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff  = Math.floor((due - today) / 86400000);
  if (diff < 0)  return { label: 'Overdue',    color: C.red600,   bg: C.red50   };
  if (diff === 0) return { label: 'Due Today',  color: C.red600,   bg: C.red50   };
  if (diff === 1) return { label: 'Due Tomorrow', color: C.amber600, bg: C.amber50 };
  return { label: `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, color: C.g500, bg: C.g100 };
};

export default function AllTasksScreen({ navigation }) {
  const [tasks,         setTasks]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeFilter,  setActiveFilter]  = useState(0);
  const [search,        setSearch]        = useState('');

  const load = useCallback(async () => {
    try {
      const data = await tasksAPI.list();
      setTasks(data || []);
    } catch {
      Alert.alert('Error', 'Could not load tasks.');
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleComplete = (task) => {
    Alert.alert(
      'Complete Task',
      `Mark "${task.title}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await tasksAPI.updateStatus(task.id, 'COMPLETED');
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'COMPLETED' } : t));
            } catch {
              Alert.alert('Error', 'Could not update task.');
            }
          },
        },
      ],
    );
  };

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || t.title?.toLowerCase().includes(q)
      || t.case_file?.title?.toLowerCase().includes(q)
      || t.app_user?.full_name?.toLowerCase().includes(q);

    const status = (t.status || '').toUpperCase();
    const priority = (t.priority || '').toUpperCase();
    if (activeFilter === 1) return matchSearch && ['PENDING', 'IN_PROGRESS'].includes(status);
    if (activeFilter === 2) return matchSearch && status === 'COMPLETED';
    if (activeFilter === 3) return matchSearch && ['URGENT', 'HIGH'].includes(priority);
    return matchSearch;
  });

  const pending   = filtered.filter(t => !['COMPLETED', 'CANCELLED'].includes((t.status || '').toUpperCase()));
  const completed = filtered.filter(t => ['COMPLETED', 'CANCELLED'].includes((t.status || '').toUpperCase()));

  const totalCount     = tasks.length;
  const urgentCount    = tasks.filter(t => ['URGENT', 'HIGH'].includes((t.priority || '').toUpperCase())).length;
  const pendingCount   = tasks.filter(t => ['PENDING', 'IN_PROGRESS'].includes((t.status || '').toUpperCase())).length;
  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>All Tasks</Text>
            <Text style={s.headerSub}>{totalCount} tasks total</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { val: totalCount,     label: 'Total',     icon: 'tasks',        iconBg: C.blue100,  iconColor: C.primary  },
            { val: urgentCount,    label: 'Urgent',    icon: 'fire',         iconBg: C.red100,   iconColor: C.red600   },
            { val: pendingCount,   label: 'Pending',   icon: 'clock',        iconBg: C.amber100, iconColor: C.amber600 },
            { val: completedCount, label: 'Done',      icon: 'check-circle', iconBg: C.green100, iconColor: C.green600 },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <View style={[s.statIconWrap, { backgroundColor: st.iconBg }]}>
                <FontAwesome5 name={st.icon} size={13} color={st.iconColor} />
              </View>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search tasks, cases, lawyers..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FILTER TABS */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' }}
      >
        {FILTERS.map((f, i) => (
          <TouchableOpacity
            key={i}
            style={[s.filterTab, activeFilter === i && s.filterTabActive]}
            onPress={() => setActiveFilter(i)}
          >
            <Text style={[s.filterTabTxt, activeFilter === i && s.filterTabTxtActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* CONTENT */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
        >
          {pending.length === 0 && completed.length === 0 && (
            <View style={s.empty}>
              <FontAwesome5 name="check-double" size={36} color={C.g200} />
              <Text style={s.emptyTxt}>No tasks found</Text>
            </View>
          )}

          {pending.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <View style={s.sectionLabelRow}>
                <View style={[s.sectionDot, { backgroundColor: C.amber600 }]} />
                <Text style={s.sectionLabel}>Pending ({pending.length})</Text>
              </View>
              {pending.map(task => (
                <TaskCard key={task.id} task={task} onComplete={() => handleComplete(task)} />
              ))}
            </View>
          )}

          {completed.length > 0 && (
            <View>
              <View style={s.sectionLabelRow}>
                <View style={[s.sectionDot, { backgroundColor: C.green600 }]} />
                <Text style={s.sectionLabel}>Completed ({completed.length})</Text>
              </View>
              {completed.map(task => (
                <TaskCard key={task.id} task={task} onComplete={null} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TaskCard({ task, onComplete }) {
  const prioMeta   = PRIORITY_META[(task.priority || 'NORMAL').toUpperCase()] || PRIORITY_META.NORMAL;
  const statusMeta = STATUS_META[(task.status || 'PENDING').toUpperCase()] || STATUS_META.PENDING;
  const dueBadge   = formatDue(task.due_date);
  const isDone     = ['COMPLETED', 'CANCELLED'].includes((task.status || '').toUpperCase());
  const caseName   = task.case_file?.title || task.case_file?.case_number || null;
  const lawyerName = task.app_user?.full_name || null;

  return (
    <View style={[s.card, { borderLeftColor: prioMeta.border, opacity: isDone ? 0.72 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>

        {/* Checkbox */}
        <TouchableOpacity
          style={[s.checkbox, isDone && s.checkboxDone]}
          onPress={onComplete}
          disabled={isDone}
        >
          {isDone && <FontAwesome5 name="check" size={10} color={C.white} />}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          {/* Titre + priorité */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
            <Text style={[s.taskTitle, isDone && s.taskTitleDone]} numberOfLines={2}>{task.title}</Text>
            <View style={[s.pill, { backgroundColor: prioMeta.bg }]}>
              <Text style={[s.pillTxt, { color: prioMeta.color }]}>{prioMeta.label}</Text>
            </View>
          </View>

          {/* Description */}
          {task.description ? (
            <Text style={s.taskDesc} numberOfLines={2}>{task.description}</Text>
          ) : null}

          {/* Dossier */}
          {caseName ? (
            <View style={[s.infoRow, { marginTop: 8 }]}>
              <FontAwesome5 name="briefcase" size={10} color={C.g400} />
              <Text style={s.infoTxt} numberOfLines={1}>{caseName}</Text>
            </View>
          ) : null}

          {/* Avocat + statut + échéance */}
          <View style={[s.infoRow, { marginTop: 4, justifyContent: 'space-between' }]}>
            <View style={s.infoRow}>
              {lawyerName ? (
                <>
                  <FontAwesome5 name="user-tie" size={10} color={C.g400} />
                  <Text style={[s.infoTxt, { marginLeft: 5 }]} numberOfLines={1}>{lawyerName}</Text>
                </>
              ) : null}
            </View>
            <View style={s.infoRow}>
              <View style={[s.pill, { backgroundColor: statusMeta.bg, marginRight: 6 }]}>
                <Text style={[s.pillTxt, { color: statusMeta.color }]}>{statusMeta.label}</Text>
              </View>
              {dueBadge && (
                <View style={[s.pill, { backgroundColor: dueBadge.bg }]}>
                  <Text style={[s.pillTxt, { color: dueBadge.color }]}>{dueBadge.label}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: C.primary },
  scroll:            { flex: 1, backgroundColor: C.g50 },
  header:            { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:       { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:         { fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  statsRow:          { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statItem:          { alignItems: 'center', gap: 3 },
  statIconWrap:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statVal:           { fontSize: 17, fontWeight: '800', color: C.white },
  statLabel:         { fontSize: 10, color: 'rgba(255,255,255,0.72)' },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput:       { flex: 1, color: C.white, fontSize: 13 },
  filterBar:         { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 52, flexGrow: 0 },
  filterTab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:   { backgroundColor: C.primary },
  filterTabTxt:      { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive:{ color: C.white },
  sectionLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionDot:        { width: 8, height: 8, borderRadius: 4 },
  sectionLabel:      { fontSize: 14, fontWeight: '700', color: C.dark },
  card:              { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: C.g100, borderLeftWidth: 4, marginBottom: 10 },
  checkbox:          { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.g400, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  checkboxDone:      { backgroundColor: C.green600, borderColor: C.green600 },
  taskTitle:         { flex: 1, fontSize: 14, fontWeight: '700', color: C.dark },
  taskTitleDone:     { textDecorationLine: 'line-through', color: C.g400 },
  taskDesc:          { fontSize: 12, color: C.g500, lineHeight: 17 },
  pill:              { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, flexShrink: 0 },
  pillTxt:           { fontSize: 11, fontWeight: '600' },
  infoRow:           { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoTxt:           { fontSize: 11, color: C.g600, fontWeight: '500', flexShrink: 1 },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.g50 },
  empty:             { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTxt:          { fontSize: 14, color: C.g400, fontWeight: '600' },
});
