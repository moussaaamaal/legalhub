import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { notificationsAPI, billingAPI, documentsAPI } from '../../services/api';

// ─── COULEURS ─────────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const FILTER_TABS = ['All Updates', 'Cases', 'Documents', 'Payments', 'Deadlines'];

const FILTER_TYPE_MAP = [
  null,
  ['CASE_UPDATE', 'HEARING_REMINDER'],
  ['DOCUMENT_SHARED'],
  ['INVOICE_DUE'],
  ['HEARING_REMINDER', 'TASK_ASSIGNED'],
];

const TYPE_CONFIG = {
  CASE_UPDATE:      { iconName: 'briefcase',   iconColor: '#1E40AF', iconBg: '#DBEAFE', borderColor: '#3B82F6', badge: 'CASE UPDATE',      badgeColor: '#1E40AF', badgeBg: '#EFF6FF' },
  INVOICE_DUE:      { iconName: 'dollar-sign', iconColor: '#D97706', iconBg: '#FEF3C7', borderColor: '#D97706', badge: 'INVOICE DUE',       badgeColor: '#D97706', badgeBg: '#FFFBEB' },
  HEARING_REMINDER: { iconName: 'gavel',       iconColor: '#DC2626', iconBg: '#FEE2E2', borderColor: '#DC2626', badge: 'HEARING REMINDER',  badgeColor: '#DC2626', badgeBg: '#FEF2F2' },
  DOCUMENT_SHARED:  { iconName: 'file-alt',    iconColor: '#16A34A', iconBg: '#DCFCE7', borderColor: '#22C55E', badge: 'DOCUMENT SHARED',   badgeColor: '#16A34A', badgeBg: '#F0FDF4' },
  TASK_ASSIGNED:    { iconName: 'tasks',        iconColor: '#9333EA', iconBg: '#F3E8FF', borderColor: '#A855F7', badge: 'TASK ASSIGNED',     badgeColor: '#9333EA', badgeBg: '#FAF5FF' },
  GENERAL:          { iconName: 'bell',         iconColor: '#4B5563', iconBg: '#F3F4F6', borderColor: '#9CA3AF', badge: 'GENERAL',           badgeColor: '#4B5563', badgeBg: '#F9FAFB' },
};

const INVOICE_STATUS_CFG = {
  PAID:    { icon: 'check',       bg: C.green100, color: C.green600, amountColor: C.green600 },
  PENDING: { icon: 'clock',       bg: C.amber100, color: C.amber600, amountColor: C.amber600 },
  OVERDUE: { icon: 'exclamation', bg: C.red100,   color: C.red600,   amountColor: C.red600   },
  DRAFT:   { icon: 'pencil-alt',  bg: C.g100,     color: C.g500,     amountColor: C.g500     },
};

const DOC_TYPE_CFG = {
  PDF:   { iconName: 'file-pdf',   iconColor: C.red600,    iconBg: C.red100    },
  DOCX:  { iconName: 'file-word',  iconColor: C.primary,   iconBg: C.blue100   },
  XLSX:  { iconName: 'file-excel', iconColor: C.green600,  iconBg: C.green100  },
  IMAGE: { iconName: 'file-image', iconColor: C.purple600, iconBg: C.purple100 },
  OTHER: { iconName: 'file-alt',   iconColor: C.g500,      iconBg: C.g100      },
};

