import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { clientPortalAPI, notificationsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  red50: '#FEF2F2', red600: '#DC2626',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
};

const AVATAR_COLORS = [C.secondary, C.purple600, C.green600, C.amber600, C.red600];

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function avatarBg(name) {
  if (!name) return C.secondary;
  return AVATAR_COLORS[Math.abs((name.charCodeAt(0) || 65) - 65) % AVATAR_COLORS.length];
}

function StatCard({ icon, label, value, bg, color, sub }) {
  return (
    <View style={[s.statCard, { backgroundColor: bg }]}>
      <View style={[s.statIcon, { backgroundColor: color + '22' }]}>
        <FontAwesome5 name={icon} size={18} color={color} />
      </View>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
      <View style={[s.statAccent, { backgroundColor: color }]} />
    </View>
  );
}

function AppointmentCard({ event }) {
  const dt = new Date(event.start_datetime);
  const dayNum   = dt.getDate();
  const monthStr = dt.toLocaleDateString('en-GB', { month: 'short' });
  const timeStr  = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={s.apptCard}>
      <View style={s.apptDateBox}>
        <Text style={s.apptDayNum}>{dayNum}</Text>
        <Text style={s.apptMonth}>{monthStr}</Text>
        <View style={s.apptTimePill}>
          <Text style={s.apptTime}>{timeStr}</Text>
        </View>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={s.apptTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={s.apptType}>{event.event_type?.replace(/_/g, ' ')}</Text>
        {event.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            <FontAwesome5 name="map-marker-alt" size={10} color={C.g400} />
            <Text style={s.apptLoc} numberOfLines={1}> {event.location}</Text>
          </View>
        ) : null}
      </View>
      {event.is_video_call && (
        <View style={s.videoBadge}>
          <Ionicons name="videocam" size={13} color={C.primary} />
          <Text style={s.videoBadgeTxt}>Video</Text>
        </View>
      )}
    </View>
  );
}

const QUICK_ITEMS = [
  { icon: 'briefcase',    label: 'My Cases',      route: 'ClientCases',        iconBg: C.blue50,   iconColor: C.primary   },
  { icon: 'file-invoice', label: 'Invoices',      route: 'ClientInvoices',     iconBg: C.amber50,  iconColor: C.amber600  },
  { icon: 'file-alt',     label: 'Documents',     route: 'ClientDocuments',    iconBg: C.green50,  iconColor: C.green600  },
  { icon: 'calendar-alt', label: 'Appointments',  route: 'ClientAppointments', iconBg: C.purple50, iconColor: C.purple600 },
];

// Same colors/icons as TL_META in CaseDetailsScreen
function ACT_META(actionType = '', actionText = '') {
  const t = actionType.toLowerCase();
  const a = actionText.toLowerCase();
  if (t.includes('document') || a.includes('document') || a.includes('upload') || a.includes('file'))
    return { icon: 'file-alt',            color: '#DC2626', bg: '#FEE2E2' };
  if (t.includes('note') || a.includes('note'))
    return { icon: 'sticky-note',         color: '#7C3AED', bg: '#EDE9FE' };
  if (t.includes('task') || a.includes('task'))
    return { icon: 'check-square',        color: '#D97706', bg: '#FEF3C7' };
  if (t.includes('appointment') || t.includes('meeting') || a.includes('meeting') || a.includes('appointment'))
    return { icon: 'user-friends',        color: '#0891B2', bg: '#CFFAFE' };
  if (t.includes('invoice') || t.includes('payment') || a.includes('invoice') || a.includes('payment'))
    return { icon: 'file-invoice-dollar', color: '#059669', bg: '#D1FAE5' };
  if (t.includes('status') || t.includes('updated') || a.includes('status') || a.includes('update') || a.includes('edit'))
    return { icon: 'pen',                 color: '#0F766E', bg: '#CCFBF1' };
  if (t.includes('team') || t.includes('member') || a.includes('team') || a.includes('member'))
    return { icon: 'user-plus',           color: '#1D4ED8', bg: '#DBEAFE' };
  if (t.includes('closed') || t.includes('archive') || a.includes('closed') || a.includes('archive'))
    return { icon: 'archive',             color: '#6B7280', bg: '#F3F4F6' };
  if (t.includes('created') || t.includes('added') || a.includes('created') || a.includes('new'))
    return { icon: 'plus-circle',         color: '#16A34A', bg: '#DCFCE7' };
  return   { icon: 'history',             color: '#1E40AF', bg: '#EFF6FF' };
}

