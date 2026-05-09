import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF',
  dark:    '#1E293B',
  white:   '#FFFFFF',
  g50:     '#F9FAFB',
  g100:    '#F3F4F6',
  g200:    '#E5E7EB',
  g300:    '#D1D5DB',
  g400:    '#9CA3AF',
  g500:    '#6B7280',
};

// Identical logic to TL_META in CaseDetailsScreen — keyed by action_type + action text
function TL_META(actionType = '', actionText = '') {
  const t = actionType.toLowerCase();
  const a = actionText.toLowerCase();
  if (t.includes('document') || a.includes('document') || a.includes('upload') || a.includes('file'))
    return { icon: 'file-alt',            color: '#DC2626', bg: '#FEE2E2' };
  if (t.includes('note') || a.includes('note'))
    return { icon: 'sticky-note',         color: '#7C3AED', bg: '#EDE9FE' };
  if (t.includes('task') || a.includes('task'))
    return { icon: 'check-square',        color: '#D97706', bg: '#FEF3C7' };
  if (t.includes('appointment') || t.includes('meeting') || a.includes('meeting') || a.includes('appointment') || a.includes('consultation'))
    return { icon: 'user-friends',        color: '#0891B2', bg: '#CFFAFE' };
  if (t.includes('invoice') || t.includes('payment') || a.includes('invoice') || a.includes('payment') || a.includes('billing'))
    return { icon: 'file-invoice-dollar', color: '#059669', bg: '#D1FAE5' };
  if (t.includes('status') || t.includes('updated') || a.includes('status') || a.includes('update') || a.includes('edit'))
    return { icon: 'pen',                 color: '#0F766E', bg: '#CCFBF1' };
  if (t.includes('team') || t.includes('member') || a.includes('team') || a.includes('member'))
    return { icon: 'user-plus',           color: '#1D4ED8', bg: '#DBEAFE' };
  if (t.includes('closed') || t.includes('archive') || a.includes('closed') || a.includes('archive'))
    return { icon: 'archive',             color: '#6B7280', bg: '#F3F4F6' };
  if (t.includes('created') || t.includes('opened') || t.includes('added') || a.includes('created') || a.includes('opened') || a.includes('new'))
    return { icon: 'plus-circle',         color: '#16A34A', bg: '#DCFCE7' };
  return   { icon: 'history',             color: '#1E40AF', bg: '#EFF6FF' };
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function dayKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const date = new Date(dateStr); date.setHours(0, 0, 0, 0);
  const diff = Math.round((now - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function groupByDay(events) {
  const groups = [];
  const seen   = {};
  events.forEach(ev => {
    const key = dayKey(ev.created_at);
    if (!seen[key]) { seen[key] = true; groups.push({ day: key, entries: [] }); }
    groups[groups.length - 1].entries.push(ev);
  });
  return groups;
}

export default function ClientActivityScreen({ navigation }) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clientPortalAPI.activity();
      setEvents(Array.isArray(data) ? data : (data?.activities || data?.events || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = groupByDay(events);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Activity Timeline</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.g400, marginTop: 12, fontSize: 13 }}>Loading activity…</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <FontAwesome5 name="stream" size={28} color={C.g300} />
          </View>
          <Text style={s.emptyTitle}>No Activity Yet</Text>
          <Text style={s.emptySub}>Events on your cases will appear here</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Banner — same as tl.header in CaseDetailsScreen */}
          <View style={s.banner}>
            <View style={s.bannerIcon}>
              <FontAwesome5 name="stream" size={16} color={C.white} />
            </View>
            <View>
              <Text style={s.bannerTitle}>Activity Timeline</Text>
              <Text style={s.bannerSub}>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </Text>
            </View>
          </View>

          {groups.map(group => (
            <View key={group.day}>
              {/* Day separator — same as tl.dayRow in CaseDetailsScreen */}
              <View style={s.dayRow}>
                <View style={s.dayLine} />
                <View style={s.dayPill}>
                  <Text style={s.dayTxt}>{group.day.toUpperCase()}</Text>
                </View>
                <View style={s.dayLine} />
              </View>

              {/* Group card — same as tl.groupCard */}
              <View style={s.groupCard}>
                {group.entries.map((ev, idx) => {
                  const m = TL_META(ev.action_type || '', ev.action || '');
                  return (
                    <View
                      key={ev.id || idx}
                      style={[s.entryRow, idx < group.entries.length - 1 && s.entryBorder]}
                    >
                      {/* Dot — same as tl.dot */}
                      <View style={[s.dot, { backgroundColor: m.bg }]}>
                        <FontAwesome5 name={m.icon} size={12} color={m.color} />
                      </View>

                      <View style={s.entryBody}>
                        <Text style={s.actionTxt} numberOfLines={2}>
                          {ev.action || 'Activity'}
                        </Text>
                        {!!ev.performed_by && (
                          <Text style={s.actorTxt}>by {ev.performed_by}</Text>
                        )}
                        {!!ev.case_title && (
                          <View style={s.casePill}>
                            <FontAwesome5
                              name="briefcase"
                              size={9}
                              color={C.primary}
                              style={{ marginRight: 4 }}
                            />
                            <Text style={s.casePillTxt} numberOfLines={1}>
                              {ev.case_title}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={s.timeTxt}>{relativeTime(ev.created_at)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, padding: 24 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },

  emptyIcon:  { width: 72, height: 72, borderRadius: 22, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.dark, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: C.g400, textAlign: 'center' },

  // Banner (= tl.header from CaseDetailsScreen)
  banner:      { marginHorizontal: 16, marginBottom: 16, backgroundColor: C.primary, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bannerIcon:  { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  bannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  // Day separator (= tl.dayRow)
  dayRow:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10 },
  dayLine: { flex: 1, height: 1, backgroundColor: C.g200 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: C.g100, marginHorizontal: 10 },
  dayTxt:  { fontSize: 11, fontWeight: '700', color: C.g500, letterSpacing: 0.4 },

  // Group card (= tl.groupCard)
  groupCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.g100, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },

  // Entry (= tl.entryRow / tl.entryBorder / tl.entryBody)
  entryRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: C.g100 },
  entryBody:   { flex: 1, marginLeft: 12, marginRight: 8 },

  // Dot (= tl.dot)
  dot: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Text (= tl.actionTxt / tl.actorTxt / tl.timeTxt)
  actionTxt: { fontSize: 13, fontWeight: '700', color: C.dark, lineHeight: 18 },
  actorTxt:  { fontSize: 11, color: C.g500, marginTop: 2 },
  timeTxt:   { fontSize: 11, color: C.g400, flexShrink: 0 },

  // Case pill
  casePill:    { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  casePillTxt: { fontSize: 11, fontWeight: '600', color: C.primary },
});
