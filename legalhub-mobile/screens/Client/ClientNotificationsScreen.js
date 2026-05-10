import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { notificationsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  purple50: '#FAF5FF', purple600: '#9333EA',
  red50: '#FEF2F2', red600: '#DC2626',
};

const NOTIF_TYPE = {
  case_update:            { icon: 'briefcase',      color: C.primary,  bg: C.blue50   },
  new_invoice:            { icon: 'file-invoice',   color: C.amber600, bg: C.amber50  },
  document_approval:      { icon: 'file-alt',       color: C.green600, bg: C.green50  },
  appointment_confirmed:  { icon: 'calendar-check', color: C.purple600, bg: C.purple50 },
  appointment_reminder:   { icon: 'bell',           color: C.amber600, bg: C.amber50  },
  payment_received:       { icon: 'check-circle',   color: C.green600, bg: C.green50  },
  invoice_overdue:        { icon: 'exclamation-circle', color: C.red600, bg: C.red50  },
  DEFAULT:                { icon: 'bell',           color: C.g500,     bg: C.g100     },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function groupByDate(notifications) {
  const groups = {};
  notifications.forEach(n => {
    const d = n.created_at ? new Date(n.created_at) : new Date();
    const now  = new Date();
    const diff = Math.floor((now - d) / 86400000);
    let key;
    if (diff === 0) key = 'Today';
    else if (diff === 1) key = 'Yesterday';
    else if (diff < 7) key = d.toLocaleDateString('en-GB', { weekday: 'long' });
    else key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  return groups;
}

function NotifCard({ notif, onRead }) {
  const tc = NOTIF_TYPE[notif.type] || NOTIF_TYPE.DEFAULT;
  const unread = !notif.read_at;

  return (
    <TouchableOpacity
      style={[s.notifCard, unread && s.notifUnread]}
      onPress={() => !notif.read_at && onRead(notif.id)}
      activeOpacity={0.85}
    >
      {unread && <View style={s.unreadDot} />}
      <View style={[s.notifIconWrap, { backgroundColor: tc.bg }]}>
        <FontAwesome5 name={tc.icon} size={15} color={tc.color} />
      </View>
      <View style={s.notifBody}>
        <Text style={[s.notifTitle, unread && { color: C.dark }]} numberOfLines={2}>
          {notif.title || 'Notification'}
        </Text>
        {!!notif.message && (
          <Text style={s.notifMsg} numberOfLines={3}>{notif.message}</Text>
        )}
        <Text style={s.notifTime}>{timeAgo(notif.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ClientNotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [markingAll, setMarkingAll]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationsAPI.list();
      setNotifications(Array.isArray(data) ? data : (data?.notifications || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRead = async (id) => {
    try {
      await notificationsAPI.markOneRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch {}
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {}
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;
  const groups = groupByDate(notifications);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAll} disabled={markingAll} style={s.markAllBtn} activeOpacity={0.8}>
            {markingAll
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={s.markAllTxt}>Mark all read</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="bell-slash" size={28} color={C.g400} />
          </View>
          <Text style={s.emptyTitle}>No Notifications</Text>
          <Text style={s.emptySubtitle}>You're all caught up!</Text>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {unreadCount > 0 && (
            <View style={s.unreadBanner}>
              <FontAwesome5 name="circle" size={8} color={C.primary} style={{ marginRight: 8 }} />
              <Text style={s.unreadBannerTxt}>{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}</Text>
            </View>
          )}

          {Object.entries(groups).map(([date, items]) => (
            <View key={date}>
              <Text style={s.groupLabel}>{date}</Text>
              {items.map((n, i) => (
                <NotifCard key={n.id || i} notif={n} onRead={handleRead} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  markAllBtn:  { paddingHorizontal: 10, paddingVertical: 6 },
  markAllTxt:  { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: C.dark, marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: C.g500 },

  unreadBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blue50, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.blue100 },
  unreadBannerTxt: { fontSize: 13, fontWeight: '600', color: C.primary },

  groupLabel: { fontSize: 11, fontWeight: '700', color: C.g400, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },

  notifCard:   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g100 },
  notifUnread: { backgroundColor: C.blue50 },
  unreadDot:   { position: 'absolute', top: 18, left: 6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.primary },
  notifIconWrap:{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  notifBody:   { flex: 1 },
  notifTitle:  { fontSize: 14, fontWeight: '600', color: C.g600, lineHeight: 20, marginBottom: 3 },
  notifMsg:    { fontSize: 13, color: C.g500, lineHeight: 18, marginBottom: 5 },
  notifTime:   { fontSize: 11, color: C.g400, fontWeight: '500' },
});
