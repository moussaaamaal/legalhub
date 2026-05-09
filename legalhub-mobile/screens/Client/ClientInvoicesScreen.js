import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI } from '../../services/api';
import { paymentsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
};

// DRAFT is intentionally excluded — only visible to attorneys
const STATUS_CONFIG = {
  PENDING: { label: 'Pending', bg: C.amber50, color: C.amber600, accent: C.amber600  },
  OVERDUE: { label: 'Overdue', bg: C.red50,   color: C.red600,   accent: C.red600    },
  PAID:    { label: 'Paid',    bg: C.green50, color: C.green600, accent: C.green600  },
};

const FILTERS = ['ALL', 'PENDING', 'OVERDUE', 'PAID'];

function PaymentModal({ visible, invoice, onClose, onSuccess }) {
  const [paying, setPaying] = useState(false);
  const amount = invoice ? `${invoice.currency} ${parseFloat(invoice.total_amount).toFixed(2)}` : '';

  const handlePay = async (method) => {
    setPaying(true);
    try {
      if (method === 'STRIPE') {
        await paymentsAPI.stripeCreate({ invoice_id: invoice.id, amount: invoice.total_amount, currency: invoice.currency });
      } else {
        await paymentsAPI.sadadInitiate({ invoice_id: invoice.id, amount: invoice.total_amount });
      }
      onSuccess();
      Alert.alert('Payment Initiated', 'Your payment has been submitted successfully.');
    } catch (e) {
      Alert.alert('Payment Failed', e.message || 'Unable to process payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <View style={s.modalHandle} />

          <View style={s.modalHeader}>
            <View style={s.modalIconWrap}>
              <FontAwesome5 name="credit-card" size={22} color={C.primary} />
            </View>
            <Text style={s.modalTitle}>Pay Invoice</Text>
            <Text style={s.modalInvNum}>{invoice?.invoice_number}</Text>
          </View>

          <View style={s.amountBox}>
            <Text style={s.amountLabel}>Amount due</Text>
            <Text style={s.amountValue}>{amount}</Text>
          </View>

          <Text style={s.payMethodLabel}>Choose payment method</Text>

          <TouchableOpacity
            style={s.payMethodBtn}
            onPress={() => handlePay('STRIPE')}
            disabled={paying}
          >
            <View style={[s.payMethodIcon, { backgroundColor: '#635BFF18' }]}>
              <FontAwesome5 name="credit-card" size={18} color="#635BFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.payMethodName}>Credit / Debit Card</Text>
              <Text style={s.payMethodDesc}>Visa, Mastercard, AMEX</Text>
            </View>
            {paying ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.payMethodBtn}
            onPress={() => handlePay('SADAD')}
            disabled={paying}
          >
            <View style={[s.payMethodIcon, { backgroundColor: C.green50 }]}>
              <FontAwesome5 name="university" size={18} color={C.green600} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.payMethodName}>SADAD</Text>
              <Text style={s.payMethodDesc}>Pay via Saudi bank</Text>
            </View>
            {paying ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={paying}>
            <Text style={s.cancelBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function InvoiceCard({ inv, onPay, onPress }) {
  const st = STATUS_CONFIG[inv.status] || { label: inv.status, bg: C.g100, color: C.g500, accent: C.g400 };
  const issueDate = inv.issue_date
    ? new Date(inv.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const dueDate = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const isOverdue  = inv.status === 'OVERDUE';
  const isPending  = inv.status === 'PENDING';
  const isPaid     = inv.status === 'PAID';
  const canPay     = isOverdue || isPending;

  return (
    <TouchableOpacity style={[s.card, { borderLeftColor: st.accent }]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.invNumber}>{inv.invoice_number}</Text>
          <Text style={[s.invAmount, { color: isOverdue ? C.red600 : C.dark }]}>
            {inv.currency} {parseFloat(inv.total_amount).toFixed(2)}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: st.bg }]}>
          {isOverdue && <FontAwesome5 name="exclamation-triangle" size={10} color={st.color} style={{ marginRight: 4 }} />}
          {isPaid    && <FontAwesome5 name="check-circle" size={10} color={st.color} style={{ marginRight: 4 }} />}
          <Text style={[s.badgeTxt, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <View style={s.cardDates}>
        <View style={s.dateRow}>
          <FontAwesome5 name="calendar-plus" size={10} color={C.g400} />
          <Text style={s.dateLabel}> Issued: </Text>
          <Text style={s.dateVal}>{issueDate}</Text>
        </View>
        <View style={s.dateRow}>
          <FontAwesome5
            name={isOverdue ? 'exclamation-circle' : 'calendar-times'}
            size={10}
            color={isOverdue ? C.red600 : C.g400}
          />
          <Text style={[s.dateLabel, isOverdue && { color: C.red600 }]}> Due: </Text>
          <Text style={[s.dateVal, isOverdue && { color: C.red600, fontWeight: '700' }]}>{dueDate}</Text>
        </View>
      </View>

      {canPay && (
        <TouchableOpacity
          style={[s.payBtn, isOverdue && s.payBtnOverdue]}
          onPress={(e) => { e.stopPropagation?.(); onPay(inv); }}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="credit-card" size={13} color={C.white} />
          <Text style={s.payBtnTxt}>Pay Now</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function ClientInvoicesScreen({ navigation }) {
  const [invoices, setInvoices]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('ALL');
  const [payingInvoice, setPayingInvoice] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await clientPortalAPI.invoices();
      // Filter out DRAFT invoices — clients should never see draft invoices
      setInvoices((data || []).filter(i => i.status !== 'DRAFT'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter === 'ALL'
    ? invoices
    : invoices.filter(i => i.status === filter);

  const totalPending = invoices
    .filter(i => ['PENDING', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + parseFloat(i.total_amount || 0), 0);

  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;

  const handlePaySuccess = () => {
    setPayingInvoice(null);
    load();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>My Invoices</Text>
          <Text style={s.headerSub}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total</Text>
        </View>
      </View>

      {/* Summary card */}
      {totalPending > 0 && (
        <View style={[s.summaryCard, overdueCount > 0 && s.summaryCardOverdue]}>
          <View style={[s.summaryIconWrap, { backgroundColor: C.white }]}>
            <FontAwesome5 name="file-invoice-dollar" size={20} color={overdueCount > 0 ? C.red600 : C.amber600} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[s.summaryLabel, { color: overdueCount > 0 ? C.red600 : C.amber600 }]}>
              {overdueCount > 0
                ? `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}`
                : 'Pending payment'}
            </Text>
            <Text style={[s.summaryAmount, { color: overdueCount > 0 ? C.red600 : C.amber600 }]}>
              ${totalPending.toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, filter === f && s.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.chipTxt, filter === f && s.chipTxtActive]}>
              {f === 'ALL' ? 'All' : STATUS_CONFIG[f]?.label || f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
        >
          {displayed.length === 0 ? (
            <View style={s.emptyBox}>
              <View style={s.emptyIconWrap}>
                <FontAwesome5 name="file-invoice" size={28} color={C.g400} />
              </View>
              <Text style={s.emptyTitle}>No invoices</Text>
              <Text style={s.emptyTxt}>
                {filter !== 'ALL' ? `No ${STATUS_CONFIG[filter]?.label?.toLowerCase()} invoices` : 'Your invoices will appear here'}
              </Text>
            </View>
          ) : (
            displayed.map((inv) => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                onPay={(i) => setPayingInvoice(i)}
                onPress={() => navigation.navigate('ClientInvoiceDetail', { invoiceId: inv.id })}
              />
            ))
          )}
        </ScrollView>
      )}

      <PaymentModal
        visible={!!payingInvoice}
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onSuccess={handlePaySuccess}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.amber50, marginHorizontal: 16, marginVertical: 12,
    borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.amber100,
  },
  summaryCardOverdue: { backgroundColor: C.red50, borderColor: C.red100 },
  summaryIconWrap:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryLabel:       { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  summaryAmount:      { fontSize: 22, fontWeight: '800' },

  filterScroll:  { maxHeight: 52, backgroundColor: C.white, borderBottomWidth: 1, borderColor: C.g100, flexGrow: 0 },
  chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.g100, marginVertical: 8 },
  chipActive:    { backgroundColor: C.primary },
  chipTxt:       { fontSize: 12, fontWeight: '600', color: C.g500 },
  chipTxtActive: { color: C.white },

  card: {
    backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.g100, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  invNumber:  { fontSize: 12, color: C.g400, fontWeight: '600', marginBottom: 4 },
  invAmount:  { fontSize: 24, fontWeight: '800' },
  badge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeTxt:   { fontSize: 11, fontWeight: '700' },
  cardDates:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  dateRow:    { flexDirection: 'row', alignItems: 'center' },
  dateLabel:  { fontSize: 12, color: C.g400 },
  dateVal:    { fontSize: 12, color: C.g500 },

  payBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 12 },
  payBtnOverdue:  { backgroundColor: C.red600 },
  payBtnTxt:      { fontSize: 14, fontWeight: '700', color: C.white },

  emptyBox:      { alignItems: 'center', paddingVertical: 64 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 6 },
  emptyTxt:      { fontSize: 13, color: C.g400, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  modalHandle:  { width: 40, height: 4, backgroundColor: C.g200, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { alignItems: 'center', marginBottom: 20 },
  modalIconWrap:{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 4 },
  modalInvNum:  { fontSize: 13, color: C.g400, fontWeight: '600' },

  amountBox:    { backgroundColor: C.g50, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.g100 },
  amountLabel:  { fontSize: 12, color: C.g400, fontWeight: '600', marginBottom: 4 },
  amountValue:  { fontSize: 28, fontWeight: '800', color: C.dark },

  payMethodLabel:{ fontSize: 13, fontWeight: '700', color: C.g600, marginBottom: 12 },
  payMethodBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.g100 },
  payMethodIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  payMethodName: { fontSize: 14, fontWeight: '700', color: C.dark },
  payMethodDesc: { fontSize: 12, color: C.g400, marginTop: 2 },

  cancelBtn:    { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelBtnTxt: { fontSize: 14, fontWeight: '600', color: C.g500 },
});