export default function ClientDashboard({ navigation }) {
  const { user } = useAuth();
  const [data, setData]             = useState(null);
  const [activity, setActivity]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      notificationsAPI.unreadCount()
        .then(res => { if (res?.count != null) setUnreadCount(res.count); })
        .catch(() => {});
    });
    return unsub;
  }, [navigation]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const [d, act, unread] = await Promise.allSettled([
        clientPortalAPI.dashboard(),
        clientPortalAPI.activity(),
        notificationsAPI.unreadCount(),
      ]);
      if (d.status === 'fulfilled') setData(d.value);
      else throw d.reason;
      if (act.status === 'fulfilled') {
        const raw = act.value;
        setActivity(Array.isArray(raw) ? raw.slice(0, 4) : []);
      }
      if (unread.status === 'fulfilled') setUnreadCount(unread.value?.count ?? 0);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const client     = data?.client;
  const clientName = client
    ? `${client.first_name} ${client.last_name}`.trim()
    : user?.full_name || 'Client';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ClientProfile')}
          activeOpacity={0.8}
        >
          {(client?.avatar_url || user?.avatar_url) ? (
            <Image source={{ uri: client?.avatar_url || user?.avatar_url }} style={s.avatarImg} />
          ) : (
            <View style={[s.avatarBtn, { backgroundColor: avatarBg(clientName) }]}>
              <Text style={s.avatarInitials}>{getInitials(clientName)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.greeting}>{greeting()},</Text>
          <Text style={s.clientName} numberOfLines={1}>{clientName}</Text>
        </View>
        <TouchableOpacity
          style={s.bellBtn}
          onPress={() => navigation.navigate('ClientNotifications')}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-outline" size={22} color={C.white} />
          {unreadCount > 0 && (
            <View style={s.notifBadge}>
              <Text style={s.notifBadgeTxt}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.g400, marginTop: 12, fontSize: 13 }}>Loading your dashboard...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <View style={s.errorIconWrap}>
            <FontAwesome5 name="exclamation-circle" size={30} color={C.g400} />
          </View>
          <Text style={s.errorTitle}>Something went wrong</Text>
          <Text style={s.errorSub}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryBtnTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
        >
          {/* Stats */}
          <View style={s.statsSection}>
            <Text style={s.sectionTitle}>Overview</Text>
            <View style={s.statsRow}>
              <StatCard
                icon="briefcase"
                label="Active Cases"
                value={data?.active_cases ?? 0}
                bg={C.blue50}
                color={C.primary}
              />
              <StatCard
                icon="file-invoice-dollar"
                label="Pending"
                value={`$${data?.pending_invoices_total ?? 0}`}
                bg={C.amber50}
                color={C.amber600}
                sub={`${data?.pending_invoices_count ?? 0} invoice(s)`}
              />
              <StatCard
                icon="file-alt"
                label="Documents"
                value={data?.pending_documents ?? 0}
                bg={C.green50}
                color={C.green600}
                sub="to review"
              />
            </View>
          </View>

          {/* Quick Access */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Quick Access</Text>
            <View style={s.quickGrid}>
              {QUICK_ITEMS.map((q) => (
                <TouchableOpacity
                  key={q.route}
                  style={s.quickCard}
                  onPress={() => navigation.navigate(q.route)}
                  activeOpacity={0.75}
                >
                  <View style={[s.quickIconWrap, { backgroundColor: q.iconBg }]}>
                    <FontAwesome5 name={q.icon} size={22} color={q.iconColor} />
                  </View>
                  <Text style={[s.quickLabel, { color: q.iconColor }]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Upcoming Appointments */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Upcoming Appointments</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ClientAppointments')} activeOpacity={0.7}>
                <Text style={s.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {data?.upcoming_appointments?.length > 0 ? (
              data.upcoming_appointments.map((ev) => (
                <AppointmentCard key={ev.id} event={ev} />
              ))
            ) : (
              <View style={s.emptyBox}>
                <View style={s.emptyIconWrap}>
                  <FontAwesome5 name="calendar-check" size={26} color={C.g400} />
                </View>
                <Text style={s.emptyTitle}>No upcoming appointments</Text>
                <Text style={s.emptyTxt}>Your scheduled meetings will appear here</Text>
              </View>
            )}
          </View>

          {/* Recent Activity */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ClientActivity')} activeOpacity={0.7}>
                <Text style={s.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {activity.length === 0 ? (
              <View style={[s.emptyBox, { paddingVertical: 20 }]}>
                <FontAwesome5 name="history" size={20} color={C.g400} />
                <Text style={[s.emptyTitle, { fontSize: 13, marginTop: 8, marginBottom: 0 }]}>No recent activity</Text>
              </View>
            ) : (
              <View style={s.activityCard}>
                {activity.map((ev, i) => {
                  const m = ACT_META(ev.action_type || '', ev.action || '');
                  const d = ev.created_at ? new Date(ev.created_at) : null;
                  const ago = d ? (() => {
                    const sec = Math.floor((Date.now() - d) / 1000);
                    if (sec < 60) return 'Just now';
                    if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
                    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
                    return `${Math.floor(sec/86400)}d ago`;
                  })() : '';
                  const isLast = i === activity.length - 1;
                  return (
                    <View key={i} style={[s.activityRow, !isLast && s.activityRowBorder]}>
                      <View style={[s.activityIcon, { backgroundColor: m.bg }]}>
                        <FontAwesome5 name={m.icon} size={12} color={m.color} />
                      </View>
                      <Text style={s.activityAction} numberOfLines={2}>{ev.action || 'Activity'}</Text>
                      <Text style={s.activityTime}>{ago}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, padding: 24 },

  header:         { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  bellBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  notifBadge:     { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red600, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.primary },
  notifBadgeTxt:  { fontSize: 9, fontWeight: '900', color: C.white, lineHeight: 13 },
  greeting:       { fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  clientName:     { fontSize: 21, fontWeight: '800', color: C.white, marginTop: 2 },
  avatarBtn:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarImg:      { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  avatarInitials: { color: C.white, fontWeight: '800', fontSize: 18 },

  errorIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  errorTitle:    { fontSize: 17, fontWeight: '700', color: C.dark, marginBottom: 6 },
  errorSub:      { fontSize: 13, color: C.g400, textAlign: 'center', marginBottom: 24 },
  retryBtn:      { paddingHorizontal: 28, paddingVertical: 13, backgroundColor: C.primary, borderRadius: 14 },
  retryBtnTxt:   { color: C.white, fontWeight: '700', fontSize: 14 },

  statsSection: { backgroundColor: C.white, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.g100 },
  statsRow:     { flexDirection: 'row', gap: 10 },
  statCard:     { flex: 1, borderRadius: 18, padding: 13, alignItems: 'center', overflow: 'hidden' },
  statIcon:     { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue:    { fontSize: 20, fontWeight: '800' },
  statLabel:    { fontSize: 11, color: C.g500, marginTop: 2, textAlign: 'center' },
  statSub:      { fontSize: 10, color: C.g400, marginTop: 2, textAlign: 'center' },
  statAccent:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },

  section:      { backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 18, marginTop: 10, borderTopWidth: 1, borderTopColor: C.g100, borderBottomWidth: 1, borderBottomColor: C.g100 },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.dark },
  seeAll:       { fontSize: 13, fontWeight: '600', color: C.primary },

  quickGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard:    { width: '47.5%', backgroundColor: C.g50, borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: C.g100 },
  quickIconWrap:{ width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickLabel:   { fontSize: 13, fontWeight: '700' },

  apptCard:     { backgroundColor: C.white, borderRadius: 18, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  apptDateBox:  { backgroundColor: C.blue50, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', minWidth: 60 },
  apptDayNum:   { fontSize: 24, fontWeight: '800', color: C.primary, lineHeight: 28 },
  apptMonth:    { fontSize: 11, fontWeight: '700', color: C.secondary, marginTop: 1 },
  apptTimePill: { backgroundColor: C.primary + '18', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginTop: 5 },
  apptTime:     { fontSize: 10, fontWeight: '700', color: C.primary },
  apptTitle:    { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 3 },
  apptType:     { fontSize: 11, color: C.g500, textTransform: 'capitalize' },
  apptLoc:      { fontSize: 11, color: C.g400 },
  videoBadge:   { backgroundColor: C.blue50, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', gap: 3 },
  videoBadgeTxt:{ fontSize: 9, fontWeight: '700', color: C.primary },

  activityCard:      { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.g100 },
  activityRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 12 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: C.g100 },
  activityIcon:      { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  activityAction:    { flex: 1, fontSize: 13, fontWeight: '500', color: C.dark, lineHeight: 18 },
  activityTime:      { fontSize: 11, color: C.g400, marginLeft: 8, flexShrink: 0 },

  emptyBox:      { alignItems: 'center', paddingVertical: 32, backgroundColor: C.g50, borderRadius: 16, borderWidth: 1, borderColor: C.g100 },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 4 },
  emptyTxt:      { fontSize: 12, color: C.g400, textAlign: 'center', paddingHorizontal: 24 },
});
