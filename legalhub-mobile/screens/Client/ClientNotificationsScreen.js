import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { notificationsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green100: '#DCFCE7', green500: '#22C55E', green600: '#16A34A',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

const TYPE_META = {
  case_update:           { icon: 'briefcase',          color: C.primary,   bg: C.blue50,    label: 'Case Update'   },
  new_invoice:           { icon: 'file-invoice',       color: C.amber600,  bg: C.amber50,   label: 'Invoice'       },
  document_approval:     { icon: 'check-circle',       color: C.green600,  bg: C.green50,   label: 'Document'      },
  document_shared:       { icon: 'file-alt',           color: C.primary,   bg: C.blue50,    label: 'Document'      },
  document_request:      { icon: 'inbox',              color: C.amber600,  bg: C.amber50,   label: 'Request'       },
  appointment_confirmed: { icon: 'calendar-check',     color: C.purple600, bg: C.purple50,  label: 'Appointment'   },
  appointment_reminder:  { icon: 'clock',              color: C.amber600,  bg: C.amber50,   label: 'Reminder'      },
  payment_received:      { icon: 'money-bill-wave',    color: C.green600,  bg: C.green50,   label: 'Payment'       },
  invoice_overdue:       { icon: 'exclamation-circle', color: C.red600,    bg: C.red50,     label: 'Overdue'       },
  invoice_due:           { icon: 'file-invoice-dollar',color: C.amber600,  bg: C.amber50,   label: 'Invoice'       },
  general:               { icon: 'calendar-check',     color: C.purple600, bg: C.purple50,  label: 'Event'         },
  DEFAULT:               { icon: 'bell',               color: C.secondary, bg: C.blue50,    label: 'Notification'  },
};

const MEETING_TYPE_CFG = {
  VIDEO:     { icon: 'video',    color: C.teal600,   bg: C.teal50,    label: 'Video Call'  },
  IN_PERSON: { icon: 'building', color: C.primary,   bg: C.blue50,    label: 'In Person'   },
  PHONE:     { icon: 'phone',    color: C.amber600,  bg: C.amber50,   label: 'Phone Call'  },
};

function getMeta(type) {
  if (!type) return TYPE_META.DEFAULT;
  return TYPE_META[type.toLowerCase()] || TYPE_META.DEFAULT;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function groupByDate(notifications) {
  const groups = {};
  notifications.forEach(n => {
    const d    = n.created_at ? new Date(n.created_at) : new Date();
    const now  = new Date();
    const diff = Math.floor((now - d) / 86400000);
    let key;
    if (diff === 0)      key = 'Today';
    else if (diff === 1) key = 'Yesterday';
    else if (diff < 7)   key = d.toLocaleDateString('en-GB', { weekday: 'long' });
    else                 key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  return groups;
}

function parseMeetingData(notif) {
  if (notif.type?.toUpperCase() !== 'MEETING_REQUEST') return null;
  try { return JSON.parse(notif.message); } catch { return null; }
}

function parseEventData(notif) {
  if (notif.type?.toLowerCase() !== 'general') return null;
  try { return JSON.parse(notif.message); } catch { return null; }
}

function fmtEventDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr.replace('Z', '+00:00'));
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const time = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + time;
}

// ─── MEETING CONFIRMED / DECLINED CARD ──────────────────────────────────────
function MeetingNotifCard({ notif, data, onRead, onNavigate }) {
  const unread     = !notif.is_read;
  const time       = timeAgo(notif.created_at);
  const isAccepted = data?.status === 'ACCEPTED' || !!data?.date_display || !!data?.event_title;
  const isRejected = data?.status === 'REJECTED';
  const isVideo    = data?.is_video || data?.meeting_type === 'VIDEO';
  const mtCfg      = MEETING_TYPE_CFG[data?.meeting_type] || (isVideo ? MEETING_TYPE_CFG.VIDEO : null);

  const accentColor = isRejected ? C.red600 : C.teal600;
  const accentBg    = isRejected ? C.red50   : C.teal50;
  const accentLight = isRejected ? C.red100  : C.teal100;

  const handleJoin = () => {
    const link = data?.video_call_url;
    if (!link) return;
    Linking.openURL(link).catch(() =>
      Alert.alert('Cannot Open Link', 'The meeting link could not be opened.')
    );
  };

  const handlePress = () => {
    if (unread) onRead(notif.id);
    if (isAccepted) onNavigate(notif, null);
  };

  return (
    <TouchableOpacity
      style={[mc.card, { borderColor: unread ? accentColor + '40' : C.g100 }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* Accent bar */}
      <View style={[mc.accentBar, { backgroundColor: accentColor }]} />

      <View style={{ flex: 1, paddingLeft: 4 }}>
        {/* Header row */}
        <View style={mc.headerRow}>
          <View style={[mc.statusBadge, { backgroundColor: accentLight }]}>
            <FontAwesome5
              name={isRejected ? 'times-circle' : 'calendar-check'}
              size={12}
              color={accentColor}
              style={{ marginRight: 5 }}
            />
            <Text style={[mc.statusTxt, { color: accentColor }]}>
              {isRejected ? 'Request Declined' : 'Meeting Scheduled'}
            </Text>
          </View>
          <View style={mc.timeRow}>
            {unread && <View style={[mc.dot, { backgroundColor: accentColor }]} />}
            <Text style={mc.time}>{time}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[mc.title, unread && { color: C.dark }]} numberOfLines={2}>
          {notif.title || (isRejected ? 'Meeting Request Declined' : 'Meeting Confirmed')}
        </Text>

        {/* Lawyer */}
        {!!data?.lawyer_name && (
          <View style={mc.infoRow}>
            <View style={mc.infoIcon}>
              <FontAwesome5 name="user-tie" size={11} color={C.primary} />
            </View>
            <Text style={mc.infoTxt}>{data.lawyer_name}</Text>
          </View>
        )}

        {/* Date — accepted only */}
        {isAccepted && !!(data?.date_display || data?.start_datetime) && (
          <View style={mc.infoRow}>
            <View style={[mc.infoIcon, { backgroundColor: accentLight }]}>
              <FontAwesome5 name="calendar-alt" size={11} color={accentColor} />
            </View>
            <Text style={[mc.infoTxt, { color: accentColor, fontWeight: '700' }]}>
              {data.date_display || fmtEventDate(data.start_datetime)}
            </Text>
          </View>
        )}

        {/* Meeting type badge — accepted only */}
        {isAccepted && !!mtCfg && (
          <View style={mc.infoRow}>
            <View style={[mc.infoIcon, { backgroundColor: mtCfg.bg }]}>
              <FontAwesome5 name={mtCfg.icon} size={11} color={mtCfg.color} />
            </View>
            <Text style={[mc.infoTxt, { color: mtCfg.color, fontWeight: '600' }]}>{mtCfg.label}</Text>
          </View>
        )}

        {/* Location — IN_PERSON */}
        {isAccepted && !isVideo && !!data?.location && (
          <View style={mc.infoRow}>
            <View style={mc.infoIcon}>
              <FontAwesome5 name="map-marker-alt" size={11} color={C.g500} />
            </View>
            <Text style={mc.infoTxt} numberOfLines={1}>{data.location}</Text>
          </View>
        )}

        {/* Rejection reason */}
        {isRejected && !!data?.reason && (
          <View style={[mc.reasonBox, { backgroundColor: C.red50, borderColor: C.red100 }]}>
            <Text style={mc.reasonTxt}>"{data.reason}"</Text>
          </View>
        )}

        {/* Join Meeting button — video accepted */}
        {isAccepted && isVideo && !!data?.video_call_url && (
          <TouchableOpacity style={mc.joinBtn} onPress={handleJoin} activeOpacity={0.85}>
            <FontAwesome5 name="video" size={12} color={C.white} style={{ marginRight: 7 }} />
            <Text style={mc.joinBtnTxt}>Join Meeting</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── STANDARD NOTIFICATION CARD ─────────────────────────────────────────────
function NotifCard({ notif, onRead, onNavigate }) {
  const meta       = getMeta(notif.type);
  const unread     = !notif.is_read;
  const time       = timeAgo(notif.created_at);
  const type       = notif.type?.toLowerCase();
  const eventData  = parseEventData(notif);
  const isDocRequest   = type === 'document_request' && !!notif.reference_id;
  const isEventNotif   = !!eventData?.event_id;
  const isActionable   = isDocRequest || isEventNotif
                      || type === 'case_update'
                      || type === 'invoice_due'
                      || type === 'document_shared'
                      || type === 'document_approval';

  let displayMessage = notif.message || '';
  if (isEventNotif) {
    const parts = [];
    if (eventData.event_type) parts.push(eventData.event_type);
    if (eventData.start_datetime) parts.push(fmtEventDate(eventData.start_datetime));
    if (eventData.case_title) parts.push(eventData.case_title);
    if (eventData.is_video_call) parts.push('Video Call');
    else if (eventData.location) parts.push(eventData.location);
    displayMessage = parts.join('  ·  ');
  }

  const handlePress = () => {
    if (unread) onRead(notif.id);
    if (isActionable) onNavigate(notif, eventData);
  };

  return (
    <TouchableOpacity
      style={[s.card, unread && s.cardUnread, isActionable && s.cardActionable]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {unread && <View style={[s.accentBar, { backgroundColor: meta.color }]} />}

      <View style={[s.iconCircle, { backgroundColor: meta.bg }]}>
        <FontAwesome5 name={meta.icon} size={18} color={meta.color} />
      </View>

      <View style={s.body}>
        <View style={s.titleRow}>
          <Text style={[s.title, unread && s.titleUnread]} numberOfLines={2}>
            {notif.title || 'Notification'}
          </Text>
          {unread && (
            <View style={[s.newBadge, { backgroundColor: meta.color }]}>
              <Text style={s.newBadgeTxt}>NEW</Text>
            </View>
          )}
        </View>

        {!!displayMessage && (
          <Text style={[s.message, !unread && s.messageRead]} numberOfLines={3}>
            {displayMessage}
          </Text>
        )}

        <View style={s.footer}>
          <View style={[s.typePill, { backgroundColor: meta.bg }]}>
            <Text style={[s.typePillTxt, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={s.timeWrap}>
            {isDocRequest && (
              <Text style={[s.actionHint, { color: meta.color }]}>Upload  </Text>
            )}
            {(isEventNotif || (!isDocRequest && isActionable)) && (
              <Text style={[s.actionHint, { color: meta.color }]}>View  </Text>
            )}
            <Ionicons name="time-outline" size={11} color={C.g400} />
            <Text style={s.time}> {time}</Text>
          </View>
        </View>
      </View>

      {isActionable
        ? <Ionicons name="chevron-forward" size={16} color={meta.color} style={{ marginLeft: 6, marginTop: 2 }} />
        : !unread && <Ionicons name="checkmark-done" size={14} color={C.g200} style={{ marginLeft: 8, marginTop: 2 }} />
      }
    </TouchableOpacity>
  );
}

// ─── ÉCRAN PRINCIPAL ─────────────────────────────────────────────────────────
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

  useEffect(() => {
    load().then(() => {
      notificationsAPI.markAllRead().catch(() => {});
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    });
  }, [load]);

  const handleRead = async (id) => {
    try {
      await notificationsAPI.markOneRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch {}
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
    setMarkingAll(false);
  };

  const handleNavigate = (notif, eventData) => {
    const type = notif.type?.toLowerCase();
    if (type === 'document_request' && notif.reference_id) {
      navigation.navigate('ClientDocuments', { caseId: notif.reference_id });
    } else if (type === 'general' && eventData?.event_id) {
      navigation.navigate('ClientAppointments');
    } else if (type === 'meeting_request') {
      navigation.navigate('ClientAppointments');
    } else if (type === 'case_update') {
      navigation.navigate('ClientCases');
    } else if (type === 'invoice_due') {
      navigation.navigate('ClientInvoices');
    } else if (type === 'document_shared' || type === 'document_approval') {
      navigation.navigate('ClientDocuments');
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const groups      = groupByDate(notifications);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={s.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAll} disabled={markingAll} style={s.markAllBtn} activeOpacity={0.8}>
            {markingAll
              ? <ActivityIndicator size="small" color={C.white} />
              : <>
                  <Ionicons name="checkmark-done" size={14} color={C.white} />
                  <Text style={s.markAllTxt}>Mark all read</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="notifications-off-outline" size={34} color={C.g400} />
          </View>
          <Text style={s.emptyTitle}>All caught up!</Text>
          <Text style={s.emptySubtitle}>No notifications for now</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {unreadCount > 0 && (
            <View style={s.unreadBanner}>
              <View style={s.unreadBannerDot} />
              <Text style={s.unreadBannerTxt}>
                {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
              </Text>
              <Text style={s.unreadBannerHint}>Tap to mark as read</Text>
            </View>
          )}

          {Object.entries(groups).map(([date, items]) => (
            <View key={date}>
              <View style={s.groupRow}>
                <View style={s.groupLine} />
                <Text style={s.groupLabel}>{date}</Text>
                <View style={s.groupLine} />
              </View>

              {items.map((n, i) => {
                const meetingData = parseMeetingData(n);
                if (meetingData) {
                  return (
                    <MeetingNotifCard
                      key={n.id || i}
                      notif={n}
                      data={meetingData}
                      onRead={handleRead}
                      onNavigate={handleNavigate}
                    />
                  );
                }
                return (
                  <NotifCard key={n.id || i} notif={n} onRead={handleRead} onNavigate={handleNavigate} />
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── STYLES : MEETING CARD ────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 20, marginHorizontal: 16, marginBottom: 10,
    padding: 16, paddingLeft: 20,
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
    borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  statusTxt:  { fontSize: 11, fontWeight: '800' },
  timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  time:       { fontSize: 11, color: C.g400, fontWeight: '500' },
  title:      { fontSize: 14, fontWeight: '700', color: C.g600, marginBottom: 10, lineHeight: 20 },
  infoRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  infoIcon:   { width: 26, height: 26, borderRadius: 8, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  infoTxt:    { fontSize: 13, color: C.g600, fontWeight: '500', flex: 1 },
  reasonBox:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  reasonTxt:  { fontSize: 12, color: C.red600, fontStyle: 'italic', lineHeight: 18 },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.teal600, borderRadius: 14,
    paddingVertical: 11, paddingHorizontal: 20,
    marginTop: 10, alignSelf: 'flex-start',
  },
  joinBtnTxt: { color: C.white, fontWeight: '800', fontSize: 13 },
});

// ─── STYLES : STANDARD CARD + LAYOUT ─────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  markAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  markAllTxt:  { fontSize: 12, fontWeight: '700', color: C.white },

  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '800', color: C.dark, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: C.g500 },

  unreadBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blue50, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: C.blue100 },
  unreadBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginRight: 8 },
  unreadBannerTxt: { fontSize: 13, fontWeight: '700', color: C.primary, flex: 1 },
  unreadBannerHint:{ fontSize: 11, color: C.secondary },

  groupRow:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 10, gap: 10 },
  groupLine:  { flex: 1, height: 1, backgroundColor: C.g200 },
  groupLabel: { fontSize: 11, fontWeight: '700', color: C.g400, textTransform: 'uppercase', letterSpacing: 0.8 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 20, marginHorizontal: 16, marginBottom: 10,
    padding: 14, paddingLeft: 18,
    borderWidth: 1, borderColor: C.g100,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },
  cardUnread:     { backgroundColor: '#F0F7FF', borderColor: C.blue100 },
  cardActionable: { borderStyle: 'solid' },
  accentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
  },
  iconCircle:  { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 },
  body:        { flex: 1 },
  titleRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  title:       { flex: 1, fontSize: 14, fontWeight: '600', color: C.g600, lineHeight: 20 },
  titleUnread: { fontWeight: '800', color: C.dark },
  newBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, flexShrink: 0, marginTop: 2 },
  newBadgeTxt: { fontSize: 9, fontWeight: '900', color: C.white, letterSpacing: 0.6 },
  message:     { fontSize: 13, color: C.g500, lineHeight: 19, marginBottom: 8 },
  messageRead: { color: C.g400 },
  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typePill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typePillTxt: { fontSize: 10, fontWeight: '700' },
  timeWrap:    { flexDirection: 'row', alignItems: 'center' },
  time:        { fontSize: 11, color: C.g400, fontWeight: '500' },
  actionHint:  { fontSize: 10, fontWeight: '700' },
});