// ─── DONNÉES STATIQUES (fallback si l'API est vide) ───────────────────────────
const TODAY_NOTIFS = [
  {
    iconName: 'gavel', iconColor: C.red600, iconBg: C.red100, borderColor: C.red600,
    badge: 'CASE UPDATE', badgeColor: C.red600, badgeBg: C.red50,
    time: '2 min ago', title: 'Hearing Rescheduled',
    desc: 'State vs. Johnson - Criminal Court hearing moved to March 18, 10:00 AM',
    caseId: 'CR-2024-1247', avatar: null, avatarName: null,
    actionLabel: 'View Case', actionColor: C.primary, actionStyle: 'link',
    is_read: false,
  },
  {
    iconName: 'dollar-sign', iconColor: C.green600, iconBg: C.green100, borderColor: C.green600,
    badge: 'PAYMENT RECEIVED', badgeColor: C.green600, badgeBg: C.green50,
    time: '15 min ago', title: 'Payment Confirmed',
    desc: 'Robert Chen paid $5,000.00 for Invoice #2024-089 via Bank Transfer',
    caseId: null, avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-4.jpg', avatarName: 'Robert Chen',
    actionLabel: 'View Receipt', actionColor: C.green600, actionStyle: 'link',
    is_read: false,
  },
  {
    iconName: 'file-pdf', iconColor: C.primary, iconBg: C.blue100, borderColor: C.secondary,
    badge: 'DOCUMENT ADDED', badgeColor: C.blue600, badgeBg: C.blue50,
    time: '45 min ago', title: 'New Document Uploaded',
    desc: 'Signed Contract Amendment - Mitchell Corp.pdf (2.4 MB)',
    caseId: 'CV-2024-0892', avatar: null, avatarName: null,
    actionLabel: 'View', actionColor: C.primary, actionStyle: 'link',
    extraAction: { label: 'Analyze', icon: 'robot', color: C.primary, bg: C.blue50 },
    is_read: true,
  },
];

const YESTERDAY_NOTIFS = [
  {
    iconName: 'user-plus', iconColor: C.teal600, iconBg: C.teal100, borderColor: C.teal600,
    badge: 'NEW CLIENT', badgeColor: C.teal600, badgeBg: C.teal50,
    time: 'Yesterday, 4:30 PM', title: 'Client Added to System',
    desc: 'Jennifer Williams - Personal Injury Case (Car Accident)',
    caseId: null, avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-6.jpg', avatarName: 'Jennifer Williams',
    actionLabel: 'View Profile', actionColor: C.teal600, actionStyle: 'link',
    is_read: true,
  },
  {
    iconName: 'clock', iconColor: C.amber600, iconBg: C.amber100, borderColor: C.amber600,
    badge: 'PAYMENT DUE', badgeColor: C.amber600, badgeBg: C.amber50,
    time: 'Yesterday, 12:00 PM', title: 'Payment Reminder Sent',
    desc: 'Invoice #2024-091 reminder sent to Sarah Mitchell ($3,500 overdue)',
    caseId: null, avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg', avatarName: 'Sarah Mitchell',
    actionLabel: 'Follow Up', actionColor: C.green600, actionStyle: 'filled', actionBg: C.green50,
    actionIcon: 'whatsapp', actionLib: 'FA', is_read: false,
  },
];

const WEEK_NOTIFS = [
  {
    iconName: 'file-invoice', iconColor: C.primary, iconBg: C.blue100, borderColor: C.secondary,
    badge: 'INVOICE SENT', badgeColor: C.blue600, badgeBg: C.blue50,
    time: 'Mar 13, 3:45 PM', title: 'Invoice Generated',
    desc: 'Invoice #2024-092 sent to Mitchell Corp. for $8,500.00',
    caseId: 'CV-2024-0892', avatar: null, avatarName: null,
    actionLabel: 'View Invoice', actionColor: C.primary, actionStyle: 'link',
    is_read: true,
  },
  {
    iconName: 'briefcase', iconColor: C.indigo600, iconBg: C.indigo100, borderColor: C.indigo600,
    badge: 'NEW CASE', badgeColor: C.indigo600, badgeBg: C.indigo50,
    time: 'Mar 12, 2:00 PM', title: 'Case Opened',
    desc: 'Thompson vs. City Transit Authority - Personal Injury',
    caseId: 'PI-2024-0234', avatar: null, avatarName: null,
    actionLabel: 'View Case', actionColor: C.indigo600, actionStyle: 'link',
    is_read: false,
  },
];

const PAYMENT_SUMMARY_FALLBACK = [
  { statusIcon: 'check',       statusBg: C.green100, statusColor: C.green600, invoice: 'Invoice #2024-089', client: 'Robert Chen - Paid',      amount: '$5,000', amountColor: C.green600 },
  { statusIcon: 'clock',       statusBg: C.amber100, statusColor: C.amber600, invoice: 'Invoice #2024-092', client: 'Mitchell Corp. - Pending', amount: '$8,500', amountColor: C.amber600 },
  { statusIcon: 'exclamation', statusBg: C.red100,   statusColor: C.red600,   invoice: 'Invoice #2024-091', client: 'Sarah Mitchell - Overdue', amount: '$1,750', amountColor: C.red600   },
];

