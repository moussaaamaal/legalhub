import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, RefreshControl, Linking, Share,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { billingAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo600: '#4F46E5',
};

const STATUS_META = {
  DRAFT:     { label: 'Draft',     color: C.g500,      bg: C.g100,    border: C.g400    },
  PENDING:   { label: 'Pending',   color: C.amber600,  bg: C.amber50, border: C.amber600 },
  PAID:      { label: 'Paid',      color: C.green600,  bg: C.green50, border: C.green600 },
  OVERDUE:   { label: 'Overdue',   color: C.red600,    bg: C.red50,   border: C.red600   },
  CANCELLED: { label: 'Cancelled', color: C.g400,      bg: C.g100,    border: C.g400    },
};

const FILTER_TABS = [
  { label: 'All',      key: 'ALL'      },
  { label: 'Pending',  key: 'PENDING'  },
  { label: 'Overdue',  key: 'OVERDUE'  },
  { label: 'Paid',     key: 'PAID'     },
  { label: 'Draft',    key: 'DRAFT'    },
];

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function AvatarInitials({ name, size = 36 }) {
  const colors = [C.primary, C.purple600, C.green600, C.amber600, C.red600];
  const bg = colors[Math.abs((name?.charCodeAt(0) || 65) - 65) % colors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontWeight: '800', fontSize: size * 0.33 }}>{getInitials(name)}</Text>
    </View>
  );
}

function fmt(amount, currency = 'USD') {
  if (amount == null) return '—';
  return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDateStr); due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - due) / 86400000));
}

