import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { casesAPI } from '../../services/api';
import CaseDetailsScreen from './CaseDetailsScreen';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red600: '#DC2626',
  amber50: '#FFFBEB', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green500: '#22C55E', green600: '#16A34A',
  blue50: '#EFF6FF',  blue600: '#2563EB',
  purple50: '#FAF5FF', purple600: '#9333EA',
};

const PRIORITY_STYLE = {
  URGENT: { label: 'Urgent', color: C.red600,   bg: C.red50,   accent: '#EF4444'  },
  HIGH:   { label: 'High',   color: C.red600,   bg: C.red50,   accent: '#EF4444'  },
  MEDIUM: { label: 'Medium', color: C.amber600, bg: C.amber50, accent: C.amber500 },
  NORMAL: { label: 'Normal', color: C.green600, bg: C.green50, accent: C.green500 },
  LOW:    { label: 'Low',    color: C.green600, bg: C.green50, accent: C.green500 },
};

const STATUS_STYLE = {
  NEW:           { label: 'New',           color: C.blue600,  bg: C.blue50   },
  INVESTIGATION: { label: 'Investigation', color: C.amber600, bg: C.amber50  },
  PRE_TRIAL:     { label: 'Pre-trial',     color: '#EA580C',  bg: '#FFF7ED'  },
  TRIAL:         { label: 'Trial',         color: C.purple600,bg: C.purple50 },
  APPEAL:        { label: 'Appeal',        color: '#E11D48',  bg: '#FFF1F2'  },
  SETTLED:       { label: 'Settled',       color: C.green600, bg: C.green50  },
  CLOSED:        { label: 'Closed',        color: C.g500,     bg: C.g100     },
};

const FILTER_TABS = ['All', 'Active', 'In Progress', 'Urgent', 'Closed'];

const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