const DOC_ACTIVITY_FALLBACK = [
  { iconName: 'file-pdf',   iconColor: C.red600,   iconBg: C.red100,   title: 'Motion to Dismiss - Final.pdf',    sub: 'State vs. Johnson',   time: 'Today, 2:30 PM',    badge: 'New',      badgeColor: C.primary,  badgeBg: C.blue50,  actionLabel: 'View',    actionIcon: 'eye',   actionColor: C.primary,   actionBg: C.blue50  },
  { iconName: 'file-word',  iconColor: C.primary,  iconBg: C.blue100,  title: 'Contract Amendment - Signed.docx', sub: 'Mitchell Corp.',       time: 'Today, 11:15 AM',   badge: 'Signed',   badgeColor: C.green600, badgeBg: C.green50, actionLabel: 'Analyze', actionIcon: 'robot', actionColor: C.indigo600, actionBg: C.indigo50},
  { iconName: 'file-excel', iconColor: C.green600, iconBg: C.green100, title: 'Asset Inventory - Updated.xlsx',   sub: 'Chen Estate Planning', time: 'Yesterday, 3:00 PM', badge: 'Modified', badgeColor: C.amber600, badgeBg: C.amber50, actionLabel: 'Open',    actionIcon: 'eye',   actionColor: C.g600,      actionBg: C.g100    },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatRelativeTime(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? 's' : ''} ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDocDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function apiNotifToCard(n) {
  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.GENERAL;
  const date = n.created_at ? new Date(n.created_at) : new Date();
  return {
    ...cfg,
    id:          n.id,
    type:        n.type || 'GENERAL',
    time:        formatRelativeTime(date),
    title:       n.title,
    desc:        n.message || '',
    caseId:      null,
    avatar:      null,
    avatarName:  null,
    actionLabel: 'View',
    actionColor: cfg.badgeColor,
    actionStyle: 'link',
    is_read:     n.is_read,
    _date:       date,
  };
}

function invoiceToRow(inv) {
  const cfg = INVOICE_STATUS_CFG[inv.status] || INVOICE_STATUS_CFG.DRAFT;
  const clientObj = inv.client || {};
  const clientName = `${clientObj.first_name || ''} ${clientObj.last_name || ''}`.trim() || 'Client';
  const statusLabel = inv.status ? (inv.status.charAt(0) + inv.status.slice(1).toLowerCase()) : '';
  return {
    statusIcon:  cfg.icon,
    statusBg:    cfg.bg,
    statusColor: cfg.color,
    invoice:     inv.invoice_number || '—',
    client:      `${clientName} - ${statusLabel}`,
    amount:      fmtMoney(inv.total_amount),
    amountColor: cfg.amountColor,
  };
}

function docToActivity(doc) {
  const cfg = DOC_TYPE_CFG[doc.file_type] || DOC_TYPE_CFG.OTHER;
  const caseInfo = doc.case_file ? (doc.case_file.title || doc.case_file.case_number || '') : '';
  return {
    ...cfg,
    title:       doc.file_name || 'Document',
    sub:         caseInfo || 'No case linked',
    time:        formatDocDate(doc.created_at),
    badge:       'New',
    badgeColor:  C.primary,
    badgeBg:     C.blue50,
    actionLabel: 'View',
    actionIcon:  'eye',
    actionColor: C.primary,
    actionBg:    C.blue50,
  };
}

// ─── COMPOSANT NOTIFICATION CARD ─────────────────────────────────────────────
const NotifCard = ({ n, onMarkRead }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={() => !n.is_read && onMarkRead?.(n.id)}
  >
    <View style={[s.notifCard, { borderLeftColor: n.borderColor }, n.is_read === false && s.notifCardUnread]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[s.notifIcon, { backgroundColor: n.iconBg }]}>
          <FontAwesome5 name={n.iconName} size={18} color={n.iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.notifTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[s.pill, { backgroundColor: n.badgeBg }]}>
                <Text style={[s.pillTxt, { color: n.badgeColor }]}>{n.badge}</Text>
              </View>
              {n.is_read === false && <View style={s.unreadDot} />}
            </View>
            <Text style={s.notifTime}>{n.time}</Text>
          </View>
          <Text style={s.notifTitle}>{n.title}</Text>
          <Text style={s.notifDesc}>{n.desc}</Text>
          <View style={s.notifFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {n.caseId && (
                <View style={[s.pill, { backgroundColor: C.g100 }]}>
                  <Text style={[s.pillTxt, { color: C.g600 }]}>{n.caseId}</Text>
                </View>
              )}
              {n.avatar && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Image source={{ uri: n.avatar }} style={s.avatarTiny} />
                  <Text style={s.avatarName}>{n.avatarName}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {n.extraAction && (
                <TouchableOpacity style={[s.actionChip, { backgroundColor: n.extraAction.bg }]}>
                  <FontAwesome5 name={n.extraAction.icon} size={11} color={n.extraAction.color} />
                  <Text style={[s.actionChipTxt, { color: n.extraAction.color }]}>{n.extraAction.label}</Text>
                </TouchableOpacity>
              )}
              {n.actionStyle === 'link' && (
                <TouchableOpacity onPress={() => onMarkRead?.(n.id)}>
                  <Text style={[s.actionLink, { color: n.actionColor }]}>{n.actionLabel}</Text>
                </TouchableOpacity>
              )}
              {n.actionStyle === 'filled' && (
                <TouchableOpacity style={[s.actionChip, { backgroundColor: n.actionBg }]} onPress={() => onMarkRead?.(n.id)}>
                  {n.actionIcon && (
                    n.actionLib === 'FA'
                      ? <FontAwesome name={n.actionIcon} size={11} color={n.actionColor} />
                      : <FontAwesome5 name={n.actionIcon} size={11} color={n.actionColor} />
                  )}
                  <Text style={[s.actionChipTxt, { color: n.actionColor }]}>{n.actionLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  </TouchableOpacity>
);

// ─── ÉCRAN PRINCIPAL ──────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }) {
  const [activeFilter, setActiveFilter]   = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);
  const [invoices, setInvoices]           = useState([]);
  const [analytics, setAnalytics]         = useState(null);
  const [recentDocs, setRecentDocs]       = useState([]);

  // Chargement notifications + marquage auto comme lues
  const loadNotifications = useCallback(() => {
    setLoading(true);
    setError(false);
    notificationsAPI.list()
      .then(data => {
        const cards = (data || []).map(apiNotifToCard);
        setNotifications(cards);
        const hasUnread = (data || []).some(n => !n.is_read);
        if (hasUnread) {
          notificationsAPI.markAllRead()
            .then(() => setNotifications(prev => prev.map(n => ({ ...n, is_read: true }))))
            .catch(() => {});
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Chargement des données billing et documents en parallèle
  useEffect(() => {
    Promise.allSettled([
      billingAPI.listInvoices(),
      billingAPI.getAnalytics(),
      documentsAPI.list(),
    ]).then(([invRes, anaRes, docRes]) => {
      if (invRes.status === 'fulfilled') setInvoices(invRes.value || []);
      if (anaRes.status === 'fulfilled') setAnalytics(anaRes.value);
      if (docRes.status === 'fulfilled') setRecentDocs((docRes.value || []).slice(0, 3));
    });
  }, []);

  // Marquer une seule notification comme lue (au tap)
  const handleMarkOneRead = useCallback(async (id) => {
    if (!id) return;
    try {
      await notificationsAPI.markOneRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (_) {}
  }, []);

  // Dates dynamiques
  const today     = new Date();
  const yesterday = new Date(today - 86400000);
  const todayStr     = today.toDateString();
  const yesterdayStr = yesterday.toDateString();
  const todayLabel     = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const yesterdayLabel = yesterday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Filtrage par type selon l'onglet actif
  const filterTypes = FILTER_TYPE_MAP[activeFilter];
  const filtered    = filterTypes
    ? notifications.filter(n => filterTypes.includes(n.type))
    : notifications;

  // Groupement par date
  const todayNotifs     = filtered.filter(n => n._date.toDateString() === todayStr);
  const yesterdayNotifs = filtered.filter(n => n._date.toDateString() === yesterdayStr);
  const olderNotifs     = filtered.filter(n => n._date.toDateString() !== todayStr && n._date.toDateString() !== yesterdayStr);

  const usingApi = notifications.length > 0;
  const displayToday     = usingApi ? todayNotifs     : (activeFilter === 0 ? TODAY_NOTIFS     : []);
  const displayYesterday = usingApi ? yesterdayNotifs : (activeFilter === 0 ? YESTERDAY_NOTIFS : []);
  const displayOlder     = usingApi ? olderNotifs     : (activeFilter === 0 ? WEEK_NOTIFS      : []);

  // Stats dynamiques
  const statCases    = usingApi ? notifications.filter(n => ['CASE_UPDATE', 'HEARING_REMINDER'].includes(n.type)).length : 8;
  const statDocs     = usingApi ? notifications.filter(n => n.type === 'DOCUMENT_SHARED').length : 12;
  const statPayments = usingApi ? notifications.filter(n => n.type === 'INVOICE_DUE').length : 5;

  const hasNoResults = usingApi && filtered.length === 0;

  // Données billing pour l'aperçu paiements
  const paidTotal    = analytics ? analytics.total_revenue : null;
  const pendingTotal = analytics ? (analytics.outstanding + analytics.overdue) : null;
  const paidCount    = invoices.filter(i => i.status === 'PAID').length;
  const pendingCount = invoices.filter(i => ['PENDING', 'OVERDUE'].includes(i.status)).length;
  const displayInvoices = invoices.length > 0
    ? invoices.slice(0, 5).map(invoiceToRow)
    : PAYMENT_SUMMARY_FALLBACK;
  const displayDocs = recentDocs.length > 0
    ? recentDocs.map(docToActivity)
    : DOC_ACTIVITY_FALLBACK;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 }}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ marginTop: 12, color: C.g500, fontSize: 13 }}>Loading notifications…</Text>
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
            <Text style={s.headerTitle}>Notifications</Text>
            <Text style={s.headerSub}>Stay updated on all case activity</Text>
          </View>
          <View style={s.markAllBtn}>
            <FontAwesome5 name="check-double" size={13} color={C.white} />
            <Text style={s.markAllTxt}>All read</Text>
          </View>
        </View>
      </View>

      {/* ── ONGLETS DE FILTRE ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
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

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── STATS DYNAMIQUES ── */}
        <View style={[s.section, { backgroundColor: C.blue50 }]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { icon: 'briefcase',   iconColor: C.primary,  iconBg: C.blue100,  value: String(statCases),    label: 'Case Updates', borderColor: '#BFDBFE' },
              { icon: 'file-alt',    iconColor: C.green600, iconBg: C.green100, value: String(statDocs),     label: 'New Docs',     borderColor: '#BBF7D0' },
              { icon: 'dollar-sign', iconColor: C.amber600, iconBg: C.amber100, value: String(statPayments), label: 'Payments',     borderColor: '#FDE68A' },
            ].map((st, i) => (
              <View key={i} style={[s.statCard, { borderColor: st.borderColor }]}>
                <View style={[s.statIcon, { backgroundColor: st.iconBg }]}>
                  <FontAwesome5 name={st.icon} size={18} color={st.iconColor} />
                </View>
                <Text style={s.statVal}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── MESSAGE D'ERREUR ── */}
        {error && (
          <View style={[s.section, { alignItems: 'center', paddingVertical: 20 }]}>
            <FontAwesome5 name="exclamation-circle" size={28} color={C.amber600} />
            <Text style={{ fontSize: 13, color: C.g500, marginTop: 10, textAlign: 'center' }}>
              Unable to load notifications.{'\n'}Showing example data.
            </Text>
            <TouchableOpacity style={[s.markAllBtn, { marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 16 }]} onPress={loadNotifications}>
              <FontAwesome5 name="sync" size={12} color={C.white} />
              <Text style={s.markAllTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAT VIDE APRÈS FILTRE ── */}
        {hasNoResults && (
          <View style={[s.section, { alignItems: 'center', paddingVertical: 50 }]}>
            <FontAwesome5 name="bell-slash" size={40} color={C.g400} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.g500, marginTop: 16 }}>No notifications</Text>
            <Text style={{ fontSize: 13, color: C.g400, marginTop: 6 }}>Nothing in this category yet</Text>
          </View>
        )}

        {/* ── AUJOURD'HUI ── */}
        {displayToday.length > 0 && (
          <View style={s.section}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>Today</Text>
              <Text style={s.groupDate}>{todayLabel}</Text>
            </View>
            {displayToday.map((n, i) => (
              <NotifCard key={n.id ?? i} n={n} onMarkRead={handleMarkOneRead} />
            ))}
          </View>
        )}

        {/* ── HIER ── */}
        {displayYesterday.length > 0 && (
          <View style={[s.section, { backgroundColor: '#FAFAFA' }]}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>Yesterday</Text>
              <Text style={s.groupDate}>{yesterdayLabel}</Text>
            </View>
            {displayYesterday.map((n, i) => (
              <NotifCard key={n.id ?? i} n={n} onMarkRead={handleMarkOneRead} />
            ))}
          </View>
        )}

        {/* ── PLUS ANCIEN ── */}
        {displayOlder.length > 0 && (
          <View style={s.section}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>Earlier</Text>
              <Text style={s.groupDate}>{usingApi ? '' : 'This Week'}</Text>
            </View>
            {displayOlder.map((n, i) => (
              <NotifCard key={n.id ?? i} n={n} onMarkRead={handleMarkOneRead} />
            ))}
          </View>
        )}

        {/* ── APERÇU PAIEMENTS ── */}
        <View style={[s.section, { backgroundColor: C.green50 }]}>
          <Text style={[s.groupTitle, { marginBottom: 14 }]}>Payment Status Overview</Text>
          <View style={s.paymentCard}>
            <View style={s.paymentTopRow}>
              {[
                {
                  icon: 'check-circle', iconBg: C.green100, iconColor: C.green600,
                  value: paidTotal !== null ? fmtMoney(paidTotal) : '$12,750',
                  label: 'Paid',
                  sub: paidTotal !== null ? `${paidCount} payment${paidCount !== 1 ? 's' : ''}` : '3 payments',
                  subColor: C.green600,
                },
                {
                  icon: 'clock', iconBg: C.amber100, iconColor: C.amber600,
                  value: pendingTotal !== null ? fmtMoney(pendingTotal) : '$8,250',
                  label: 'Pending / Overdue',
                  sub: pendingTotal !== null ? `${pendingCount} invoice${pendingCount !== 1 ? 's' : ''}` : '4 invoices',
                  subColor: C.amber600,
                },
              ].map((p, i) => (
                <View key={i} style={[s.paymentStat, i === 0 && { borderRightWidth: 1, borderRightColor: C.g100 }]}>
                  <View style={[s.paymentIcon, { backgroundColor: p.iconBg }]}>
                    <FontAwesome5 name={p.icon} size={22} color={p.iconColor} />
                  </View>
                  <Text style={s.paymentVal}>{p.value}</Text>
                  <Text style={s.paymentLabel}>{p.label}</Text>
                  <Text style={[s.paymentSub, { color: p.subColor }]}>{p.sub}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 8 }}>
              {displayInvoices.map((p, i) => (
                <View key={i} style={s.paymentRow}>
                  <View style={[s.paymentRowIcon, { backgroundColor: p.statusBg }]}>
                    <FontAwesome5 name={p.statusIcon} size={13} color={p.statusColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.paymentRowInvoice}>{p.invoice}</Text>
                    <Text style={s.paymentRowClient}>{p.client}</Text>
                  </View>
                  <Text style={[s.paymentRowAmount, { color: p.amountColor }]}>{p.amount}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── ACTIVITÉ DOCUMENTS RÉCENTS ── */}
        <View style={s.section}>
          <Text style={[s.groupTitle, { marginBottom: 14 }]}>Recent Document Activity</Text>
          {displayDocs.map((doc, i) => (
            <View key={i} style={s.docCard}>
              <View style={[s.docIcon, { backgroundColor: doc.iconBg }]}>
                <FontAwesome5 name={doc.iconName} size={20} color={doc.iconColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={s.docTopRow}>
                  <Text style={s.docTitle} numberOfLines={1}>{doc.title}</Text>
                  <View style={[s.pill, { backgroundColor: doc.badgeBg }]}>
                    <Text style={[s.pillTxt, { color: doc.badgeColor }]}>{doc.badge}</Text>
                  </View>
                </View>
                <Text style={s.docSub}>{doc.sub}</Text>
                <View style={s.docFooter}>
                  <Text style={s.docMeta}>{doc.time}</Text>
                  <TouchableOpacity style={[s.actionChip, { backgroundColor: doc.actionBg, marginLeft: 'auto' }]}>
                    <FontAwesome5 name={doc.actionIcon} size={11} color={doc.actionColor} />
                    <Text style={[s.actionChipTxt, { color: doc.actionColor }]}>{doc.actionLabel}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:   { flexDirection: 'row', alignItems: 'center' },
  backBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  markAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  markAllTxt:  { fontSize: 11, fontWeight: '600', color: C.white },

  filterBar:          { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 52, flexGrow: 0 },
  filterTab:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:    { backgroundColor: C.primary },
  filterTabTxt:       { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive: { color: C.white },

  section: { paddingHorizontal: 16, paddingVertical: 18, backgroundColor: C.white, marginBottom: 2 },

  statCard:  { flex: 1, backgroundColor: C.white, borderRadius: 18, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1 },
  statIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statVal:   { fontSize: 22, fontWeight: '800', color: C.dark },
  statLabel: { fontSize: 11, color: C.g500, marginTop: 2, textAlign: 'center' },

  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  groupTitle:  { fontSize: 16, fontWeight: '800', color: C.dark },
  groupDate:   { fontSize: 12, color: C.g500, fontWeight: '500' },

  notifCard:       { backgroundColor: C.white, borderRadius: 16, padding: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 10 },
  notifCardUnread: { backgroundColor: '#EFF6FF' },
  notifIcon:       { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifTopRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  notifTime:       { fontSize: 11, color: C.g400 },
  notifTitle:      { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 4 },
  notifDesc:       { fontSize: 13, color: C.g600, lineHeight: 18, marginBottom: 10 },
  notifFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  unreadDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },

  pill:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillTxt:       { fontSize: 11, fontWeight: '700' },
  actionLink:    { fontSize: 13, fontWeight: '700' },
  actionChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  actionChipTxt: { fontSize: 11, fontWeight: '700' },

  avatarTiny: { width: 24, height: 24, borderRadius: 8 },
  avatarName: { fontSize: 12, color: C.g600, fontWeight: '500' },

  paymentCard:       { backgroundColor: C.white, borderRadius: 24, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: C.g100 },
  paymentTopRow:     { flexDirection: 'row', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.g100 },
  paymentStat:       { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  paymentIcon:       { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  paymentVal:        { fontSize: 22, fontWeight: '800', color: C.dark },
  paymentLabel:      { fontSize: 12, color: C.g600, fontWeight: '500', marginTop: 2 },
  paymentSub:        { fontSize: 11, fontWeight: '700', marginTop: 3 },
  paymentRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 14, padding: 12 },
  paymentRowIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  paymentRowInvoice: { fontSize: 13, fontWeight: '700', color: C.dark },
  paymentRowClient:  { fontSize: 11, color: C.g500, marginTop: 2 },
  paymentRowAmount:  { fontSize: 14, fontWeight: '800' },

  docCard:   { flexDirection: 'row', backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 10 },
  docIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  docTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  docTitle:  { fontSize: 13, fontWeight: '700', color: C.dark, flex: 1, marginRight: 8 },
  docSub:    { fontSize: 12, color: C.g600, marginBottom: 8 },
  docFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  docMeta:   { fontSize: 11, color: C.g400 },
});
