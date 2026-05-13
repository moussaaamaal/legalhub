import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert, Linking, Image,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red600: '#DC2626',
  amber50: '#FFFBEB', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  purple50: '#FAF5FF', purple600: '#9333EA',
  cyan50: '#ECFEFF', cyan600: '#0891B2',
};

const TAG_META = {
  ACTIVE:   { label: 'Active',   color: C.green600,  bg: C.green50   },
  PENDING:  { label: 'Pending',  color: C.amber600,  bg: C.amber50   },
  PREMIUM:  { label: 'Premium',  color: C.purple600, bg: C.purple50  },
  VIP:      { label: 'VIP',      color: C.primary,   bg: C.blue50    },
  NEW:      { label: 'New',      color: C.cyan600,   bg: C.cyan50    },
  URGENT:   { label: 'Urgent',   color: C.red600,    bg: C.red50     },
  INACTIVE: { label: 'Inactive', color: C.g500,      bg: C.g100      },
};
const TAG_DEFAULT = TAG_META.ACTIVE;

const PRACTICE_LABELS = {
  CRIMINAL: 'Criminal', CIVIL: 'Civil', CORPORATE: 'Corporate',
  FAMILY: 'Family', REAL_ESTATE: 'Real Estate', IMMIGRATION: 'Immigration',
  PERSONAL_INJURY: 'P. Injury', IP: 'IP', LABOR: 'Labor', TAX: 'Tax',
};

const MAIN_TABS = [
  { label: 'Total',   key: 'all'     },
  { label: 'Active',  key: 'ACTIVE'  },
  { label: 'Pending', key: 'PENDING' },
];

const SUB_FILTERS = [
  { label: 'All',          key: 'all'          },
  { label: 'Active Cases', key: 'active_cases' },
  { label: 'Unpaid',       key: 'unpaid'       },
  { label: 'VIP',          key: 'vip'          },
];

