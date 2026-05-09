import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert, Linking,
} from 'react-native';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
};

const TAG_META = {
  ACTIVE:   { label: 'Active',   color: C.green600,  bg: C.green50  },
  PENDING:  { label: 'Pending',  color: C.amber600,  bg: C.amber50  },
  PREMIUM:  { label: 'Premium',  color: C.purple600, bg: C.purple50 },
  VIP:      { label: 'VIP',      color: C.primary,   bg: C.blue50   },
  INACTIVE: { label: 'Inactive', color: C.g500,      bg: C.g100     },
};
const TAG_DEFAULT = { label: 'Active', color: C.green600, bg: C.green50 };

const FILTER_TABS = [
  { label: 'All',      key: 'all'     },
  { label: 'Active',   key: 'ACTIVE'  },
  { label: 'Pending',  key: 'PENDING' },
  { label: 'VIP',      key: 'VIP'     },
];

function mapClient(c) {
  const tag = (c.tag || 'ACTIVE').toUpperCase();
  const meta = TAG_META[tag] || TAG_DEFAULT;
  return {
    id:         c.id,
    name:       `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
    email:      c.email || '',
    phone:      c.phone || '',
    occupation: c.occupation || c.client_type || '',
    tag,
    tagLabel:   meta.label,
    tagColor:   meta.color,
    tagBg:      meta.bg,
    _raw:       c,
  };
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function AvatarCircle({ name, size = 52 }) {
  const initials = getInitials(name);
  const colors = [C.primary, C.purple600, C.green600, C.amber600, C.red600];
  const bg = colors[Math.abs(name.charCodeAt(0) - 65) % colors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontWeight: '800', fontSize: size * 0.3 }}>{initials}</Text>
    </View>
  );
}

function ClientCard({ client, onPress }) {
  return (
    <View style={s.clientCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
          <AvatarCircle name={client.name} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <Text style={s.clientName}>{client.name}</Text>
              <View style={[s.pill, { backgroundColor: client.tagBg }]}>
                <Text style={[s.pillTxt, { color: client.tagColor }]}>{client.tagLabel}</Text>
              </View>
            </View>
            {!!client.occupation && (
              <Text style={s.clientSpecialty}>{client.occupation}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
              {!!client.email && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <FontAwesome5 name="envelope" size={10} color={C.g400} />
                  <Text style={s.clientMeta} numberOfLines={1}>{client.email}</Text>
                </View>
              )}
              {!!client.phone && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <FontAwesome5 name="phone" size={10} color={C.g400} />
                  <Text style={s.clientMeta}>{client.phone}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: C.g100, paddingTop: 12 }}>
        <TouchableOpacity style={s.viewProfileBtn} onPress={() => onPress?.(client)}>
          <FontAwesome5 name="user" size={12} color={C.white} style={{ marginRight: 6 }} />
          <Text style={s.viewProfileTxt}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => client.phone && Linking.openURL(`tel:${client.phone}`)}
        >
          <FontAwesome5 name="phone" size={14} color={C.green600} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: C.purple50 }]}
          onPress={() => client.email && Linking.openURL(`mailto:${client.email}`)}
        >
          <FontAwesome5 name="envelope" size={14} color={C.purple600} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ClientsManagementScreen({ navigation }) {
  const [activeFilter, setActiveFilter] = useState(0);
  const [allClients, setAllClients]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');

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

  const filterKey = FILTER_TABS[activeFilter].key;

  const displayed = allClients.filter(c => {
    const matchesTab = filterKey === 'all' || c.tag === filterKey;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.occupation.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const total   = allClients.length;
  const active  = allClients.filter(c => c.tag === 'ACTIVE').length;
  const vip     = allClients.filter(c => c.tag === 'VIP' || c.tag === 'PREMIUM').length;

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

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>Client Management</Text>
            <Text style={s.headerSub}>{total} client{total !== 1 ? 's' : ''} in your portfolio</Text>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.navigate?.('AddClient')}>
            <FontAwesome5 name="user-plus" size={14} color={C.white} />
          </TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <FontAwesome5 name="search" size={14} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by name, email, specialty..."
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
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.primary]} tintColor={C.primary} />}
      >
        {/* STATS */}
        <View style={[s.section, { backgroundColor: C.blue50 }]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { icon: 'users',      iconColor: C.primary,   iconBg: C.blue100,   value: String(total),  label: 'Total Clients' },
              { icon: 'user-check', iconColor: C.green600,  iconBg: C.green100,  value: String(active), label: 'Active'        },
              { icon: 'star',       iconColor: C.amber600,  iconBg: C.amber100,  value: String(vip),    label: 'VIP / Premium' },
            ].map((st, i) => (
              <View key={i} style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: st.iconBg }]}>
                  <FontAwesome5 name={st.icon} size={18} color={st.iconColor} />
                </View>
                <Text style={s.statBigVal}>{st.value}</Text>
                <Text style={s.statSmLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* FILTER TABS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterBar}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
        >
          {FILTER_TABS.map((t, i) => {
            const count = t.key === 'all'
              ? allClients.length
              : allClients.filter(c => c.tag === t.key).length;
            return (
              <TouchableOpacity
                key={i}
                style={[s.filterTab, activeFilter === i && s.filterTabActive]}
                onPress={() => setActiveFilter(i)}
              >
                <Text style={[s.filterTabTxt, activeFilter === i && s.filterTabTxtActive]}>
                  {t.label}
                </Text>
                <View style={[s.filterBadge, activeFilter === i && s.filterBadgeActive]}>
                  <Text style={[s.filterBadgeTxt, activeFilter === i && s.filterBadgeTxtActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* CLIENT LIST */}
        <View style={s.section}>
          <View style={s.sHRow}>
            <Text style={s.sectionTitle}>
              {FILTER_TABS[activeFilter].label === 'All' ? 'All Clients' : `${FILTER_TABS[activeFilter].label} Clients`}
            </Text>
            <Text style={s.sectionCount}>{displayed.length} result{displayed.length !== 1 ? 's' : ''}</Text>
          </View>

          {displayed.length === 0 ? (
            <View style={s.emptyBox}>
              <FontAwesome5 name="user-slash" size={32} color={C.g400} />
              <Text style={s.emptyTitle}>No clients found</Text>
              <Text style={s.emptySub}>
                {search ? 'Try a different search term' : 'Add your first client to get started'}
              </Text>
            </View>
          ) : (
            displayed.map((cl) => (
              <ClientCard
                key={cl.id}
                client={cl}
                onPress={(c) => navigation?.navigate?.('ClientDetails', { clientId: c.id })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, color: C.white, fontSize: 13 },

  section: { paddingHorizontal: 16, paddingVertical: 18, backgroundColor: C.white, marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.dark },
  sectionCount: { fontSize: 13, color: C.g500 },
  sHRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },

  filterBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 56, flexGrow: 0 },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive: { backgroundColor: C.primary },
  filterTabTxt: { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive: { color: C.white },
  filterBadge: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: C.g200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  filterBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.g600 },
  filterBadgeTxtActive: { color: C.white },

  statCard: { flex: 1, backgroundColor: C.white, borderRadius: 18, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statBigVal: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 2 },
  statSmLabel: { fontSize: 11, color: C.g500, textAlign: 'center' },

  clientCard: { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 10 },
  clientName: { fontSize: 14, fontWeight: '700', color: C.dark },
  clientSpecialty: { fontSize: 12, color: C.g600, marginTop: 2 },
  clientMeta: { fontSize: 11, color: C.g500, maxWidth: 150 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillTxt: { fontSize: 11, fontWeight: '600' },
  viewProfileBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 10, borderRadius: 12 },
  viewProfileTxt: { color: C.white, fontWeight: '700', fontSize: 13 },
  iconBtn: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.green50 },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.dark },
  emptySub: { fontSize: 13, color: C.g500, textAlign: 'center' },
});