function InvoiceCard({ inv, onRemind, onSend, onViewDetails }) {
  const status  = (inv.status || 'DRAFT').toUpperCase();
  const meta    = STATUS_META[status] || STATUS_META.DRAFT;
  const client  = inv.client;
  const clientName = client
    ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
    : 'Unknown Client';
  const daysOverdue = status === 'OVERDUE' ? getDaysOverdue(inv.due_date) : 0;
  const [sending, setSending] = useState(false);

  const handleRemind = () => {
    Alert.alert(
      'Send Payment Reminder',
      `Send a payment reminder to ${clientName} for invoice ${inv.invoice_number || inv.id?.slice(0, 8)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              await onRemind(inv.id);
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(inv.id);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.card, { borderLeftColor: meta.border }]}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <View style={[s.idBadge, { backgroundColor: meta.bg }]}>
              <Text style={[s.idText, { color: meta.color }]}>{inv.invoice_number || inv.id?.slice(0, 8)}</Text>
            </View>
            <View style={[s.pill, { backgroundColor: meta.bg }]}>
              <Text style={[s.pillText, { color: meta.color }]}>
                {status === 'OVERDUE' && daysOverdue > 0 ? `${daysOverdue}d overdue` : meta.label}
              </Text>
            </View>
          </View>
          <Text style={s.cardTitle} numberOfLines={1}>
            {inv.invoice_item?.length > 0
              ? inv.invoice_item[0].description
              : `Invoice ${inv.invoice_number || ''}`}
          </Text>
        </View>
      </View>

      {/* Client row */}
      <View style={s.clientRow}>
        <AvatarInitials name={clientName} size={32} />
        <View style={{ marginLeft: 8 }}>
          <Text style={s.clientName}>{clientName}</Text>
          {!!client?.email && (
            <Text style={s.clientRole} numberOfLines={1}>{client.email}</Text>
          )}
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statLabel}>Amount</Text>
          <Text style={[s.statVal, { color: C.dark }]}>{fmt(inv.total_amount, inv.currency)}</Text>
        </View>
        <View style={[s.statItem, s.statBordered]}>
          <Text style={s.statLabel}>Due Date</Text>
          <Text style={[s.statVal, { color: meta.color }]}>{fmtDate(inv.due_date)}</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statLabel}>Status</Text>
          <Text style={[s.statVal, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {status === 'OVERDUE' && (
          <TouchableOpacity
            style={[s.btnMain, { backgroundColor: C.red600, flex: 1 }]}
            onPress={handleRemind}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={C.white} />
              : <><FontAwesome5 name="paper-plane" size={12} color={C.white} /><Text style={s.btnMainText}>Send Reminder</Text></>
            }
          </TouchableOpacity>
        )}
        {status === 'DRAFT' && (
          <TouchableOpacity
            style={[s.btnMain, { backgroundColor: C.primary, flex: 1 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={C.white} />
              : <><FontAwesome5 name="paper-plane" size={12} color={C.white} /><Text style={s.btnMainText}>Send Invoice</Text></>
            }
          </TouchableOpacity>
        )}
        {(status === 'PENDING' || status === 'PAID') && (
          <TouchableOpacity
            style={[s.btnMain, { backgroundColor: C.primary, flex: 1 }]}
            onPress={() => onViewDetails?.(inv)}
          >
            <FontAwesome5 name="eye" size={12} color={C.white} />
            <Text style={s.btnMainText}>View Details</Text>
          </TouchableOpacity>
        )}
        {/* Email client */}
        {!!client?.email && (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.purple50 }]}
            onPress={() => Linking.openURL(`mailto:${client.email}`)}
          >
            <FontAwesome5 name="envelope" size={14} color={C.purple600} />
          </TouchableOpacity>
        )}
        {/* Send reminder for PENDING too */}
        {status === 'PENDING' && (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.amber50 }]}
            onPress={handleRemind}
            disabled={sending}
          >
            <FontAwesome5 name="bell" size={14} color={C.amber600} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function InvoicesManagementScreen({ navigation }) {
  const [activeFilter,  setActiveFilter]  = useState(0);
  const [invoices,      setInvoices]      = useState([]);
  const [analytics,     setAnalytics]     = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [invData, kpis] = await Promise.all([
        billingAPI.listInvoices(),
        billingAPI.getAnalytics(),
      ]);
      setInvoices(invData || []);
      setAnalytics(kpis);
    } catch (e) {
      if (!isRefresh) Alert.alert('Error', e.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemind = useCallback(async (id) => {
    try {
      await billingAPI.sendReminder(id);
      Alert.alert('Reminder Sent', 'The payment reminder has been sent to the client.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send reminder');
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (invoices.length === 0) {
      Alert.alert('No Data', 'There are no invoices to export.');
      return;
    }
    const lines = [
      'Invoice #,Client,Status,Amount,Currency,Issue Date,Due Date',
      ...invoices.map(inv => {
        const client = inv.client;
        const clientName = client
          ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
          : 'Unknown';
        return [
          inv.invoice_number || inv.id?.slice(0, 8),
          `"${clientName}"`,
          inv.status,
          inv.total_amount != null ? parseFloat(inv.total_amount).toFixed(2) : '0.00',
          inv.currency || 'USD',
          inv.issue_date || '',
          inv.due_date || '',
        ].join(',');
      }),
    ];
    try {
      await Share.share({
        title: 'Invoices Export',
        message: lines.join('\n'),
      });
    } catch {
      Alert.alert('Error', 'Could not open share sheet.');
    }
  }, [invoices]);

  const handleSend = useCallback(async (id) => {
    try {
      await billingAPI.sendInvoice(id);
      Alert.alert('Invoice Sent', 'The invoice has been sent to the client.');
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'PENDING' } : inv));
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send invoice');
    }
  }, []);

  const tabKey = FILTER_TABS[activeFilter].key;
  const q      = search.toLowerCase();

  const filtered = invoices.filter(inv => {
    if (tabKey !== 'ALL' && inv.status !== tabKey) return false;
    if (!q) return true;
    const client = inv.client;
    const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}` : '';
    return (inv.invoice_number || '').toLowerCase().includes(q) ||
           clientName.toLowerCase().includes(q);
  });

  const countFor = (key) => key === 'ALL'
    ? invoices.length
    : invoices.filter(i => i.status === key).length;

  const fmt2 = (n) => n != null ? `${parseFloat(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';

  const statsCards = [
    {
      icon: 'check-circle', iconColor: C.green600, iconBg: C.green100,
      badge: 'Paid', badgeColor: C.green600, badgeBg: C.green50,
      value: analytics ? fmt2(analytics.total_revenue) : '—',
      label: 'Revenue Collected',
    },
    {
      icon: 'clock', iconColor: C.amber600, iconBg: C.amber100,
      badge: 'Pending', badgeColor: C.amber600, badgeBg: C.amber50,
      value: analytics ? fmt2(analytics.outstanding) : '—',
      label: 'Awaiting Payment',
    },
    {
      icon: 'exclamation-triangle', iconColor: C.red600, iconBg: C.red100,
      badge: 'Urgent', badgeColor: C.red600, badgeBg: C.red50,
      value: analytics ? fmt2(analytics.overdue) : '—',
      label: 'Overdue',
    },
    {
      icon: 'percentage', iconColor: C.primary, iconBg: C.blue100,
      badge: 'Rate', badgeColor: C.blue600, badgeBg: C.blue50,
      value: analytics ? `${analytics.collection_rate ?? 0}%` : '—',
      label: 'Collection Rate',
    },
  ];

  const outstanding    = analytics?.outstanding ?? 0;
  const overdueAmount  = analytics?.overdue ?? 0;
  const pendingCount   = countFor('PENDING');
  const overdueCount   = countFor('OVERDUE');

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
            <Text style={s.headerTitle}>Invoice Management</Text>
            <Text style={s.headerSub}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {overdueCount} overdue</Text>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.navigate?.('Invoice')}>
            <FontAwesome5 name="plus" size={16} color={C.white} />
          </TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <FontAwesome5 name="search" size={14} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by invoice # or client..."
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
        {/* STATS GRID */}
        <View style={s.section}>
          <View style={s.statsGrid}>
            {statsCards.map((st, i) => (
              <View key={i} style={s.statCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={[s.statIcon, { backgroundColor: st.iconBg }]}>
                    <FontAwesome5 name={st.icon} size={16} color={st.iconColor} />
                  </View>
                  <View style={[s.pill, { backgroundColor: st.badgeBg }]}>
                    <Text style={[s.pillText, { color: st.badgeColor }]}>{st.badge}</Text>
                  </View>
                </View>
                <Text style={s.statBigVal}>{st.value}</Text>
                <Text style={s.statSmLabel}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Outstanding banner */}
          <View style={s.outCard}>
            <View>
              <Text style={s.outLabel}>Total Outstanding</Text>
              <Text style={s.outValue}>{fmt2(outstanding + overdueAmount)}</Text>
              <Text style={s.outSub}>{pendingCount + overdueCount} invoice{pendingCount + overdueCount !== 1 ? 's' : ''} unpaid</Text>
            </View>
            <View style={s.outIconWrap}>
              <FontAwesome5 name="chart-line" size={24} color={C.white} />
            </View>
          </View>
        </View>

        {/* QUICK ACTIONS */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { marginBottom: 12 }]}>Quick Actions</Text>
          {/* Row 1: Create + Export */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {[
              { icon: 'plus',     label: 'Create', sub: 'New Invoice',  color: C.primary,   onPress: () => navigation?.navigate?.('Invoice') },
              { icon: 'download', label: 'Export', sub: 'CSV / Share',  color: C.purple600, onPress: handleExport },
            ].map((qa, i) => (
              <TouchableOpacity key={i} style={[s.qaCard, { backgroundColor: qa.color, flex: 1 }]} onPress={qa.onPress}>
                <View style={s.qaIconWrap}>
                  <FontAwesome5 name={qa.icon} size={22} color={C.white} />
                </View>
                <View>
                  <Text style={s.qaLabel}>{qa.label}</Text>
                  <Text style={s.qaSub}>{qa.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {/* Row 2: Reminders full width */}
          <TouchableOpacity
            style={[s.qaCard, { backgroundColor: C.red600, width: '100%' }]}
            onPress={() => {
              const overdue = invoices.filter(i => i.status === 'OVERDUE');
              if (overdue.length === 0) { Alert.alert('No Overdue', 'There are no overdue invoices.'); return; }
              Alert.alert('Send Reminders', `Send reminders to ${overdue.length} overdue client${overdue.length > 1 ? 's' : ''}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send All', onPress: () => overdue.forEach(i => handleRemind(i.id)) },
              ]);
            }}
          >
            <View style={s.qaIconWrap}>
              <FontAwesome5 name="paper-plane" size={22} color={C.white} />
            </View>
            <View>
              <Text style={s.qaLabel}>Reminders</Text>
              <Text style={s.qaSub}>Send to all overdue clients</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* FILTER TABS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterBar}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
        >
          {FILTER_TABS.map((t, i) => {
            const count = countFor(t.key);
            return (
              <TouchableOpacity
                key={i}
                style={[s.filterTab, activeFilter === i && s.filterTabActive]}
                onPress={() => setActiveFilter(i)}
              >
                <Text style={[s.filterTabTxt, activeFilter === i && s.filterTabTxtActive]}>{t.label}</Text>
                <View style={[s.filterBadge, activeFilter === i && s.filterBadgeActive]}>
                  <Text style={[s.filterBadgeTxt, activeFilter === i && s.filterBadgeTxtActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* INVOICE LIST */}
        <View style={[s.section, { backgroundColor: tabKey === 'OVERDUE' ? '#FFF8F8' : tabKey === 'PENDING' ? C.amber50 : C.g50 }]}>
          <View style={s.sHRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.sIconWrap, {
                backgroundColor: tabKey === 'OVERDUE' ? C.red100 : tabKey === 'PENDING' ? C.amber100 : tabKey === 'PAID' ? C.green100 : C.blue100,
              }]}>
                <FontAwesome5
                  name={tabKey === 'OVERDUE' ? 'exclamation-triangle' : tabKey === 'PAID' ? 'check-circle' : 'file-invoice-dollar'}
                  size={13}
                  color={tabKey === 'OVERDUE' ? C.red600 : tabKey === 'PAID' ? C.green600 : tabKey === 'PENDING' ? C.amber600 : C.primary}
                />
              </View>
              <Text style={s.sectionTitle}>
                {tabKey === 'ALL' ? 'All Invoices' : `${FILTER_TABS[activeFilter].label} Invoices`}
              </Text>
            </View>
            <Text style={s.sectionCount}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <FontAwesome5 name="file-invoice-dollar" size={32} color={C.g400} />
              <Text style={s.emptyTitle}>No invoices found</Text>
              <Text style={s.emptySub}>{search ? 'Try a different search term' : 'Create your first invoice'}</Text>
            </View>
          ) : (
            filtered.map(inv => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                onRemind={handleRemind}
                onSend={handleSend}
                onViewDetails={(i) => navigation?.navigate?.('InvoiceDetails', { invoice: i })}
              />
            ))
          )}
        </View>
      </ScrollView>


    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.primary },
  scroll:     { flex: 1, backgroundColor: C.g50 },
  header:     { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:  { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  searchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput:{ flex: 1, color: C.white, fontSize: 13 },

  section:    { paddingHorizontal: 16, paddingVertical: 18, backgroundColor: C.white, marginBottom: 2 },
  sHRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ fontSize: 16, fontWeight: '800', color: C.dark },
  sectionCount:{ fontSize: 13, color: C.g500 },

  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard:   { width: '47.5%', backgroundColor: C.white, borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.g100 },
  statIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statBigVal: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 2 },
  statSmLabel:{ fontSize: 11, color: C.g500 },

  outCard:    { backgroundColor: C.indigo600, borderRadius: 18, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  outLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  outValue:   { fontSize: 30, fontWeight: '800', color: C.white },
  outSub:     { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  outIconWrap:{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  qaGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  qaCard:     { width: '47.5%', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  qaIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  qaLabel:    { fontSize: 14, fontWeight: '700', color: C.white },
  qaSub:      { fontSize: 11, color: 'rgba(255,255,255,0.72)' },

  filterBar:      { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 56, flexGrow: 0 },
  filterTab:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:{ backgroundColor: C.primary },
  filterTabTxt:   { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive: { color: C.white },
  filterBadge:    { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: C.g200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterBadgeActive:  { backgroundColor: 'rgba(255,255,255,0.3)' },
  filterBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.g600 },
  filterBadgeTxtActive: { color: C.white },

  card:       { backgroundColor: C.white, borderRadius: 16, padding: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 2, marginBottom: 10 },
  idBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  idText:     { fontSize: 11, fontWeight: '700' },
  pill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillText:   { fontSize: 11, fontWeight: '600' },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  clientRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.g100, marginVertical: 10 },
  clientName: { fontSize: 12, fontWeight: '700', color: C.dark },
  clientRole: { fontSize: 11, color: C.g400 },
  statsRow:   { flexDirection: 'row', marginBottom: 12 },
  statItem:   { flex: 1, alignItems: 'center' },
  statBordered:{ borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.g100 },
  statLabel:  { fontSize: 11, color: C.g500, marginBottom: 2 },
  statVal:    { fontSize: 14, fontWeight: '700' },
  btnMain:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  btnMainText:{ color: C.white, fontSize: 13, fontWeight: '700' },
  iconBtn:    { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  emptyBox:   { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.dark },
  emptySub:   { fontSize: 13, color: C.g500, textAlign: 'center' },

});
