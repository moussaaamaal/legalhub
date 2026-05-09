import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  red50: '#FEF2F2', red600: '#DC2626',
};

// Same icon/color mapping as TL_META in CaseDetailsScreen
function TL_META(actionText = '') {
  const a = actionText.toLowerCase();
  if (a.includes('document') || a.includes('upload') || a.includes('file'))
    return { icon: 'file-alt',            color: '#DC2626', bg: '#FEE2E2' };
  if (a.includes('note'))
    return { icon: 'sticky-note',         color: '#7C3AED', bg: '#EDE9FE' };
  if (a.includes('task'))
    return { icon: 'check-square',        color: '#D97706', bg: '#FEF3C7' };
  if (a.includes('hearing') || a.includes('court'))
    return { icon: 'gavel',               color: '#1D4ED8', bg: '#DBEAFE' };
  if (a.includes('meeting') || a.includes('appointment') || a.includes('consultation'))
    return { icon: 'user-friends',        color: '#0891B2', bg: '#CFFAFE' };
  if (a.includes('invoice') || a.includes('payment') || a.includes('billing'))
    return { icon: 'file-invoice-dollar', color: '#059669', bg: '#D1FAE5' };
  if (a.includes('status') || a.includes('update') || a.includes('edit'))
    return { icon: 'pen',                 color: '#0F766E', bg: '#CCFBF1' };
  if (a.includes('create') || a.includes('open') || a.includes('added') || a.includes('new'))
    return { icon: 'plus-circle',         color: '#16A34A', bg: '#DCFCE7' };
  if (a.includes('close') || a.includes('archive'))
    return { icon: 'archive',             color: '#6B7280', bg: '#F3F4F6' };
  return   { icon: 'history',             color: '#1E40AF', bg: '#EFF6FF' };
}

function dayKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const date = new Date(dateStr); date.setHours(0, 0, 0, 0);
  const diff = Math.round((now - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDay(events) {
  const groups = [];
  const seen   = {};
  (events || []).forEach(ev => {
    const key = dayKey(ev.created_at);
    if (!seen[key]) { seen[key] = true; groups.push({ day: key, entries: [] }); }
    groups[groups.length - 1].entries.push(ev);
  });
  return groups;
}

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: C.primary,  bg: C.blue50,   icon: 'folder-open'    },
  IN_PROGRESS: { label: 'In Progress', color: C.amber600, bg: C.amber50,  icon: 'spinner'        },
  PENDING:     { label: 'Pending',     color: '#EA580C',  bg: '#FFF7ED',  icon: 'clock'          },
  CLOSED:      { label: 'Closed',      color: C.g500,     bg: C.g100,     icon: 'folder'         },
  SETTLED:     { label: 'Settled',     color: C.green600, bg: C.green50,  icon: 'check-circle'   },
};

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>
        <FontAwesome5 name={icon} size={13} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ClientCaseDetailScreen({ route, navigation }) {
  const { caseId, caseTitle } = route.params;
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    clientPortalAPI.caseDetail(caseId)
      .then(d => setCaseData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [caseId]);

  const st = STATUS_CONFIG[caseData?.status] || { label: caseData?.status || '', color: C.g500, bg: C.g100, icon: 'folder' };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{caseTitle || 'Case Detail'}</Text>
          {caseData?.case_number ? (
            <Text style={s.headerSub}>{caseData.case_number}</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : !caseData ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="folder-open" size={28} color={C.g400} />
          </View>
          <Text style={{ color: C.g500, fontSize: 15, fontWeight: '600', marginTop: 4 }}>Case not found</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Banner */}
          <View style={[s.statusBanner, { backgroundColor: st.bg, borderColor: st.color + '33' }]}>
            <View style={[s.statusIconWrap, { backgroundColor: st.color + '20' }]}>
              <FontAwesome5 name={st.icon} size={16} color={st.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.statusLabel, { color: st.color }]}>{st.label}</Text>
              {caseData.progress_percent != null && (
                <View style={{ marginTop: 8 }}>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${caseData.progress_percent}%`, backgroundColor: st.color }]} />
                  </View>
                  <Text style={[s.progressPct, { color: st.color }]}>{caseData.progress_percent}% complete</Text>
                </View>
              )}
            </View>
          </View>

          {/* Case Info */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <FontAwesome5 name="briefcase" size={14} color={C.primary} />
              </View>
              <Text style={s.cardTitle}>Case Information</Text>
            </View>
            <InfoRow icon="hashtag"            label="Case Number"   value={caseData.case_number} />
            <InfoRow icon="tag"                label="Type"          value={caseData.case_type?.replace(/_/g, ' ')} />
            <InfoRow icon="layer-group"        label="Practice Area" value={caseData.practice_area} />
            <InfoRow icon="exclamation-circle" label="Priority"      value={caseData.priority} />
            <InfoRow icon="university"         label="Court"         value={caseData.court_name} />
            <InfoRow icon="gavel"              label="First Hearing"
              value={caseData.first_hearing_date ? new Date(caseData.first_hearing_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null}
            />
            <InfoRow icon="calendar-alt"       label="Opened"
              value={caseData.created_at ? new Date(caseData.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null}
            />
          </View>

          {/* Lead Attorney */}
          {caseData.lead_attorney && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}>
                  <FontAwesome5 name="user-tie" size={14} color={C.primary} />
                </View>
                <Text style={s.cardTitle}>Your Attorney</Text>
              </View>
              <View style={s.attorneyRow}>
                <View style={s.attorneyAvatar}>
                  <FontAwesome5 name="user-tie" size={22} color={C.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.attorneyName}>{caseData.lead_attorney.full_name}</Text>
                  <Text style={s.attorneyTitle}>{caseData.lead_attorney.title}</Text>
                  {caseData.lead_attorney.email ? (
                    <Text style={s.attorneyEmail}>{caseData.lead_attorney.email}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}

          {/* Timeline — same design as CaseDetailsScreen Timeline tab */}
          {caseData.timeline?.length > 0 && (
            <View>
              {/* Section header card */}
              <View style={s.tlHeader}>
                <View style={s.tlHeaderIcon}>
                  <FontAwesome5 name="stream" size={14} color={C.white} />
                </View>
                <View>
                  <Text style={s.tlHeaderTitle}>Recent Activity</Text>
                  <Text style={s.tlHeaderSub}>
                    {caseData.timeline.length} {caseData.timeline.length === 1 ? 'event' : 'events'}
                  </Text>
                </View>
              </View>

              {groupByDay(caseData.timeline).map(group => (
                <View key={group.day}>
                  {/* Day separator */}
                  <View style={s.dayRow}>
                    <View style={s.dayLine} />
                    <View style={s.dayPill}>
                      <Text style={s.dayTxt}>{group.day.toUpperCase()}</Text>
                    </View>
                    <View style={s.dayLine} />
                  </View>

                  {/* Group card */}
                  <View style={s.tlGroupCard}>
                    {group.entries.map((ev, idx) => {
                      const m = TL_META(ev.action || '');
                      return (
                        <View
                          key={idx}
                          style={[s.tlEntry, idx < group.entries.length - 1 && s.tlEntryBorder]}
                        >
                          <View style={[s.tlDot, { backgroundColor: m.bg }]}>
                            <FontAwesome5 name={m.icon} size={12} color={m.color} />
                          </View>
                          <View style={s.tlEntryBody}>
                            <Text style={s.tlAction} numberOfLines={2}>{ev.action}</Text>
                            {!!ev.performed_by_name && ev.performed_by_name !== 'System' && (
                              <Text style={s.tlActor}>by {ev.performed_by_name}</Text>
                            )}
                          </View>
                          <Text style={s.tlTime}>{relativeTime(ev.created_at)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={{ height: 4 }} />
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },

  statusBanner:  { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1 },
  statusIconWrap:{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusLabel:   { fontSize: 15, fontWeight: '800' },
  progressBg:    { height: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },
  progressPct:   { fontSize: 12, fontWeight: '700', marginTop: 5 },

  card:         { backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.dark },

  infoRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  infoIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoLabel:    { fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 2 },
  infoValue:    { fontSize: 14, fontWeight: '600', color: C.dark },

  attorneyRow:   { flexDirection: 'row', alignItems: 'center' },
  attorneyAvatar:{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  attorneyName:  { fontSize: 15, fontWeight: '700', color: C.dark },
  attorneyTitle: { fontSize: 12, color: C.g400, marginTop: 2 },
  attorneyEmail: { fontSize: 12, color: C.primary, marginTop: 4 },

  // Timeline header (= tl.header from CaseDetailsScreen)
  tlHeader:      { marginBottom: 10, backgroundColor: C.primary, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tlHeaderIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  tlHeaderTitle: { fontSize: 15, fontWeight: '800', color: C.white },
  tlHeaderSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  // Day separator (= tl.dayRow)
  dayRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dayLine: { flex: 1, height: 1, backgroundColor: C.g200 },
  dayPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: C.g100, marginHorizontal: 8 },
  dayTxt:  { fontSize: 10, fontWeight: '700', color: C.g500, letterSpacing: 0.4 },

  // Group card (= tl.groupCard)
  tlGroupCard:  { marginBottom: 8, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.g100, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },

  // Entry (= tl.entryRow)
  tlEntry:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  tlEntryBorder: { borderBottomWidth: 1, borderBottomColor: C.g100 },
  tlEntryBody:   { flex: 1, marginLeft: 12, marginRight: 8 },

  // Dot (= tl.dot)
  tlDot: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Text (= tl.actionTxt / tl.actorTxt / tl.timeTxt)
  tlAction: { fontSize: 13, fontWeight: '700', color: C.dark, lineHeight: 18 },
  tlActor:  { fontSize: 11, color: C.g500, marginTop: 2 },
  tlTime:   { fontSize: 11, color: C.g400, flexShrink: 0 },
});
