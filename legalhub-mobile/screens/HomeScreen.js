import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Image, StyleSheet, SafeAreaView, StatusBar, Dimensions,
  Linking, Alert, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { FontAwesome5, Ionicons, MaterialIcons, Feather, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppPrefs } from '../context/AppPrefsContext';
import MarkdownText from '../components/MarkdownText';
import {
  dashboardAPI, notificationsAPI,
  tasksAPI, documentsAPI, casesAPI,
} from '../services/api';

import AddCaseScreen              from './Cases/AddCaseScreen';
import CaseDetailsScreen          from './Cases/CaseDetailsScreen';
import AddClientScreen            from './Clients/AddClientScreen';
import ClientDetailsScreen        from './Clients/ClientDetailsScreen';
import UploadDocumentScreen       from './Documents/UploadDocumentScreen';
import AddNoteScreen              from './TasksNotes/AddNoteScreen';
import AIAssistantScreen          from './AI/AIAssistantScreen';
import ScheduleScreen             from './Schedule/ScheduleScreen';
import InvoiceScreen              from './Invoices/InvoiceScreen';
import VoiceNoteScreen            from './TasksNotes/VoiceNoteScreen';
import AddTaskScreen              from './TasksNotes/AddTaskScreen';
import NotificationsScreen        from './Notifications/NotificationsScreen';
import InvoicesManagementScreen   from './Invoices/InvoicesManagementScreen';
import InvoiceDetailsScreen       from './Invoices/InvoiceDetailsScreen';
import ClientsManagementScreen    from './Clients/ClientsManagementScreen';
import TasksNotesManagementScreen from './TasksNotes/TasksNotesManagementScreen';
import AllScheduleScreen          from './Schedule/AllScheduleScreen';
import AllCasesScreen             from './Cases/AllCasesScreen';
import AllTasksScreen             from './TasksNotes/AllTasksScreen';
import AllDocumentsScreen         from './Documents/AllDocumentsScreen';

// ─── COULEURS ────────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#1E40AF', secondary: '#3B82F6', accent: '#60A5FA',
  dark: '#1E293B', light: '#F8FAFC', white: '#FFFFFF',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray300: '#D1D5DB', gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563', gray700: '#374151',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber500: '#F59E0B', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green500: '#22C55E', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple500: '#A855F7', purple600: '#9333EA',
  indigo600: '#4F46E5', teal500: '#14B8A6', teal600: '#0D9488',
  pink500: '#EC4899', orange50: '#FFF7ED', orange600: '#EA580C',
};

const W = Dimensions.get('window').width;

// ─── TIMEZONE HELPERS ────────────────────────────────────────────────────────
const APP_TZ_OFFSET_H = 0; // no UTC conversion — display exactly as stored

const parseDate = (iso) => {
  if (!iso) return new Date(NaN);
  const s = iso.trim().replace(' ', 'T');
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const baseMs = new Date(m[1] + 'Z').getTime();
    const sign   = m[2] === '+' ? -1 : 1;
    const offMs  = (parseInt(m[3]) * 60 + parseInt(m[4])) * 60000;
    return new Date(baseMs + sign * offMs);
  }
  if (s.endsWith('Z')) return new Date(s);
  return new Date(s + 'Z');
};

const localH = (d) => (d.getUTCHours() + APP_TZ_OFFSET_H) % 24;
const localM = (d) => d.getUTCMinutes();

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const getDocIconStyle = (fileType) => {
  if (!fileType) return { iconName: 'file-alt',   iconColor: COLORS.gray600,   iconBg: COLORS.gray100   };
  const t = fileType.toLowerCase();
  if (t.includes('pdf'))                    return { iconName: 'file-pdf',   iconColor: COLORS.red600,    iconBg: COLORS.red100    };
  if (t.includes('doc') || t.includes('word'))  return { iconName: 'file-word',  iconColor: COLORS.blue600,   iconBg: COLORS.blue100   };
  if (t.includes('xls') || t.includes('excel')) return { iconName: 'file-excel', iconColor: COLORS.green600,  iconBg: COLORS.green100  };
  if (t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('image'))
    return { iconName: 'file-image', iconColor: COLORS.purple600, iconBg: COLORS.purple100 };
  return { iconName: 'file-alt', iconColor: COLORS.gray600, iconBg: COLORS.gray100 };
};

const formatRelativeDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const today = new Date();
  const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const TASK_PRIORITY = {
  URGENT: { label: 'Urgent', color: COLORS.red600,   bg: COLORS.red50   },
  HIGH:   { label: 'High',   color: COLORS.red600,   bg: COLORS.red50   },
  MEDIUM: { label: 'Medium', color: COLORS.amber600, bg: COLORS.amber50 },
  NORMAL: { label: 'Normal', color: COLORS.green600, bg: COLORS.green50 },
  LOW:    { label: 'Low',    color: COLORS.green600, bg: COLORS.green50 },
};

const getDueBadge = (dueDate, priority) => {
  if (!dueDate) {
    return {
      badge: 'Pending', badgeColor: COLORS.amber600, badgeBg: COLORS.amber50,
      borderColor: COLORS.amber500, timeColor: COLORS.amber600,
    };
  }
  const today = new Date().toISOString().split('T')[0];
  if (dueDate < today)   return { badge: 'Overdue',   badgeColor: COLORS.red600,   badgeBg: COLORS.red50,   borderColor: COLORS.red500,   timeColor: COLORS.red600   };
  if (dueDate === today) return { badge: 'Due Today',  badgeColor: COLORS.red600,   badgeBg: COLORS.red50,   borderColor: COLORS.red500,   timeColor: COLORS.red600   };
  if (priority === 'URGENT' || priority === 'HIGH')
    return { badge: 'Urgent', badgeColor: COLORS.red600, badgeBg: COLORS.red50, borderColor: COLORS.red500, timeColor: COLORS.red600 };
  return { badge: 'Pending', badgeColor: COLORS.amber600, badgeBg: COLORS.amber50, borderColor: COLORS.amber500, timeColor: COLORS.amber600 };
};

// ─── COMPOSANT ICÔNE ─────────────────────────────────────────────────────────
const Icon = ({ lib = 'FA5', name, size = 18, color = COLORS.dark }) => {
  switch (lib) {
    case 'FA5': return <FontAwesome5  name={name} size={size} color={color} />;
    case 'FA':  return <FontAwesome   name={name} size={size} color={color} />;
    case 'ION': return <Ionicons      name={name} size={size} color={color} />;
    case 'MAT': return <MaterialIcons name={name} size={size} color={color} />;
    case 'FTH': return <Feather       name={name} size={size} color={color} />;
    default:    return null;
  }
};

