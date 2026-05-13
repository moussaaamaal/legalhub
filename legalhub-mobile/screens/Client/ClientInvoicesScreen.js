import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform,
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

const fmtCurrency = (amount, currency) =>
  `${currency || 'USD'} ${parseFloat(amount || 0).toFixed(2)}`;
const fmtCardNum = (v) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
const fmtExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function PaymentModal({ visible, invoice, onClose, onSuccess }) {
  const [step,        setStep]        = useState('choose');
  const [paying,      setPaying]      = useState(false);
  const [sadadResult, setSadadResult] = useState(null);
  const [cardNumber,  setCardNumber]  = useState('');
  const [cardName,    setCardName]    = useState('');
  const [expiry,      setExpiry]      = useState('');
  const [cvv,         setCvv]         = useState('');

  const reset = () => {
    setStep('choose'); setPaying(false); setSadadResult(null);
    setCardNumber(''); setCardName(''); setExpiry(''); setCvv('');
  };
  const handleClose = () => { reset(); onClose(); };

  const handleCardPay = async () => {
    if (!cardName.trim()) { Alert.alert('Required', 'Please enter the cardholder name.'); return; }
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 16) { Alert.alert('Invalid', 'Please enter a valid 16-digit card number.'); return; }
    const [expM, expY] = expiry.split('/');
    if (!expM || !expY || expY.length < 2) { Alert.alert('Invalid', 'Please enter a valid expiry date (MM/YY).'); return; }
    if (cvv.length < 3) { Alert.alert('Invalid', 'Please enter a valid CVV.'); return; }

    setPaying(true);
    try {
      await paymentsAPI.stripeCreate({
        invoice_id:  invoice.id,
        currency:    invoice.currency || 'USD',
        card_number: digits,
        card_name:   cardName.trim(),
        exp_month:   expM,
        exp_year:    expY,
        cvc:         cvv,
      });
      reset();
      onSuccess?.();
      Alert.alert('Payment Successful', 'Your payment has been processed successfully.');
    } catch (e) {
      Alert.alert('Payment Failed', e.message || 'An error occurred. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const handleSadadPay = async () => {
    setPaying(true);
    try {
      const result = await paymentsAPI.sadadInitiate({ invoice_id: invoice.id });
      setSadadResult(result);
      setStep('sadad_done');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to generate SADAD reference.');
    } finally {
      setPaying(false);
    }
  };

  if (!invoice) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '92%' }]}>
            <View style={s.modalHandle} />

            {/* Header row */}
            <View style={s.modalHeaderRow}>
              {step !== 'choose' ? (
                <TouchableOpacity onPress={() => setStep('choose')} style={s.modalNavBtn}>
                  <FontAwesome5 name="arrow-left" size={14} color={C.g500} />
                </TouchableOpacity>
              ) : <View style={s.modalNavBtn} />}
              <Text style={s.modalTitle}>
                {step === 'choose' ? 'Pay Invoice' : step === 'card' ? 'Card Payment' : 'SADAD Payment'}
              </Text>
              <TouchableOpacity onPress={handleClose} style={s.modalNavBtn}>
                <FontAwesome5 name="times" size={15} color={C.g400} />
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={s.amountBox}>
              <Text style={s.amountLabel}>Amount due</Text>
              <Text style={s.amountValue}>{fmtCurrency(invoice.total_amount, invoice.currency)}</Text>
              <Text style={s.amountInvNum}>{invoice.invoice_number}</Text>
            </View>

            {/* Step: choose */}
            {step === 'choose' && (
              <>
                <Text style={s.payMethodLabel}>Choose payment method</Text>
                <TouchableOpacity style={s.payMethodBtn} onPress={() => setStep('card')} activeOpacity={0.85}>
                  <View style={[s.payMethodIcon, { backgroundColor: '#635BFF18' }]}>
                    <FontAwesome5 name="credit-card" size={18} color="#635BFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={s.payMethodName}>Credit / Debit Card</Text>
                    <Text style={s.payMethodDesc}>Visa, Mastercard, AMEX</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
                </TouchableOpacity>
                <TouchableOpacity style={s.payMethodBtn} onPress={() => setStep('sadad')} activeOpacity={0.85}>
                  <View style={[s.payMethodIcon, { backgroundColor: C.green50 }]}>
                    <FontAwesome5 name="university" size={18} color={C.green600} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={s.payMethodName}>SADAD</Text>
                    <Text style={s.payMethodDesc}>Pay via Saudi bank</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Step: card */}
            {step === 'card' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.cardInputLabel}>Cardholder Name</Text>
                <TextInput style={s.cardInput} placeholder="Name on card" placeholderTextColor={C.g400}
                  value={cardName} onChangeText={setCardName} autoCapitalize="words" />

                <Text style={s.cardInputLabel}>Card Number</Text>
                <TextInput style={s.cardInput} placeholder="1234 5678 9012 3456" placeholderTextColor={C.g400}
                  value={cardNumber} onChangeText={v => setCardNumber(fmtCardNum(v))}
                  keyboardType="numeric" maxLength={19} />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardInputLabel}>Expiry</Text>
                    <TextInput style={s.cardInput} placeholder="MM/YY" placeholderTextColor={C.g400}
                      value={expiry} onChangeText={v => setExpiry(fmtExpiry(v))}
                      keyboardType="numeric" maxLength={5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardInputLabel}>CVV</Text>
                    <TextInput style={s.cardInput} placeholder="•••" placeholderTextColor={C.g400}
                      value={cvv} onChangeText={v => setCvv(v.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="numeric" secureTextEntry maxLength={4} />
                  </View>
                </View>

                <TouchableOpacity style={[s.payNowBtn, paying && { opacity: 0.7 }]} onPress={handleCardPay} disabled={paying}>
                  {paying
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.payNowBtnTxt}>Pay {fmtCurrency(invoice.total_amount, invoice.currency)}</Text>
                  }
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {/* Step: sadad */}
            {step === 'sadad' && (
              <>
                <View style={s.sadadInfo}>
                  <FontAwesome5 name="info-circle" size={14} color={C.primary} />
                  <Text style={s.sadadInfoTxt}>
                    We'll generate a SADAD bill reference. Pay via your bank app, ATM, or online banking.
                  </Text>
                </View>
                <TouchableOpacity style={[s.payNowBtn, paying && { opacity: 0.7 }]} onPress={handleSadadPay} disabled={paying}>
                  {paying
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.payNowBtnTxt}>Generate SADAD Bill</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Step: sadad_done */}
            {step === 'sadad_done' && sadadResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.sadadDoneBox}>
                  <FontAwesome5 name="check-circle" size={32} color={C.green600} />
                  <Text style={s.sadadDoneTitle}>SADAD Bill Generated</Text>
                  <Text style={s.sadadDoneSub}>Use the reference below to pay through your bank</Text>
                </View>
                <View style={s.billRefBox}>
                  <Text style={s.billRefLabel}>Bill Reference</Text>
                  <Text style={s.billRefNum}>{sadadResult.bill_reference}</Text>
                </View>
                {[
                  'Open your banking app or visit an ATM',
                  'Select "Bill Payment" or "SADAD"',
                  `Enter the reference: ${sadadResult.bill_reference}`,
                  `Pay ${sadadResult.currency || 'SAR'} ${sadadResult.amount?.toFixed(2) ?? '—'}`,
                ].map((txt, i) => (
                  <View key={i} style={s.sadadStep}>
                    <View style={s.sadadStepNum}><Text style={s.sadadStepNumTxt}>{i + 1}</Text></View>
                    <Text style={s.sadadStepTxt}>{txt}</Text>
                  </View>
                ))}
                <TouchableOpacity style={[s.payNowBtn, { backgroundColor: C.green600 }]} onPress={handleClose}>
                  <Text style={s.payNowBtnTxt}>Done</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:        { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  modalHandle:     { width: 40, height: 4, backgroundColor: C.g200, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalHeaderRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalNavBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  modalTitle:      { fontSize: 17, fontWeight: '800', color: C.dark },

  amountBox:       { backgroundColor: C.g50, borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: C.g100 },
  amountLabel:     { fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountValue:     { fontSize: 26, fontWeight: '800', color: C.dark },
  amountInvNum:    { fontSize: 12, color: C.g400, marginTop: 4 },

  payMethodLabel:  { fontSize: 13, fontWeight: '700', color: C.g500, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  payMethodBtn:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.g100 },
  payMethodIcon:   { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  payMethodName:   { fontSize: 14, fontWeight: '700', color: C.dark },
  payMethodDesc:   { fontSize: 12, color: C.g400, marginTop: 2 },

  cardInputLabel:  { fontSize: 12, fontWeight: '600', color: C.dark, marginBottom: 6, marginTop: 12 },
  cardInput:       { borderWidth: 1.5, borderColor: C.g200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.dark },

  payNowBtn:       { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  payNowBtnTxt:    { color: C.white, fontSize: 15, fontWeight: '800' },

  sadadInfo:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 16 },
  sadadInfoTxt:    { flex: 1, fontSize: 13, color: C.dark, lineHeight: 20 },

  sadadDoneBox:    { alignItems: 'center', paddingVertical: 20, gap: 8 },
  sadadDoneTitle:  { fontSize: 17, fontWeight: '800', color: C.dark },
  sadadDoneSub:    { fontSize: 13, color: C.g400, textAlign: 'center' },

  billRefBox:      { backgroundColor: C.g50, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.g200 },
  billRefLabel:    { fontSize: 11, color: C.g400, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  billRefNum:      { fontSize: 22, fontWeight: '800', color: C.primary, letterSpacing: 1 },

  sadadStep:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sadadStepNum:    { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sadadStepNumTxt: { color: C.white, fontSize: 12, fontWeight: '800' },
  sadadStepTxt:    { flex: 1, fontSize: 13, color: C.dark },

  cancelBtn:       { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelBtnTxt:    { fontSize: 14, fontWeight: '600', color: C.g500 },
});