function mapClient(c) {
  const tag  = (c.tag || 'ACTIVE').toUpperCase();
  const meta = TAG_META[tag] || TAG_DEFAULT;
  return {
    id:           c.id,
    name:         `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
    email:        c.email || '',
    phone:        c.phone || '',
    whatsapp:     c.whatsapp_number || c.phone || '',
    occupation:   c.occupation || '',
    company:      c.company_name || '',
    practiceArea: PRACTICE_LABELS[c.practice_area] || null,
    activeCases:  c.active_cases_count ?? 0,
    totalBilled:  c.total_billed ?? 0,
    hasUnpaid:    c.has_unpaid_invoices ?? false,
    avatarUrl:    c.avatar_url || null,
    since:        c.created_at
      ? new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '',
    tag,
    tagLabel:  meta.label,
    tagColor:  meta.color,
    tagBg:     meta.bg,
    _raw:      c,
  };
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function Avatar({ name, avatarUrl, size = 52 }) {
  const colors = [C.primary, C.purple600, C.green600, C.amber600, C.red600, C.cyan600];
  const bg     = colors[Math.abs((name.charCodeAt(0) || 65) - 65) % colors.length];
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 4 }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontWeight: '800', fontSize: size * 0.3 }}>{getInitials(name)}</Text>
    </View>
  );
}

function ClientCard({ client, onPress }) {
  const subtitle = client.occupation || client.company || null;

  return (
    <View style={s.card}>
      {/* ── Top: avatar + info + tag ── */}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Avatar name={client.name} avatarUrl={client.avatarUrl} size={52} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <Text style={s.clientName} numberOfLines={1}>{client.name}</Text>
            <View style={[s.pill, { backgroundColor: client.tagBg }]}>
              <Text style={[s.pillTxt, { color: client.tagColor }]}>{client.tagLabel}</Text>
            </View>
          </View>
          {!!subtitle && (
            <Text style={s.clientSub} numberOfLines={1}>{subtitle}</Text>
          )}
          {!!client.practiceArea && (
            <View style={s.practiceTag}>
              <FontAwesome5 name="balance-scale" size={9} color={C.primary} style={{ marginRight: 4 }} />
              <Text style={s.practiceTxt}>{client.practiceArea}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Stats row ── */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <FontAwesome5 name="folder-open" size={11} color={C.primary} />
          <Text style={s.statTxt}>
            {client.activeCases} {client.activeCases === 1 ? 'case' : 'cases'}
          </Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <FontAwesome5 name="money-bill-wave" size={11} color={C.green600} />
          <Text style={[s.statTxt, client.hasUnpaid && { color: C.amber600 }]}>
            {client.totalBilled > 0
              ? `SAR ${client.totalBilled.toLocaleString('en', { maximumFractionDigits: 0 })}`
              : 'No billing'}
          </Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <FontAwesome5 name="calendar-alt" size={11} color={C.g500} />
          <Text style={s.statTxt}>Since {client.since || '—'}</Text>
        </View>
      </View>

      {/* ── Actions ── */}
      <View style={s.actionsRow}>
        <TouchableOpacity style={s.btnProfile} onPress={() => onPress?.(client)}>
          <FontAwesome5 name="user" size={12} color={C.white} style={{ marginRight: 6 }} />
          <Text style={s.btnProfileTxt}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: C.green50 }]}
          onPress={() => client.phone && Linking.openURL(`tel:${client.phone}`)}
        >
          <FontAwesome5 name="phone" size={14} color={C.green600} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: '#F0FFF4' }]}
          onPress={() => {
            const num = (client.whatsapp || client.phone).replace(/\D/g, '');
            if (num) Linking.openURL(`whatsapp://send?phone=${num}`);
          }}
        >
          <FontAwesome5 name="whatsapp" size={14} color="#25D366" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ClientsManagementScreen({ navigation }) {
  const [mainTab,    setMainTab]    = useState(0);
  const [subFilter,  setSubFilter]  = useState(0);
  const [allClients, setAllClients] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await clientsAPI.list();
      setAllClients((data || []).map(mapClient));
    } catch (e) {
      if (!isRefresh) Alert.alert('Error', e.message || 'Failed to load clients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCount   = allClients.length;
  const activeCount  = allClients.filter(c => c.tag === 'ACTIVE').length;
  const pendingCount = allClients.filter(c => c.tag === 'PENDING').length;
  const tabCounts    = [totalCount, activeCount, pendingCount];

  const tabKey    = MAIN_TABS[mainTab].key;
  const filterKey = SUB_FILTERS[subFilter].key;

  const displayed = allClients.filter(c => {
    if (tabKey !== 'all' && c.tag !== tabKey) return false;
    if (filterKey === 'active_cases' && c.activeCases === 0) return false;
    if (filterKey === 'unpaid' && !c.hasUnpaid) return false;
    if (filterKey === 'vip' && c.tag !== 'VIP') return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !c.email.toLowerCase().includes(q) &&
        !(c.occupation || '').toLowerCase().includes(q) &&
        !(c.company || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>Client Management</Text>
            <Text style={s.headerSub}>{totalCount} client{totalCount !== 1 ? 's' : ''} in your portfolio</Text>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.navigate?.('AddClient')}>
            <FontAwesome5 name="user-plus" size={14} color={C.white} />
          </TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <FontAwesome5 name="search" size={13} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search name, email, company..."
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

      {/* ── MAIN TABS: Total / Active / Pending ── */}
      <View style={s.mainTabsRow}>
        {MAIN_TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.mainTab, mainTab === i && s.mainTabActive]}
            onPress={() => setMainTab(i)}
          >
            <Text style={[s.mainTabCount, mainTab === i && s.mainTabCountActive]}>
              {tabCounts[i]}
            </Text>
            <Text style={[s.mainTabLabel, mainTab === i && s.mainTabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
      >
        {/* ── SUB-FILTERS ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterBar}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12 }}
        >
          {SUB_FILTERS.map((f, i) => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterChip, subFilter === i && s.filterChipActive]}
              onPress={() => setSubFilter(i)}
            >
              <Text style={[s.filterChipTxt, subFilter === i && s.filterChipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── CLIENT LIST ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={s.listHeader}>
            <Text style={s.listTitle}>
              {MAIN_TABS[mainTab].label === 'Total' ? 'All Clients' : `${MAIN_TABS[mainTab].label} Clients`}
            </Text>
            <Text style={s.listCount}>
              {displayed.length} result{displayed.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {displayed.length === 0 ? (
            <View style={s.emptyBox}>
              <FontAwesome5 name="user-slash" size={32} color={C.g400} />
              <Text style={s.emptyTitle}>No clients found</Text>
              <Text style={s.emptySub}>
                {search
                  ? 'Try a different search term'
                  : 'No clients match the selected filters'}
              </Text>
            </View>
          ) : (
            displayed.map(cl => (
              <ClientCard
                key={cl.id}
                client={cl}
                onPress={c => navigation?.navigate?.('ClientDetails', { clientId: c.id })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.primary },
  scroll:  { flex: 1, backgroundColor: C.g50 },
  header:  { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, color: C.white, fontSize: 13 },

  mainTabsRow:       { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200 },
  mainTab:           { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  mainTabActive:     { borderBottomColor: C.primary },
  mainTabCount:      { fontSize: 20, fontWeight: '800', color: C.g400 },
  mainTabCountActive:{ color: C.primary },
  mainTabLabel:      { fontSize: 11, fontWeight: '600', color: C.g400, marginTop: 2 },
  mainTabLabelActive:{ color: C.primary },

  filterBar:        { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 56, flexGrow: 0 },
  filterChip:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: C.g100 },
  filterChipActive: { backgroundColor: C.primary },
  filterChipTxt:    { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterChipTxtActive: { color: C.white },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  listTitle:  { fontSize: 15, fontWeight: '800', color: C.dark },
  listCount:  { fontSize: 12, color: C.g500 },

  card:       { backgroundColor: C.white, borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.g100 },
  clientName: { fontSize: 14, fontWeight: '700', color: C.dark },
  clientSub:  { fontSize: 12, color: C.g500, marginTop: 2 },
  pill:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  pillTxt:    { fontSize: 10, fontWeight: '700' },
  practiceTag:{ flexDirection: 'row', alignItems: 'center', marginTop: 5, alignSelf: 'flex-start', backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  practiceTxt:{ fontSize: 10, color: C.primary, fontWeight: '600' },

  statsRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12, backgroundColor: C.g50, borderRadius: 10, padding: 10 },
  statItem:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  statTxt:     { fontSize: 11, fontWeight: '600', color: C.g600 },
  statDivider: { width: 1, height: 20, backgroundColor: C.g200 },

  actionsRow:    { flexDirection: 'row', gap: 8 },
  btnProfile:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 10, borderRadius: 12 },
  btnProfileTxt: { color: C.white, fontWeight: '700', fontSize: 13 },
  iconBtn:       { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  emptyBox:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle:{ fontSize: 15, fontWeight: '700', color: C.dark },
  emptySub:  { fontSize: 13, color: C.g500, textAlign: 'center' },
});