function CaseCard({ c, onPress }) {
  const ps = PRIORITY_STYLE[(c.priority || '').toUpperCase()] || PRIORITY_STYLE.NORMAL;
  const ss = STATUS_STYLE[(c.status || '').toUpperCase()] || { label: c.status || '—', color: C.g500, bg: C.g100 };
  const clientName = c.client_name
    || (c.client ? `${c.client.first_name || ''} ${c.client.last_name || ''}`.trim() : null)
    || '—';
  const caseType = c.case_type || '—';

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.82}>
      {/* Colored left accent */}
      <View style={[s.accent, { backgroundColor: ps.accent }]} />

      <View style={{ flex: 1, padding: 14 }}>
        {/* Priority + type */}
        <View style={s.topRow}>
          <View style={[s.priorityBadge, { backgroundColor: ps.bg }]}>
            <View style={[s.dot, { backgroundColor: ps.color }]} />
            <Text style={[s.priorityTxt, { color: ps.color }]}>{ps.label}</Text>
          </View>
          <Text style={s.typeLabel} numberOfLines={1}>{caseType}</Text>
        </View>

        {/* Title */}
        <Text style={s.title} numberOfLines={2}>{c.title || '—'}</Text>

        {/* Client row */}
        <View style={s.clientRow}>
          <View style={s.clientIcon}>
            <FontAwesome5 name="user" size={9} color={C.primary} />
          </View>
          <Text style={s.clientName} numberOfLines={1}>{clientName}</Text>
        </View>

        {/* Footer: status + date + chevron */}
        <View style={s.footer}>
          <View style={[s.statusChip, { backgroundColor: ss.bg }]}>
            <Text style={[s.statusTxt, { color: ss.color }]}>{ss.label}</Text>
          </View>
          <Text style={s.dateStr}>{formatDate(c.updated_at || c.created_at)}</Text>
          <FontAwesome5 name="chevron-right" size={11} color={C.g400} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AllCasesScreen({ navigation }) {
  const [cases,        setCases]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);
  const [activeFilter, setActiveFilter] = useState(0);
  const [search,       setSearch]       = useState('');
  const [selectedCase, setSelectedCase] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await casesAPI.list();
      setCases(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Could not load cases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedCase) {
    return (
      <CaseDetailsScreen
        navigation={{ goBack: () => setSelectedCase(null) }}
        route={{ params: { caseData: selectedCase } }}
      />
    );
  }

  const filtered = (() => {
    let list = cases;
    if (activeFilter === 1) list = list.filter(c => !['SETTLED', 'CLOSED'].includes((c.status || '').toUpperCase()));
    else if (activeFilter === 2) list = list.filter(c => ['INVESTIGATION', 'PRE_TRIAL', 'TRIAL', 'APPEAL'].includes((c.status || '').toUpperCase()));
    else if (activeFilter === 3) list = list.filter(c => ['URGENT', 'HIGH'].includes((c.priority || '').toUpperCase()));
    else if (activeFilter === 4) list = list.filter(c => ['SETTLED', 'CLOSED'].includes((c.status || '').toUpperCase()));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.client_name || '').toLowerCase().includes(q) ||
        (c.case_type || '').toLowerCase().includes(q)
      );
    }
    return list;
  })();

  const activeCount = cases.filter(c => !['SETTLED', 'CLOSED'].includes((c.status || '').toUpperCase())).length;
  const urgentCount = cases.filter(c => ['URGENT', 'HIGH'].includes((c.priority || '').toUpperCase())).length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>Cases</Text>
            <Text style={s.headerSub}>
              {cases.length} total · {activeCount} active · {urgentCount} urgent
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => navigation?.navigate?.('AddCase')}
          >
            <FontAwesome5 name="plus" size={14} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.65)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search cases or clients…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter tabs */}
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

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <FontAwesome5 name="exclamation-circle" size={36} color={C.g400} />
          <Text style={s.centerTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              colors={[C.primary]}
              tintColor={C.primary}
            />
          }
        >
          <Text style={s.resultsCount}>
            {filtered.length} case{filtered.length !== 1 ? 's' : ''}
          </Text>

          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <FontAwesome5 name="briefcase" size={40} color={C.g400} />
              <Text style={s.emptyTitle}>No cases found</Text>
              <Text style={s.emptySub}>
                {search
                  ? `No results for "${search}"`
                  : `No cases match "${FILTER_TABS[activeFilter]}".`}
              </Text>
            </View>
          ) : (
            filtered.map((c) => (
              <CaseCard key={c.id} c={c} onPress={() => setSelectedCase(c)} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, gap: 12 },
  centerTxt: { fontSize: 13, color: C.g500 },
  retryBtn:  { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 },
  retryTxt:  { color: C.white, fontWeight: '700', fontSize: 13 },

  header:     { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput:{ flex: 1, color: C.white, fontSize: 13 },

  filterBar:        { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 52, flexGrow: 0 },
  filterTab:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:  { backgroundColor: C.primary },
  filterTabTxt:     { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive:{ color: C.white },

  resultsCount: { fontSize: 12, color: C.g500, marginBottom: 12 },

  card:   { flexDirection: 'row', backgroundColor: C.white, borderRadius: 18, overflow: 'hidden', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: C.g100 },
  accent: { width: 5 },

  topRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  priorityBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  dot:          { width: 6, height: 6, borderRadius: 3 },
  priorityTxt:  { fontSize: 11, fontWeight: '700' },
  typeLabel:    { fontSize: 11, color: C.g500, fontWeight: '500', maxWidth: 140 },

  title:      { fontSize: 15, fontWeight: '800', color: C.dark, lineHeight: 20, marginBottom: 8 },

  clientRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  clientIcon: { width: 22, height: 22, borderRadius: 7, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 12, fontWeight: '600', color: C.g600, flex: 1 },

  footer:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusTxt:  { fontSize: 11, fontWeight: '700' },
  dateStr:    { fontSize: 11, color: C.g400, flex: 1 },

  emptyBox:   { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.dark },
  emptySub:   { fontSize: 13, color: C.g400, textAlign: 'center' },
});