// ─── SCHEDULE : CONFIG PRIORITÉ ──────────────────────────────────────────────
const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent',        color: COLORS.red600,   bg: COLORS.red50,   border: COLORS.red500,   timeBg: COLORS.red100   },
  high:   { label: 'High Priority', color: COLORS.amber600, bg: COLORS.amber50, border: COLORS.amber500, timeBg: COLORS.amber100 },
  medium: { label: 'Medium',        color: COLORS.blue600,  bg: COLORS.blue50,  border: COLORS.secondary,timeBg: COLORS.blue100  },
  normal: { label: 'Normal',        color: COLORS.green600, bg: COLORS.green50, border: COLORS.green600, timeBg: COLORS.green100 },
};

// ─── SCHEDULE : GÉNÉRATEUR D'ACTIONS ─────────────────────────────────────────
const getEventActions = (event, navigateTo) => {
  const actions = [];
  const { type, client, location, meeting_link, case_id } = event;

  if (client?.phone) {
    actions.push({
      key: 'call', iconLib: 'FA5', iconName: 'phone',
      bg: COLORS.blue50, color: COLORS.primary,
      onPress: () => Linking.canOpenURL(`tel:${client.phone}`).then(ok => {
        if (ok) Linking.openURL(`tel:${client.phone}`);
        else Alert.alert('Erreur', "Impossible d'ouvrir le téléphone");
      }),
    });
    actions.push({
      key: 'whatsapp', iconLib: 'FA', iconName: 'whatsapp',
      bg: COLORS.green50, color: COLORS.green600,
      onPress: () => {
        const phone = client.phone.replace(/\D/g, '');
        Linking.canOpenURL(`whatsapp://send?phone=${phone}`).then(ok => {
          if (ok) Linking.openURL(`whatsapp://send?phone=${phone}`);
          else Alert.alert('WhatsApp non installé', 'Veuillez installer WhatsApp');
        });
      },
    });
  }
  if (client?.email) {
    actions.push({
      key: 'email', iconLib: 'FA5', iconName: 'envelope',
      bg: COLORS.purple50, color: COLORS.purple600,
      onPress: () => Linking.openURL(`mailto:${client.email}`),
    });
  }
  switch (type) {
    case 'court_hearing':
      if (location) actions.push({
        key: 'map', iconLib: 'FA5', iconName: 'map-marker-alt',
        bg: COLORS.blue50, color: COLORS.primary,
        onPress: () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(location)}`),
      });
      break;
    case 'internal_meeting':
      if (meeting_link) actions.push({
        key: 'video', iconLib: 'FA5', iconName: 'video',
        bg: COLORS.purple50, color: COLORS.purple600,
        onPress: () => Linking.openURL(meeting_link),
      });
      break;
    case 'deadline':
    case 'document_submission':
      if (case_id && navigateTo) actions.push({
        key: 'documents', iconLib: 'FA5', iconName: 'file-pdf',
        bg: COLORS.green50, color: COLORS.green600,
        onPress: () => navigateTo('CaseDocuments', { caseId: case_id }),
      });
      break;
    default: break;
  }
  return actions;
};

// ─── STATIC FALLBACK (réseau indisponible uniquement) ────────────────────────
const STATS_FALLBACK = [
  { iconLib: 'FA5', iconName: 'briefcase',          iconColor: COLORS.primary,   count: '—', label: 'Active Cases',  badge: '—', badgeColor: COLORS.gray500,  badgeBg: COLORS.gray100, iconBg: COLORS.blue100   },
  { iconLib: 'FA5', iconName: 'gavel',              iconColor: COLORS.purple600, count: '—', label: 'Hearings',      badge: '—', badgeColor: COLORS.gray500,  badgeBg: COLORS.gray100, iconBg: COLORS.purple100 },
  { iconLib: 'FA5', iconName: 'tasks',              iconColor: COLORS.amber600,  count: '—', label: 'Pending Tasks', badge: '—', badgeColor: COLORS.gray500,  badgeBg: COLORS.gray100, iconBg: COLORS.amber100  },
  { iconLib: 'FA5', iconName: 'check-circle',       iconColor: COLORS.green600,  count: '—', label: 'Closed Cases',  badge: '—', badgeColor: COLORS.gray500,  badgeBg: COLORS.gray100, iconBg: COLORS.green100  },
];

// ─── COMPOSANTS ──────────────────────────────────────────────────────────────
const SectionHeader = ({ title, action, onAction }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity>}
  </View>
);

const EmptyState = ({ icon, lib = 'FA5', text }) => (
  <View style={styles.emptyState}>
    <Icon lib={lib} name={icon} size={32} color={COLORS.gray400} />
    <Text style={styles.emptyStateText}>{text}</Text>
  </View>
);

const StatCard = ({ item }) => (
  <View style={styles.statCard}>
    <View style={styles.statTop}>
      <View style={[styles.statIconWrap, { backgroundColor: item.iconBg }]}>
        <Icon lib={item.iconLib} name={item.iconName} size={18} color={item.iconColor} />
      </View>
      <View style={[styles.statBadge, { backgroundColor: item.badgeBg }]}>
        <Text style={[styles.statBadgeText, { color: item.badgeColor }]}>{item.badge}</Text>
      </View>
    </View>
    <Text style={styles.statCount}>{item.count}</Text>
    <Text style={styles.statLabel}>{item.label}</Text>
  </View>
);

const ManagementCard = ({ item, onPress }) => (
  <TouchableOpacity style={[styles.mgmtCard, { backgroundColor: item.bg }]} onPress={() => onPress(item.screen)} activeOpacity={0.85}>
    <View style={[styles.mgmtIconCircle, { backgroundColor: item.accent }]}>
      <Icon lib={item.iconLib} name={item.icon} size={26} color={item.color} />
    </View>
    <Text style={[styles.mgmtLabel, { color: item.color }]}>{item.label}</Text>
    <Text style={styles.mgmtSublabel}>{item.sublabel}</Text>
    <View style={[styles.mgmtBadge, { backgroundColor: item.badgeBg }]}>
      <Text style={[styles.mgmtBadgeText, { color: item.badgeColor }]}>
        {item.badge}{item.badgeLabel ? ` ${item.badgeLabel}` : ''}
      </Text>
    </View>
    <View style={[styles.mgmtArrow, { backgroundColor: item.accent }]}>
      <FontAwesome5 name="arrow-right" size={9} color={item.color} />
    </View>
  </TouchableOpacity>
);

const EVENT_TYPE_META = {
  court_hearing:       { icon: 'gavel',          color: COLORS.red600,    timeBg: COLORS.red100    },
  hearing:             { icon: 'gavel',          color: COLORS.red600,    timeBg: COLORS.red100    },
  court_date:          { icon: 'landmark',       color: COLORS.purple600, timeBg: COLORS.purple100 },
  meeting:             { icon: 'handshake',      color: COLORS.amber600,  timeBg: COLORS.amber100  },
  client_meeting:      { icon: 'handshake',      color: COLORS.amber600,  timeBg: COLORS.amber100  },
  internal_meeting:    { icon: 'users',          color: COLORS.amber600,  timeBg: COLORS.amber100  },
  consultation:        { icon: 'comments',       color: COLORS.green600,  timeBg: COLORS.green100  },
  deadline:            { icon: 'clock',          color: COLORS.blue600,   timeBg: COLORS.blue100   },
  filing:              { icon: 'file-signature', color: COLORS.amber600,  timeBg: COLORS.amber100  },
  document_submission: { icon: 'file-upload',    color: COLORS.amber600,  timeBg: COLORS.amber100  },
  mediation:           { icon: 'balance-scale',  color: COLORS.green600,  timeBg: COLORS.green100  },
  arbitration:         { icon: 'balance-scale',  color: COLORS.purple600, timeBg: COLORS.purple100 },
  deposition:          { icon: 'microphone',     color: COLORS.red600,    timeBg: COLORS.red100    },
};
const EV_DEFAULT_META = { icon: 'calendar-alt', color: COLORS.primary, timeBg: COLORS.blue100 };

const ScheduleCard = ({ event, navigateTo }) => {
  const evMeta  = EVENT_TYPE_META[event.type] ?? EV_DEFAULT_META;
  const actions = getEventActions(event, navigateTo);

  return (
    <View style={ev.card}>
      {/* ── Header coloré ── */}
      <View style={[ev.header, { backgroundColor: evMeta.timeBg }]}>
        <View style={ev.headerLeft}>
          <View style={[ev.iconCircle, { backgroundColor: evMeta.color + '22' }]}>
            <FontAwesome5 name={evMeta.icon} size={13} color={evMeta.color} />
          </View>
          <Text style={[ev.timeText, { color: evMeta.color }]}>
            {event.time} <Text style={ev.timePeriod}>{event.period}</Text>
          </Text>
        </View>
        <View style={[ev.typePill, { backgroundColor: evMeta.color + '18', borderColor: evMeta.color + '40' }]}>
          <Text style={[ev.typePillText, { color: evMeta.color }]} numberOfLines={1}>
            {(event.tag || event.type || 'event').replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      {/* ── Corps ── */}
      <View style={ev.body}>
        <Text style={ev.title} numberOfLines={1}>{event.title}</Text>
        {event.subtitle ? (
          <View style={[styles.row, { marginTop: 4 }]}>
            <FontAwesome5 name="map-marker-alt" size={10} color={COLORS.gray400} />
            <Text style={ev.subText} numberOfLines={1}> {event.subtitle}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Footer ── */}
      <View style={ev.footer}>
        <View style={[styles.row, { flex: 1 }]}>
          <View style={ev.clientChip}>
            <FontAwesome5 name="user-circle" size={12} color={COLORS.gray400} />
            <Text style={ev.clientChipText} numberOfLines={1}>
              {event.client?.name || 'No client'}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          {actions.slice(0, 3).map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[ev.actionBtn, { backgroundColor: a.bg, marginLeft: 6 }]}
              onPress={a.onPress}
              activeOpacity={0.7}
            >
              <Icon lib={a.iconLib} name={a.iconName} size={13} color={a.color} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const CaseCard = ({ item, onViewDetails }) => (
  <TouchableOpacity
    style={cc.card}
    onPress={() => onViewDetails && onViewDetails(item)}
    activeOpacity={0.82}
  >
    {/* Bande colorée à gauche */}
    <View style={[cc.accent, { backgroundColor: item.badgeColor }]} />

    <View style={cc.content}>
      {/* ── Ligne 1 : badge priorité ── */}
      <View style={cc.topRow}>
        <View style={[cc.priorityBadge, { backgroundColor: item.badgeBg }]}>
          <View style={[cc.priorityDot, { backgroundColor: item.badgeColor }]} />
          <Text style={[cc.priorityText, { color: item.badgeColor }]}>{item.badge}</Text>
        </View>
      </View>

      {/* ── Ligne 2 : titre ── */}
      <Text style={cc.title} numberOfLines={2}>{item.title}</Text>

      {/* ── Ligne 3 : avatar + client + type ── */}
      <View style={cc.metaRow}>
        {item.client?.avatar ? (
          <Image source={{ uri: item.client.avatar }} style={cc.avatar} />
        ) : (
          <View style={[cc.avatar, cc.avatarFallback]}>
            <FontAwesome5 name="user" size={9} color={COLORS.primary} />
          </View>
        )}
        <Text style={cc.clientName} numberOfLines={1}>
          {item.client?.name || 'No client'}
        </Text>
        {item.type ? (
          <>
            <View style={cc.dot} />
            <Text style={cc.typeText} numberOfLines={1}>{item.type}</Text>
          </>
        ) : null}
      </View>

      {/* ── Ligne 4 : statut + date + flèche ── */}
      <View style={cc.footer}>
        <View style={[cc.statusChip, { backgroundColor: COLORS.blue50 }]}>
          <Text style={[cc.statusText, { color: COLORS.primary }]}>{item.col1Val}</Text>
        </View>
        <Text style={cc.updatedText}>Updated {item.col3Val}</Text>
        <FontAwesome5 name="chevron-right" size={11} color={COLORS.gray400} style={{ marginLeft: 'auto' }} />
      </View>
    </View>
  </TouchableOpacity>
);

const TaskCard = ({ item, onDone }) => (
  <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: item.borderColor }]}>
    <View style={styles.row}>
      <TouchableOpacity style={styles.checkbox} onPress={() => onDone && onDone(item.id)} />
      <View style={{ flex: 1 }}>
        {/* Titre + badge priorité */}
        <View style={[styles.row, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }]}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{item.title}</Text>
          <View style={[styles.tag, { backgroundColor: item.prioBg }]}>
            <Text style={[styles.tagText, { color: item.prioColor }]}>{item.prioLabel}</Text>
          </View>
        </View>
        {/* Description */}
        {item.description ? (
          <Text style={[styles.cardSubtitle, { marginBottom: 6 }]} numberOfLines={2}>{item.description}</Text>
        ) : null}
        {/* Dossier */}
        {item.caseName ? (
          <View style={[styles.row, { marginBottom: 3 }]}>
            <Icon lib="FA5" name="briefcase" size={10} color={COLORS.gray400} />
            <Text style={[styles.gray500Sm, { marginLeft: 5 }]} numberOfLines={1}>{item.caseName}</Text>
          </View>
        ) : null}
        {/* Avocat + échéance */}
        <View style={styles.row}>
          {item.lawyerName ? (
            <>
              <Icon lib="FA5" name="user-tie" size={10} color={COLORS.gray400} />
              <Text style={[styles.gray500Sm, { marginLeft: 5, flex: 1 }]} numberOfLines={1}>{item.lawyerName}</Text>
            </>
          ) : <View style={{ flex: 1 }} />}
          {item.timeLeft && (
            <View style={styles.row}>
              <Icon lib="FA5" name="clock" size={10} color={item.timeColor} />
              <Text style={[styles.gray500Sm, { color: item.timeColor, fontWeight: '600', marginLeft: 4 }]}>{item.timeLeft}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  </View>
);

const DocumentCard = ({ item }) => {
  const [summarizing,  setSummarizing]  = React.useState(false);
  const [summaryModal, setSummaryModal] = React.useState(null);

  if (!item.action) return null;

  const handleView = () => {
    if (!item.fileUrl) { Alert.alert('Unavailable', 'No file URL for this document.'); return; }
    Linking.openURL(item.fileUrl).catch(() => Alert.alert('Error', 'Could not open the document.'));
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const result = await documentsAPI.summarize(item.id);
      setSummaryModal({ docName: item.name, summary: result.summary });
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not generate summary.');
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Summary Modal */}
      <Modal visible={!!summaryModal} transparent animationType="slide" onRequestClose={() => setSummaryModal(null)}>
        <View style={dcs.modalOverlay}>
          <View style={dcs.summarySheet}>
            <View style={dcs.summaryHandle} />
            <View style={dcs.summaryHeader}>
              <View style={dcs.summaryIconWrap}>
                <Icon lib="FA5" name="robot" size={18} color="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dcs.summaryTitle}>AI Summary</Text>
                {summaryModal?.docName ? (
                  <Text style={dcs.summaryDocName} numberOfLines={1}>{summaryModal.docName}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setSummaryModal(null)} style={{ padding: 4 }}>
                <Icon lib="FA5" name="times" size={16} color={COLORS.gray400} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <MarkdownText text={summaryModal?.summary || ''} style={dcs.summaryBody} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.row}>
        <View style={[styles.docIcon, { backgroundColor: item.iconBg }]}>
          <Icon lib={item.iconLib} name={item.iconName} size={22} color={item.iconColor} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.cardTitle, { marginBottom: 2 }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardSubtitle, { marginBottom: 8 }]}>{item.case}</Text>
          <View style={styles.row}>
            {item.size ? <Text style={styles.gray500Sm}>{item.size}</Text> : null}
            {item.size && item.date ? <Text style={[styles.gray500Sm, { marginHorizontal: 6 }]}>•</Text> : null}
            {item.date ? <Text style={styles.gray500Sm}>{item.date}</Text> : null}
            <View style={[styles.row, { marginLeft: 'auto', gap: 6 }]}>
              {!item.isImage && (
                <TouchableOpacity
                  style={[styles.tagBtn, { backgroundColor: '#EEF2FF' }, summarizing && { opacity: 0.6 }]}
                  onPress={handleSummarize}
                  disabled={summarizing}
                  activeOpacity={0.7}
                >
                  <View style={styles.row}>
                    {summarizing
                      ? <ActivityIndicator size={11} color="#6366F1" />
                      : <Icon lib="FA5" name="robot" size={11} color="#6366F1" />}
                    <Text style={[styles.tagText, { color: '#6366F1', marginLeft: 4 }]}>
                      {summarizing ? '…' : 'Summarize'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.tagBtn, { backgroundColor: item.action.bg }]}
                onPress={handleView}
                activeOpacity={0.7}
              >
                <View style={styles.row}>
                  <Icon lib={item.action.iconLib} name={item.action.iconName} size={11} color={item.action.color} />
                  <Text style={[styles.tagText, { color: item.action.color, marginLeft: 4 }]}>{item.action.label}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── ÉCRAN PRINCIPAL ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const [currentScreen,    setCurrentScreen]    = useState(null);
  const [previousScreen,   setPreviousScreen]   = useState(null);
  const [selectedCase,     setSelectedCase]     = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedInvoice,  setSelectedInvoice]  = useState(null);

  // ── État API ─────────────────────────────────────────────────────────────
  const [stats,        setStats]        = useState(null);
  const [todayEvents,  setTodayEvents]  = useState([]);
  const [recentCases,  setRecentCases]  = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [recentDocs,   setRecentDocs]   = useState([]);
  const [clientCount,  setClientCount]  = useState(null);
  const [notifCount,   setNotifCount]   = useState(0);
  const [loadingData,  setLoadingData]  = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState(null);

  // ── Chargement dashboard ─────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setError(null);
    const [sRes, tRes, rRes, nRes, taskRes, docRes] = await Promise.allSettled([
      dashboardAPI.stats(),
      dashboardAPI.today(),
      dashboardAPI.recentCases(),
      notificationsAPI.unreadCount(),
      tasksAPI.list({ status: 'PENDING', limit: 5 }),
      documentsAPI.list({ limit: 5 }),
    ]);

    if (sRes.status === 'fulfilled') {
      setStats(sRes.value);
      if (sRes.value?.client_count != null) setClientCount(sRes.value.client_count);
    } else {
      console.warn('Stats failed:', sRes.reason?.message);
      setError('Could not load dashboard stats');
    }

    if (tRes.status === 'fulfilled') setTodayEvents(tRes.value || []);
    if (rRes.status === 'fulfilled') setRecentCases(rRes.value || []);

    if (nRes.status === 'fulfilled') {
      setNotifCount(nRes.value?.count ?? 0);
    }

    if (taskRes.status === 'fulfilled') {
      setPendingTasks(taskRes.value || []);
    }

    if (docRes.status === 'fulfilled') {
      setRecentDocs(docRes.value || []);
    }
  }, []);

  useEffect(() => {
    loadDashboard().finally(() => setLoadingData(false));
  }, [loadDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  // ── Ouvrir les détails complets d'un dossier ─────────────────────────────
  const handleCasePress = useCallback(async (partialCase) => {
    try {
      const full = await casesAPI.getById(partialCase._id);
      const cl   = full.client;
      setSelectedCase({
        _id:         full.id,
        id:          full.case_number,
        title:       full.title,
        type:        full.case_type || '',
        phase:       full.status || '',
        priority:    (full.priority || 'NORMAL').toLowerCase(),
        status:      full.status || '',
        filingDate:  full.filing_date || '',
        court:       full.court_name || '',
        judge:       full.judge_name || '',
        prosecutor:  full.opposing_party || '',
        attorney:    full.attorney_name || '',
        caseValue:   full.estimated_value ? `$${full.estimated_value}` : '',
        description: full.description || '',
        tags:        full.case_type ? [full.case_type] : [],
        nextHearing: null,
        stats:       { docs: 0, tasks: 0, events: 0, notes: 0 },
        timeTracking:{ billable: 0, nonBillable: 0 },
        client:      cl ? {
          name:    `${cl.first_name || ''} ${cl.last_name || ''}`.trim(),
          id:      cl.id || '',
          avatar:  null,
          since:   '',
          phone:   cl.phone || '',
          email:   cl.email || '',
          address: '',
          status:  'Active',
          tier:    '',
        } : null,
      });
    } catch (e) {
      Alert.alert('Error', 'Could not load case details. Please try again.');
    }
  }, []);

  // ── Marquer une tâche comme terminée ─────────────────────────────────────
  const handleTaskDone = useCallback((taskId) => {
    Alert.alert(
      'Complete Task',
      'Mark this task as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          style: 'default',
          onPress: async () => {
            try {
              await tasksAPI.updateStatus(taskId, 'COMPLETED');
              setPendingTasks(prev => prev.filter(t => t.id !== taskId));
            } catch {
              Alert.alert('Error', 'Could not update task status. Please try again.');
            }
          },
        },
      ],
    );
  }, []);

  // ── Cartes de statistiques ────────────────────────────────────────────────
  const STATS_LIVE = stats ? [
    {
      iconLib: 'FA5', iconName: 'briefcase', iconColor: COLORS.primary, iconBg: COLORS.blue100,
      count: String(stats.active_cases ?? 0), label: 'Active Cases',
      badge: stats.active_cases > 0 ? `${stats.active_cases} open` : 'None',
      badgeColor: stats.active_cases > 0 ? COLORS.green600 : COLORS.gray500,
      badgeBg:    stats.active_cases > 0 ? COLORS.green50  : COLORS.gray100,
    },
    {
      iconLib: 'FA5', iconName: 'gavel', iconColor: COLORS.purple600, iconBg: COLORS.purple100,
      count: String(stats.upcoming_hearings ?? 0), label: 'Hearings',
      badge: stats.upcoming_hearings > 0 ? 'Upcoming' : 'None',
      badgeColor: stats.upcoming_hearings > 0 ? COLORS.orange600 : COLORS.gray500,
      badgeBg:    stats.upcoming_hearings > 0 ? COLORS.orange50  : COLORS.gray100,
    },
    {
      iconLib: 'FA5', iconName: 'tasks', iconColor: COLORS.amber600, iconBg: COLORS.amber100,
      count: String(pendingTasks.length), label: 'Pending Tasks',
      badge: pendingTasks.length > 0 ? 'Pending' : 'Clear',
      badgeColor: pendingTasks.length > 0 ? COLORS.amber600  : COLORS.green600,
      badgeBg:    pendingTasks.length > 0 ? COLORS.amber50   : COLORS.green50,
    },
    {
      iconLib: 'FA5', iconName: 'check-circle', iconColor: COLORS.green600, iconBg: COLORS.green100,
      count: String(stats.closed_cases ?? 0), label: 'Closed Cases',
      badge: 'Done',
      badgeColor: COLORS.blue600, badgeBg: COLORS.blue50,
    },
  ] : STATS_FALLBACK;

  // ── Quick actions avec données réelles ────────────────────────────────────
  const MANAGEMENT_ACTIONS_LIVE = [
    {
      screen: 'ClientsManagement', icon: 'users', iconLib: 'FA5',
      label: 'Clients', sublabel: 'Management',
      color: COLORS.purple600, bg: COLORS.purple50, accent: COLORS.purple100,
      badge: clientCount !== null ? String(clientCount) : '—',
      badgeLabel: 'Total', badgeColor: COLORS.purple600, badgeBg: COLORS.purple100,
    },
    {
      screen: 'TasksNotesManagement', icon: 'tasks', iconLib: 'FA5',
      label: 'Tasks & Notes', sublabel: 'Management',
      color: COLORS.amber600, bg: COLORS.amber50, accent: COLORS.amber100,
      badge: String(pendingTasks.length),
      badgeLabel: 'Pending', badgeColor: COLORS.amber600, badgeBg: COLORS.amber100,
    },
    {
      screen: 'InvoicesManagement', icon: 'file-invoice-dollar', iconLib: 'FA5',
      label: 'Invoices', sublabel: '& Payments',
      color: COLORS.teal600, bg: '#F0FDFA', accent: '#CCFBF1',
      badge: stats ? `$${stats.pending_payments ?? 0}` : '—',
      badgeLabel: '', badgeColor: COLORS.red600, badgeBg: COLORS.red50,
    },
    {
      screen: 'AIAssistant', icon: 'robot', iconLib: 'FA5',
      label: 'AI Assistant', sublabel: 'Legal AI',
      color: COLORS.indigo600, bg: '#EEF2FF', accent: '#C7D2FE',
      badge: 'Online', badgeLabel: '', badgeColor: COLORS.green600, badgeBg: COLORS.green50,
    },
  ];

  // ── Conversion événements du jour ─────────────────────────────────────────
  const scheduleEvents = todayEvents.map((ev) => {
    const dt = parseDate(ev.start_datetime);
    const h = localH(dt), m = localM(dt);
    return {
      id:           ev.id,
      type:         ev.event_type?.toLowerCase() || 'meeting',
      time:         `${h % 12 || 12}:${String(m).padStart(2, '0')}`,
      period:       h >= 12 ? 'PM' : 'AM',
      title:        ev.title,
      subtitle:     ev.location || ev.case_file?.title || '',
      priority:     'normal',
      case_id:      ev.case_id,
      location:     ev.location,
      meeting_link: ev.meeting_link,
      tag:          ev.event_type?.replace(/_/g, ' '),
      client:       null,
    };
  });

  // ── Conversion dossiers récents ───────────────────────────────────────────
  const CASE_PRIORITY = {
    URGENT: { color: COLORS.red600,   bg: COLORS.red50   },
    HIGH:   { color: COLORS.red600,   bg: COLORS.red50   },
    MEDIUM: { color: COLORS.amber600, bg: COLORS.amber50 },
    NORMAL: { color: COLORS.green600, bg: COLORS.green50 },
    LOW:    { color: COLORS.green600, bg: COLORS.green50 },
  };

  const casesDisplay = recentCases.map((c) => {
    const priority = c.priority || 'NORMAL';
    const pc = CASE_PRIORITY[priority] || CASE_PRIORITY.NORMAL;
    return {
      _id:         c.id,
      id:          c.case_number || null,
      badge:       priority.charAt(0) + priority.slice(1).toLowerCase(),
      badgeColor:  pc.color,
      badgeBg:     pc.bg,
      col1Label:   'Status',  col1Val: c.status ? c.status.charAt(0) + c.status.slice(1).toLowerCase() : '—',
      col2Label:   'Type',    col2Val: c.case_type || '—',
      col3Label:   'Updated', col3Val: formatRelativeDate(c.updated_at),
      actions: [
        { iconLib: 'FA5', iconName: 'robot', bg: COLORS.blue50,  color: COLORS.primary },
        { iconLib: 'FA5', iconName: 'eye',   bg: COLORS.gray100, color: COLORS.gray600 },
      ],
      title:       c.title,
      subtitle:    c.case_type || '',
      type:        c.case_type || '',
      phase:       c.status || '',
      priority:    priority.toLowerCase(),
      status:      c.status || '',
      filingDate:  c.filing_date || '',
      court:       c.court_name || '',
      judge:       c.judge_name || '',
      prosecutor:  c.opposing_party || '',
      attorney:    '',
      caseValue:   c.estimated_value ? `$${c.estimated_value}` : '',
      description: c.description || '',
      tags:        c.case_type ? [c.case_type] : [],
      nextHearing: null,
      stats:       { docs: 0, tasks: 0, events: 0, notes: 0 },
      timeTracking:{ billable: 0, nonBillable: 0 },
      client: c.client_name
        ? { name: c.client_name, id: c.client_id || '', avatar: null, since: '', phone: '', email: '', address: '', status: 'Active', tier: '' }
        : null,
    };
  });

  // ── Conversion tâches ─────────────────────────────────────────────────────
  const tasksDisplay = pendingTasks.map((task) => {
    const dueBadge  = getDueBadge(task.due_date, task.priority);
    const prioKey   = (task.priority || 'NORMAL').toUpperCase();
    const prioCfg   = TASK_PRIORITY[prioKey] || TASK_PRIORITY.NORMAL;
    return {
      id:         task.id,
      title:      task.title,
      ...dueBadge,
      description: task.description || null,
      caseName:    task.case_file?.title || task.case_file?.case_number || null,
      lawyerName:  task.app_user?.full_name || null,
      prioLabel:  prioCfg.label,
      prioColor:  prioCfg.color,
      prioBg:     prioCfg.bg,
      timeLeft:   task.due_date ? formatRelativeDate(task.due_date) : null,
    };
  });

  // ── Conversion documents ──────────────────────────────────────────────────
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
  const docsDisplay = recentDocs.map((doc) => {
    const { iconName, iconColor, iconBg } = getDocIconStyle(doc.file_type);
    const ext = (doc.file_name || '').split('.').pop().toLowerCase();
    return {
      id:      doc.id,
      iconLib: 'FA5',
      iconName, iconColor, iconBg,
      name:    doc.file_name,
      case:    doc.case_file?.title || doc.case_file?.case_number || '',
      size:    doc.file_size_mb ? `${Number(doc.file_size_mb).toFixed(1)} MB` : '',
      date:    formatRelativeDate(doc.created_at),
      fileUrl: doc.storage_url || null,
      isImage: IMAGE_EXTS.has(ext),
      action:  { iconLib: 'FA5', iconName: 'eye', label: 'View', color: COLORS.purple600, bg: COLORS.purple50 },
    };
  });

  const navigateTo = (screen) => setCurrentScreen(screen);
  const goBack = () => setCurrentScreen(null);
  const screenProps = { navigation: { goBack } };

  const tasksNotesNav = {
    goBack,
    navigate: (screen) => {
      if (screen === 'AddTask' || screen === 'VoiceNote' || screen === 'AddNote') {
        setPreviousScreen('TasksNotesManagement');
        setCurrentScreen(screen);
      }
    },
  };

  const clientsManagementNav = {
    goBack,
    navigate: (screen, params) => {
      if (screen === 'ClientDetails' && params?.clientId) {
        setSelectedClientId(params.clientId);
        setPreviousScreen('ClientsManagement');
        setCurrentScreen('ClientDetails');
      } else if (screen === 'AddClient') {
        setPreviousScreen('ClientsManagement');
        setCurrentScreen('AddClient');
      }
    },
  };

  const invoicesManagementNav = {
    goBack,
    navigate: (screen, params) => {
      if (screen === 'Invoice') {
        setPreviousScreen('InvoicesManagement');
        setCurrentScreen('Invoice');
      } else if (screen === 'InvoiceDetails' && params?.invoice) {
        setSelectedInvoice(params.invoice);
        setPreviousScreen('InvoicesManagement');
        setCurrentScreen('InvoiceDetails');
      }
    },
  };

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const firmName  = user?.firm_name || 'Your Firm';

  // ── Chargement initial ────────────────────────────────────────────────────
  if (loadingData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Sous-écrans ───────────────────────────────────────────────────────────
  if (selectedCase) {
    return (
      <CaseDetailsScreen
        navigation={{ goBack: () => setSelectedCase(null) }}
        route={{ params: { caseData: selectedCase } }}
      />
    );
  }

  if (currentScreen === 'AddCase')              return <AddCaseScreen {...screenProps} />;
  if (currentScreen === 'AddClient')            return <AddClientScreen navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); } }} />;
  if (currentScreen === 'UploadDoc')            return <UploadDocumentScreen {...screenProps} />;
  if (currentScreen === 'AddNote')              return <AddNoteScreen navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); } }} />;
  if (currentScreen === 'AIAssistant')          return <AIAssistantScreen {...screenProps} />;
  if (currentScreen === 'Schedule')             return <ScheduleScreen {...screenProps} />;
  if (currentScreen === 'Invoice')              return <InvoiceScreen navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); } }} />;
  if (currentScreen === 'VoiceNote')            return <VoiceNoteScreen navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); } }} />;
  if (currentScreen === 'AddTask')              return <AddTaskScreen   navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); } }} />;
  if (currentScreen === 'Notifications')        return <NotificationsScreen {...screenProps} />;
  if (currentScreen === 'InvoicesManagement')   return <InvoicesManagementScreen navigation={invoicesManagementNav} />;
  if (currentScreen === 'InvoiceDetails')       return (
    <InvoiceDetailsScreen
      navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); setSelectedInvoice(null); } }}
      route={{ params: { invoice: selectedInvoice } }}
    />
  );
  if (currentScreen === 'ClientsManagement')    return <ClientsManagementScreen navigation={clientsManagementNav} />;
  if (currentScreen === 'ClientDetails')        return (
    <ClientDetailsScreen
      navigation={{ goBack: () => { setCurrentScreen(previousScreen || null); setPreviousScreen(null); setSelectedClientId(null); } }}
      route={{ params: { clientId: selectedClientId } }}
    />
  );
  if (currentScreen === 'TasksNotesManagement') return <TasksNotesManagementScreen navigation={tasksNotesNav} />;
  if (currentScreen === 'AllSchedule')          return <AllScheduleScreen {...screenProps} />;
  if (currentScreen === 'AllCases')             return <AllCasesScreen {...screenProps} />;
  if (currentScreen === 'AllTasks')             return <AllTasksScreen {...screenProps} />;
  if (currentScreen === 'AllDocuments')         return <AllDocumentsScreen {...screenProps} />;

  // ── Rendu principal ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.row}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <FontAwesome5 name="user" size={20} color={COLORS.white} />
              </View>
            )}
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.welcomeText}>Welcome back, {firstName}</Text>
              <Text style={styles.firmText}>{firmName}</Text>
            </View>
          </View>
          <TouchableOpacity style={{ position: 'relative' }} onPress={() => { navigateTo('Notifications'); setNotifCount(0); }}>
            <Icon lib="ION" name="notifications-outline" size={26} color={COLORS.white} />
            {notifCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <Icon lib="FA" name="search" size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search cases, clients, documents…"
            placeholderTextColor="rgba(255,255,255,0.6)"
          />
        </View>
      </View>

      {/* ── Bandeau d'erreur ── */}
      {error && (
        <View style={styles.errorBanner}>
          <Icon lib="FA5" name="exclamation-triangle" size={13} color={COLORS.red600} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh}>
            <Text style={styles.errorBannerRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── Stats ── */}
        <View style={styles.section}>
          <View style={styles.statsGrid}>
            {STATS_LIVE.map((s, i) => <StatCard key={i} item={s} />)}
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.section}>
          <SectionHeader title="Quick Actions" />
          <Text style={styles.managementSubtitle}>Tap a module to open its full management screen</Text>
          <View style={styles.mgmtGrid}>
            {MANAGEMENT_ACTIONS_LIVE.map((item, i) => (
              <ManagementCard key={i} item={item} onPress={navigateTo} />
            ))}
          </View>
        </View>

        {/* ── Today's Schedule ── */}
        <View style={[styles.section, { backgroundColor: COLORS.blue50 }]}>
          <SectionHeader title="Today's Schedule" action="View All ›" onAction={() => navigateTo('AllSchedule')} />
          {scheduleEvents.length > 0 ? (
            scheduleEvents.map((event) => (
              <ScheduleCard key={event.id} event={event} navigateTo={navigateTo} />
            ))
          ) : (
            <EmptyState lib="ION" icon="calendar-outline" text="No events scheduled for today" />
          )}
        </View>

        {/* ── Active Cases ── */}
        <View style={styles.section}>
          <SectionHeader title="Active Cases" action="See All ›" onAction={() => navigateTo('AllCases')} />
          {casesDisplay.length > 0 ? (
            casesDisplay.map((c, i) => (
              <CaseCard key={i} item={c} onViewDetails={handleCasePress} />
            ))
          ) : (
            <EmptyState icon="briefcase" text="No active cases" />
          )}
        </View>

        {/* ── Pending Tasks ── */}
        <View style={[styles.section, { backgroundColor: COLORS.amber50 }]}>
          <SectionHeader title="Pending Tasks" action="View All ›" onAction={() => navigateTo('AllTasks')} />
          {tasksDisplay.length > 0 ? (
            tasksDisplay.map((t) => (
              <TaskCard key={t.id} item={t} onDone={handleTaskDone} />
            ))
          ) : (
            <EmptyState icon="check-circle" text="No pending tasks — all clear!" />
          )}
          <TouchableOpacity style={styles.addTaskBtn} onPress={() => navigateTo('AddTask')}>
            <Icon lib="FA5" name="plus" size={14} color={COLORS.amber600} />
            <Text style={styles.addTaskBtnText}>Add New Task</Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Documents ── */}
        <View style={styles.section}>
          <SectionHeader title="Recent Documents" action="View All ›" onAction={() => navigateTo('AllDocuments')} />
          {docsDisplay.length > 0 ? (
            docsDisplay.map((d) => (
              <DocumentCard key={d.id} item={d} />
            ))
          ) : (
            <EmptyState icon="file-alt" text="No documents uploaded yet" />
          )}
        </View>

        {/* ── AI Card ── */}
        <View style={[styles.section, { backgroundColor: '#EEF2FF' }]}>
          <TouchableOpacity style={styles.aiCard} onPress={() => navigateTo('AIAssistant')}>
            <View style={styles.row}>
              <View style={styles.aiIconWrap}>
                <Icon lib="FA5" name="robot" size={24} color={COLORS.white} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.aiTitle}>AI Legal Assistant</Text>
                <Text style={styles.aiSub}>Tap to open your intelligent legal companion</Text>
              </View>
              <Icon lib="FA5" name="chevron-right" size={14} color={COLORS.white} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES : SCHEDULE CARD ──────────────────────────────────────────────────
const ev = StyleSheet.create({
  card:          { backgroundColor: COLORS.white, borderRadius: 18, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: COLORS.gray100 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconCircle:    { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timeText:      { fontSize: 15, fontWeight: '800' },
  timePeriod:    { fontSize: 12, fontWeight: '500' },
  typePill:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, maxWidth: 130 },
  typePillText:  { fontSize: 11, fontWeight: '700' },
  body:          { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  title:         { fontSize: 15, fontWeight: '800', color: COLORS.dark },
  subText:       { fontSize: 12, color: COLORS.gray500, flex: 1 },
  footer:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.gray100, marginTop: 8 },
  clientChip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gray50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4, maxWidth: '60%' },
  clientChipText:{ fontSize: 11, color: COLORS.gray500, fontWeight: '500' },
  actionBtn:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

// ─── STYLES : CASE CARD ───────────────────────────────────────────────────────
const cc = StyleSheet.create({
  card:          { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 18, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: COLORS.gray100 },
  accent:        { width: 5, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  content:       { flex: 1, padding: 14 },
  topRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  caseNum:       { fontSize: 11, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.blue50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  priorityDot:   { width: 6, height: 6, borderRadius: 3 },
  priorityText:  { fontSize: 11, fontWeight: '700' },
  title:         { fontSize: 15, fontWeight: '800', color: COLORS.dark, lineHeight: 20, marginBottom: 8 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  avatar:        { width: 22, height: 22, borderRadius: 11 },
  avatarFallback:{ backgroundColor: COLORS.blue100, alignItems: 'center', justifyContent: 'center' },
  clientName:    { fontSize: 12, color: COLORS.gray600, fontWeight: '600', flex: 1 },
  dot:           { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.gray300 },
  typeText:      { fontSize: 11, color: COLORS.gray400, flexShrink: 1 },
  footer:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  statusChip:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:    { fontSize: 11, fontWeight: '700' },
  updatedText:   { fontSize: 11, color: COLORS.gray400 },
});

// ─── STYLES DOCUMENT SUMMARY MODAL ──────────────────────────────────────────
const dcs = StyleSheet.create({
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  summarySheet:  { backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  summaryHandle: { width: 40, height: 4, backgroundColor: COLORS.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  summaryIconWrap:{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  summaryTitle:  { fontSize: 16, fontWeight: '800', color: COLORS.dark },
  summaryDocName:{ fontSize: 11, color: COLORS.gray500, marginTop: 2 },
  summaryBody:   { fontSize: 13, color: COLORS.dark, lineHeight: 21, paddingBottom: 24 },
});

// ─── STYLES PRINCIPAUX ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: COLORS.primary },
  loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.gray50 },
  loadingText:        { marginTop: 12, color: COLORS.gray500, fontSize: 13 },
  scroll:             { flex: 1, backgroundColor: COLORS.gray50 },
  header:             { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerTop:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  avatar:             { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: COLORS.white },
  avatarPlaceholder:  { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  welcomeText:        { fontSize: 16, fontWeight: '700', color: COLORS.white },
  firmText:           { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  notifBadge:         { position: 'absolute', top: -3, right: -3, backgroundColor: COLORS.red500, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText:     { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  searchWrap:         { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput:        { flex: 1, color: COLORS.white, fontSize: 14 },
  errorBanner:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red50, paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.red100 },
  errorBannerText:    { flex: 1, fontSize: 12, color: COLORS.red600 },
  errorBannerRetry:   { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  section:            { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: COLORS.white, marginBottom: 2 },
  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle:       { fontSize: 17, fontWeight: '700', color: COLORS.dark },
  sectionAction:      { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  managementSubtitle: { fontSize: 12, color: COLORS.gray500, marginBottom: 16 },
  emptyState:         { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyStateText:     { fontSize: 13, color: COLORS.gray400, fontWeight: '500' },
  statsGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard:           { width: '47%', backgroundColor: COLORS.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: COLORS.gray100 },
  statTop:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statIconWrap:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statBadge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statBadgeText:      { fontSize: 11, fontWeight: '600' },
  statCount:          { fontSize: 24, fontWeight: '800', color: COLORS.dark, marginBottom: 2 },
  statLabel:          { fontSize: 12, fontWeight: '500', color: COLORS.gray500 },
  mgmtGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mgmtCard:           { width: (W - 40 - 12) / 2 - 1, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, position: 'relative', overflow: 'hidden' },
  mgmtIconCircle:     { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  mgmtLabel:          { fontSize: 15, fontWeight: '800', lineHeight: 18 },
  mgmtSublabel:       { fontSize: 11, color: COLORS.gray500, marginTop: 2, marginBottom: 10 },
  mgmtBadge:          { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  mgmtBadgeText:      { fontSize: 11, fontWeight: '700' },
  mgmtArrow:          { position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  card:               { backgroundColor: COLORS.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: COLORS.gray100, marginBottom: 10 },
  cardTitle:          { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  cardSubtitle:       { fontSize: 13, color: COLORS.gray600, marginTop: 2 },
  row:                { flexDirection: 'row', alignItems: 'center' },
  tag:                { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText:            { fontSize: 11, fontWeight: '600' },
  tagBtn:             { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  iconBtn:            { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarSm:           { width: 24, height: 24, borderRadius: 12, marginRight: 6 },
  clientName:         { fontSize: 12, fontWeight: '500', color: COLORS.gray600 },
  gray500Sm:          { fontSize: 12, color: COLORS.gray500 },
  avatarSm:           { width: 24, height: 24, borderRadius: 12, marginRight: 6 },
  clientName:         { fontSize: 12, fontWeight: '500', color: COLORS.gray600 },
  checkbox:           { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.gray400, marginRight: 12, marginTop: 2 },
  docIcon:            { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiCard:             { backgroundColor: COLORS.indigo600, borderRadius: 20, padding: 18 },
  aiIconWrap:         { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiTitle:            { fontSize: 16, fontWeight: '700', color: COLORS.white },
  aiSub:              { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  addTaskBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.amber600, marginTop: 4 },
  addTaskBtnText:     { fontSize: 13, fontWeight: '700', color: COLORS.amber600 },
});
