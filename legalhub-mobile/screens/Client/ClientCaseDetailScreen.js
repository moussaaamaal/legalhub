import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Linking,
  Modal, Alert,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  purple50: '#FAF5FF', purple600: '#9333EA',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

const EVENT_CFG = {
  HEARING:      { label: 'Hearing',      icon: 'gavel',          color: '#1D4ED8', bg: '#DBEAFE' },
  COURT_DATE:   { label: 'Court Date',   icon: 'university',     color: '#7C3AED', bg: '#EDE9FE' },
  MEETING:      { label: 'Meeting',      icon: 'user-friends',   color: C.teal600, bg: C.teal100 },
  CONSULTATION: { label: 'Consultation', icon: 'comments',       color: '#0891B2', bg: '#CFFAFE' },
  DEADLINE:     { label: 'Deadline',     icon: 'clock',          color: C.red600,  bg: C.red100  },
  FILING:       { label: 'Filing',       icon: 'file-signature', color: C.amber600,bg: C.amber50 },
  DEPOSITION:   { label: 'Deposition',   icon: 'microphone',     color: C.purple600,bg:C.purple50},
  MEDIATION:    { label: 'Mediation',    icon: 'balance-scale',  color: C.green600,bg: C.green100},
  ARBITRATION:  { label: 'Arbitration',  icon: 'gavel',          color: '#EA580C', bg: '#FFF7ED' },
  DEFAULT:      { label: 'Event',        icon: 'calendar-alt',   color: C.primary, bg: C.blue50  },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

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
  NEW:           { label: 'New',           color: C.primary,  bg: C.blue50,   icon: 'folder-open'    },
  INVESTIGATION: { label: 'Investigation', color: C.amber600, bg: C.amber50,  icon: 'search'         },
  PRE_TRIAL:     { label: 'Pre-trial',     color: '#EA580C',  bg: '#FFF7ED',  icon: 'clock'          },
  TRIAL:         { label: 'Trial',         color: '#9333EA',  bg: '#FDF4FF',  icon: 'gavel'          },
  APPEAL:        { label: 'Appeal',        color: '#E11D48',  bg: '#FFF1F2',  icon: 'balance-scale'  },
  SETTLED:       { label: 'Settled',       color: C.green600, bg: C.green50,  icon: 'check-circle'   },
  CLOSED:        { label: 'Closed',        color: C.g500,     bg: C.g100,     icon: 'folder'         },
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
  const [caseData, setCaseData]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [docs, setDocs]               = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [events, setEvents]           = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Upload state
  const [uploadModal, setUploadModal] = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [pickedFile, setPickedFile]   = useState(null);

  const loadDocs = useCallback(() => {
    setDocsLoading(true);
    clientPortalAPI.documents(caseId)
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, [caseId]);

  useEffect(() => {
    clientPortalAPI.caseDetail(caseId)
      .then(d => setCaseData(d))
      .catch(console.error)
      .finally(() => setLoading(false));

    loadDocs();

    clientPortalAPI.appointments(caseId)
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [caseId, loadDocs]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled) setPickedFile(result.assets[0]);
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  };

  const handleUpload = async () => {
    if (!pickedFile) { Alert.alert('No file', 'Please pick a file first.'); return; }
    setUploading(true);
    try {
      await clientPortalAPI.uploadDocument(caseId, pickedFile);
      setUploadModal(false);
      setPickedFile(null);
      Alert.alert('Uploaded', 'Your document has been submitted for review.');
      loadDocs();
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Could not upload the file.');
    } finally {
      setUploading(false);
    }
  };

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

          {/* Legal Team */}
          {(caseData.team?.length > 0 || caseData.lead_attorney) && (() => {
            const members = caseData.team?.length > 0
              ? caseData.team
              : [{ ...caseData.lead_attorney, is_lead: true }];
            return (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.cardIconWrap}>
                    <FontAwesome5 name="users" size={14} color={C.primary} />
                  </View>
                  <Text style={s.cardTitle}>Legal Team</Text>
                  <View style={s.docsBadge}>
                    <Text style={s.docsBadgeTxt}>{members.length}</Text>
                  </View>
                </View>

                {members.map((m, idx) => {
                  const initials = (m.full_name || '?')
                    .split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
                  const COLORS = [C.primary, '#9333EA', '#0D9488', '#D97706', '#E11D48'];
                  const avatarColor = COLORS[Math.abs(((m.full_name || '').charCodeAt(0) || 65) - 65) % COLORS.length];
                  return (
                    <View
                      key={m.user_id || idx}
                      style={[s.teamRow, idx < members.length - 1 && s.teamRowBorder]}
                    >
                      {m.avatar_url ? (
                        <Image source={{ uri: m.avatar_url }} style={s.teamAvatar} />
                      ) : (
                        <View style={[s.teamAvatarFallback, { backgroundColor: avatarColor }]}>
                          <Text style={s.teamAvatarInitials}>{initials}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={s.teamName}>{m.full_name || 'Attorney'}</Text>
                          {m.is_lead && (
                            <View style={s.leadBadge}>
                              <Text style={s.leadBadgeTxt}>Lead</Text>
                            </View>
                          )}
                        </View>
                        {!!m.title && <Text style={s.teamTitle}>{m.title}</Text>}
                        {!!m.email && (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`mailto:${m.email}`).catch(() => {})}
                            activeOpacity={0.7}
                          >
                            <Text style={s.teamEmail}>{m.email}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* Calendar Events */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <FontAwesome5 name="calendar-alt" size={14} color={C.primary} />
              </View>
              <Text style={s.cardTitle}>Case Events</Text>
              {!eventsLoading && (
                <View style={s.docsBadge}>
                  <Text style={s.docsBadgeTxt}>{events.length}</Text>
                </View>
              )}
            </View>

            {eventsLoading ? (
              <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 12 }} />
            ) : events.length === 0 ? (
              <View style={s.docsEmpty}>
                <FontAwesome5 name="calendar-times" size={22} color={C.g400} />
                <Text style={s.docsEmptyTxt}>No events scheduled</Text>
              </View>
            ) : (() => {
              const now = new Date();
              const upcoming = events.filter(e => !e.start_time || new Date(e.start_time) >= now);
              const past     = events.filter(e =>  e.start_time  && new Date(e.start_time) <  now);
              const renderEvent = (ev, idx, arr) => {
                const cfg   = EVENT_CFG[ev.meeting_type] || EVENT_CFG.DEFAULT;
                const start = ev.start_time ? new Date(ev.start_time) : null;
                const isPast = start && start < now;
                return (
                  <View key={ev.id} style={[s.evRow, idx < arr.length - 1 && s.evRowBorder, isPast && { opacity: 0.6 }]}>
                    {start ? (
                      <View style={[s.evDateBox, { backgroundColor: isPast ? C.g100 : C.blue50 }]}>
                        <Text style={[s.evDay,   { color: isPast ? C.g400 : C.primary }]}>{start.getDate()}</Text>
                        <Text style={[s.evMonth, { color: isPast ? C.g400 : C.secondary }]}>{MONTHS[start.getMonth()]}</Text>
                        <Text style={[s.evWeekday,{ color: isPast ? C.g400 : C.g500 }]}>{DAYS[start.getDay()]}</Text>
                      </View>
                    ) : (
                      <View style={[s.evDateBox, { backgroundColor: C.g100, justifyContent: 'center' }]}>
                        <FontAwesome5 name="calendar" size={18} color={C.g400} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.evTitle} numberOfLines={1}>{ev.title || 'Event'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <View style={[s.evTypePill, { backgroundColor: cfg.bg }]}>
                          <FontAwesome5 name={cfg.icon} size={9} color={cfg.color} />
                          <Text style={[s.evTypeTxt, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {start && (
                          <Text style={s.evTime}>{fmtTime(ev.start_time)}</Text>
                        )}
                        {ev.is_video_call && (
                          <View style={s.evVideoPill}>
                            <FontAwesome5 name="video" size={9} color={C.green600} />
                            <Text style={[s.evTypeTxt, { color: C.green600 }]}>Video</Text>
                          </View>
                        )}
                      </View>
                      {!!ev.location && (
                        <Text style={s.evLocation} numberOfLines={1}>
                          <FontAwesome5 name="map-marker-alt" size={9} color={C.g400} />  {ev.location}
                        </Text>
                      )}
                    </View>
                    {ev.is_video_call && ev.meeting_link && !isPast && (
                      <TouchableOpacity
                        style={s.joinBtn}
                        onPress={() => Linking.openURL(ev.meeting_link).catch(() => {})}
                        activeOpacity={0.8}
                      >
                        <FontAwesome5 name="video" size={10} color={C.white} />
                        <Text style={s.joinBtnTxt}>Join</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              };
              return (
                <>
                  {upcoming.length > 0 && (
                    <>
                      <Text style={s.evGroupLabel}>Upcoming</Text>
                      {upcoming.map((ev, i) => renderEvent(ev, i, upcoming))}
                    </>
                  )}
                  {past.length > 0 && (
                    <>
                      <Text style={[s.evGroupLabel, { color: C.g400, marginTop: upcoming.length > 0 ? 12 : 0 }]}>Past</Text>
                      {past.map((ev, i) => renderEvent(ev, i, past))}
                    </>
                  )}
                </>
              );
            })()}
          </View>

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

          {/* Shared Documents */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <FontAwesome5 name="folder-open" size={14} color={C.primary} />
              </View>
              <Text style={s.cardTitle}>Documents</Text>
              {!docsLoading && (
                <View style={s.docsBadge}>
                  <Text style={s.docsBadgeTxt}>{docs.length}</Text>
                </View>
              )}
              <TouchableOpacity
                style={s.uploadIconBtn}
                onPress={() => { setPickedFile(null); setUploadModal(true); }}
                activeOpacity={0.8}
              >
                <FontAwesome5 name="cloud-upload-alt" size={13} color={C.primary} />
                <Text style={s.uploadIconTxt}>Upload</Text>
              </TouchableOpacity>
            </View>

            {docsLoading ? (
              <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 12 }} />
            ) : docs.length === 0 ? (
              <View style={s.docsEmpty}>
                <FontAwesome5 name="folder-open" size={22} color={C.g400} />
                <Text style={s.docsEmptyTxt}>No documents shared yet</Text>
              </View>
            ) : (
              [...docs]
                .sort((a, b) => (a.status === 'REJECTED' ? 1 : 0) - (b.status === 'REJECTED' ? 1 : 0))
                .map((doc, idx, arr) => {
                  const isClientDoc = doc.category === 'CLIENT_DOC';
                  const isRejected  = isClientDoc && doc.status === 'REJECTED';
                  const isApproved  = isClientDoc && doc.status === 'APPROVED';
                  const isPending   = isClientDoc && doc.status === 'PENDING_REVIEW';

                  const ext      = (doc.file_name || '').split('.').pop().toLowerCase();
                  const isPdf    = ext === 'pdf';
                  const isImg    = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                  const docIcon  = isPdf ? 'file-pdf' : isImg ? 'file-image' : ext === 'docx' || ext === 'doc' ? 'file-word' : 'file-alt';
                  const docColor = isRejected ? '#9CA3AF' : isPdf ? '#DC2626' : isImg ? '#D97706' : ext === 'docx' || ext === 'doc' ? '#1D4ED8' : C.primary;
                  const docBg    = isRejected ? '#F3F4F6' : isPdf ? '#FEE2E2' : isImg ? '#FEF3C7' : ext === 'docx' || ext === 'doc' ? '#DBEAFE' : C.blue50;
                  const fmtSize  = doc.file_size_mb ? `${parseFloat(doc.file_size_mb).toFixed(1)} MB` : '';
                  const fmtDate  = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                  const uploader = doc.uploader_name || null;
                  const initials = uploader ? uploader.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() : '?';

                  const statusCfg = isApproved
                    ? { label: 'Approved',     icon: 'check-circle', color: '#16A34A', bg: '#DCFCE7' }
                    : isPending
                    ? { label: 'Under Review', icon: 'clock',        color: '#D97706', bg: '#FEF3C7' }
                    : isRejected
                    ? { label: 'Rejected',     icon: 'times-circle', color: '#9CA3AF', bg: '#F3F4F6' }
                    : null;

                  return (
                    <View key={doc.id} style={[
                      s.docCard,
                      idx < arr.length - 1 && s.docCardBorder,
                      isRejected && s.docCardRejected,
                    ]}>
                      {/* Uploader row */}
                      {uploader && (
                        <View style={s.docUploaderRow}>
                          {doc.uploader_avatar_url ? (
                            <Image source={{ uri: doc.uploader_avatar_url }} style={s.docUploaderAvatar} />
                          ) : (
                            <View style={[s.docUploaderAvatarFallback, { backgroundColor: docColor }]}>
                              <Text style={s.docUploaderInitials}>{initials}</Text>
                            </View>
                          )}
                          <Text style={s.docUploaderName} numberOfLines={1}>{uploader}</Text>
                        </View>
                      )}
                      {/* File row */}
                      <View style={s.docRow}>
                        <View style={[s.docIcon, { backgroundColor: docBg }]}>
                          <FontAwesome5 name={docIcon} size={16} color={docColor} />
                        </View>
                        <View style={s.docMeta}>
                          <Text style={[s.docName, isRejected && s.docNameRejected]} numberOfLines={1}>{doc.file_name || 'Document'}</Text>
                          <Text style={s.docSub}>{[fmtSize, fmtDate].filter(Boolean).join(' · ')}</Text>
                          {/* Status badge — only for client-uploaded documents */}
                          {doc.category === 'CLIENT_DOC' && statusCfg && (
                            <View style={[s.docStatusBadge, { backgroundColor: statusCfg.bg }]}>
                              <FontAwesome5 name={statusCfg.icon} size={9} color={statusCfg.color} />
                              <Text style={[s.docStatusTxt, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                            </View>
                          )}
                        </View>
                        {doc.storage_url && !isRejected ? (
                          <TouchableOpacity
                            style={[s.docViewBtn, isApproved && { backgroundColor: '#16A34A' }]}
                            onPress={() => Linking.openURL(doc.storage_url)}
                          >
                            <FontAwesome5 name="external-link-alt" size={11} color={C.white} />
                            <Text style={s.docViewTxt}>View</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        </ScrollView>
      )}
      {/* Upload Document Modal */}
      <Modal visible={uploadModal} animationType="slide" transparent onRequestClose={() => setUploadModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setUploadModal(false)} style={s.modalClose}>
                <Ionicons name="close" size={20} color={C.g500} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalHint}>
              Submit a document for this case. Your attorney will review it.
            </Text>

            <TouchableOpacity style={s.pickBtn} onPress={handlePickFile} activeOpacity={0.8}>
              <FontAwesome5 name="paperclip" size={15} color={pickedFile ? C.green600 : C.primary} />
              <Text style={[s.pickBtnTxt, pickedFile && { color: C.green600 }]} numberOfLines={1}>
                {pickedFile ? pickedFile.name : 'Choose a file…'}
              </Text>
              {pickedFile && <FontAwesome5 name="check-circle" size={14} color={C.green600} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.submitBtn, (!pickedFile || uploading) && { opacity: 0.5 }]}
              onPress={handleUpload}
              disabled={!pickedFile || uploading}
              activeOpacity={0.85}
            >
              {uploading
                ? <ActivityIndicator size="small" color={C.white} />
                : <FontAwesome5 name="cloud-upload-alt" size={15} color={C.white} />
              }
              <Text style={s.submitBtnTxt}>{uploading ? 'Uploading…' : 'Submit Document'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  teamRow:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  teamRowBorder:       { borderBottomWidth: 1, borderBottomColor: C.g100 },
  teamAvatar:          { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.blue100 },
  teamAvatarFallback:  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  teamAvatarInitials:  { color: C.white, fontSize: 17, fontWeight: '800' },
  teamName:            { fontSize: 14, fontWeight: '700', color: C.dark },
  teamTitle:           { fontSize: 11, color: C.g500, marginTop: 2 },
  teamEmail:           { fontSize: 11, color: C.primary, marginTop: 3 },
  leadBadge:           { backgroundColor: C.blue50, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  leadBadgeTxt:        { fontSize: 10, fontWeight: '800', color: C.primary },

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

  // Documents section
  docsBadge:    { marginLeft: 'auto', minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  docsBadgeTxt: { fontSize: 11, fontWeight: '800', color: C.primary },
  docsEmpty:    { alignItems: 'center', paddingVertical: 20, gap: 8 },
  docsEmptyTxt: { fontSize: 13, color: C.g400, fontWeight: '600' },
  docCard:                   { borderRadius: 12, overflow: 'hidden' },
  docCardBorder:             { borderBottomWidth: 1, borderBottomColor: C.g100 },
  docCardRejected:           { backgroundColor: '#F8F8F8', opacity: 0.7 },
  docNameRejected:           { color: C.g400, textDecorationLine: 'line-through' },
  docStatusBadge:            { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 5 },
  docStatusTxt:              { fontSize: 11, fontWeight: '700' },
  docUploaderRow:            { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingTop: 10, paddingBottom: 6 },
  docUploaderAvatar:         { width: 24, height: 24, borderRadius: 12 },
  docUploaderAvatarFallback: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docUploaderInitials:       { fontSize: 9, fontWeight: '800', color: C.white },
  docUploaderName:           { fontSize: 11, fontWeight: '700', color: C.g600, flex: 1 },
  docRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  docIcon:      { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  docMeta:      { flex: 1, marginLeft: 12, marginRight: 8 },
  docName:      { fontSize: 13, fontWeight: '700', color: C.dark },
  docSub:       { fontSize: 11, color: C.g400, marginTop: 2 },
  docViewBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexShrink: 0 },
  docViewTxt:   { fontSize: 11, fontWeight: '700', color: C.white },

  uploadIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', backgroundColor: C.blue50, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  uploadIconTxt: { fontSize: 12, fontWeight: '700', color: C.primary },

  // Events
  evGroupLabel: { fontSize: 11, fontWeight: '700', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  evRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  evRowBorder:  { borderBottomWidth: 1, borderBottomColor: C.g100 },
  evDateBox:    { width: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  evDay:        { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  evMonth:      { fontSize: 11, fontWeight: '700', marginTop: 1 },
  evWeekday:    { fontSize: 10, fontWeight: '600', marginTop: 1 },
  evTitle:      { fontSize: 13, fontWeight: '700', color: C.dark },
  evTypePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  evTypeTxt:    { fontSize: 10, fontWeight: '700' },
  evVideoPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: C.green100 },
  evTime:       { fontSize: 11, color: C.g500, fontWeight: '600' },
  evLocation:   { fontSize: 11, color: C.g400, marginTop: 4 },
  joinBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.green600, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexShrink: 0 },
  joinBtnTxt:   { fontSize: 11, fontWeight: '700', color: C.white },

  // Upload modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.g200, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle:   { fontSize: 17, fontWeight: '800', color: C.dark },
  modalClose:   { width: 34, height: 34, borderRadius: 17, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  modalHint:    { fontSize: 13, color: C.g500, marginBottom: 20, lineHeight: 18 },
  pickBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g200, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 },
  pickBtnTxt:   { flex: 1, fontSize: 14, color: C.dark, fontWeight: '500' },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, marginBottom: 8 },
  submitBtnTxt: { fontSize: 15, fontWeight: '800', color: C.white },
});
