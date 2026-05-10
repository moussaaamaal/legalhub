import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI, paymentsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  red50: '#FEF2F2', red600: '#DC2626',
};

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: C.amber600, bg: C.amber50, icon: 'clock'         },
  OVERDUE:  { label: 'Overdue',  color: C.red600,   bg: C.red50,   icon: 'exclamation-circle' },
  PAID:     { label: 'Paid',     color: C.green600, bg: C.green50, icon: 'check-circle'  },
  SENT:     { label: 'Sent',     color: C.primary,  bg: C.blue50,  icon: 'paper-plane'   },
  DEFAULT:  { label: 'Unknown',  color: C.g500,     bg: C.g100,    icon: 'file-invoice'  },
};

function formatCurrency(amount, currency = 'USD') {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatCardNumber(val) {
  return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(val) {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

function PaymentModal({ visible, invoice, onClose }) {
  const [step, setStep]             = useState('choose');
  const [paying, setPaying]         = useState(false);
  const [sadadResult, setSadadResult] = useState(null);

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName]     = useState('');
  const [expiry, setExpiry]         = useState('');
  const [cvv, setCvv]               = useState('');

  const reset = () => {
    setStep('choose'); setPaying(false); setSadadResult(null);
    setCardNumber(''); setCardName(''); setExpiry(''); setCvv('');
  };

  const handleClose = (success = false) => { reset(); onClose(success); };

  const handleCardPay = async () => {
    if (!cardName.trim()) { Alert.alert('Required', 'Please enter the cardholder name.'); return; }
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 16) { Alert.alert('Invalid', 'Please enter a valid 16-digit card number.'); return; }
    const [expM, expY] = expiry.split('/');
    if (!expM || !expY || expM.length < 2 || expY.length < 2) { Alert.alert('Invalid', 'Please enter a valid expiry date (MM/YY).'); return; }
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
      handleClose(true);
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
      Alert.alert('Error', e.message || 'Failed to generate SADAD reference. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (!invoice) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => handleClose(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={ps.overlay}>
          <View style={ps.sheet}>
            <View style={ps.handle} />

            <View style={ps.header}>
              {step !== 'choose' && (
                <TouchableOpacity onPress={() => setStep('choose')} style={ps.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={C.g500} />
                </TouchableOpacity>
              )}
              <Text style={ps.title}>
                {step === 'choose' ? 'Pay Invoice' : step === 'card' ? 'Card Payment' : 'SADAD Payment'}
              </Text>
              <TouchableOpacity onPress={() => handleClose(false)} style={ps.closeBtn}>
                <Ionicons name="close" size={20} color={C.g500} />
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={ps.amountBox}>
              <Text style={ps.amountLabel}>Amount Due</Text>
              <Text style={ps.amountValue}>{formatCurrency(invoice.total_amount, invoice.currency)}</Text>
              <Text style={ps.invoiceRef}>{invoice.invoice_number || `#${invoice.id}`}</Text>
            </View>

            {step === 'choose' && (
              <>
                <Text style={ps.methodLabel}>Choose Payment Method</Text>
                <TouchableOpacity style={ps.methodBtn} onPress={() => setStep('card')} activeOpacity={0.85}>
                  <View style={ps.methodIcon}>
                    <FontAwesome5 name="credit-card" size={20} color={C.primary} />
                  </View>
                  <View style={ps.methodInfo}>
                    <Text style={ps.methodName}>Card (Stripe)</Text>
                    <Text style={ps.methodDesc}>Visa, Mastercard, AMEX</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={13} color={C.g400} />
                </TouchableOpacity>
                <TouchableOpacity style={ps.methodBtn} onPress={() => setStep('sadad')} activeOpacity={0.85}>
                  <View style={[ps.methodIcon, { backgroundColor: C.green50 }]}>
                    <FontAwesome5 name="university" size={20} color={C.green600} />
                  </View>
                  <View style={ps.methodInfo}>
                    <Text style={ps.methodName}>SADAD</Text>
                    <Text style={ps.methodDesc}>Bank transfer (Saudi Arabia)</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={13} color={C.g400} />
                </TouchableOpacity>
              </>
            )}

            {step === 'card' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Card visual */}
                <View style={ps.cardVisual}>
                  <View style={ps.cardChip}>
                    <View style={ps.cardChipInner} />
                  </View>
                  <Text style={ps.cardNumberDisplay}>
                    {cardNumber || '•••• •••• •••• ••••'}
                  </Text>
                  <View style={ps.cardBottom}>
                    <View>
                      <Text style={ps.cardFieldLabel}>CARDHOLDER</Text>
                      <Text style={ps.cardFieldValue}>{cardName || '—'}</Text>
                    </View>
                    <View>
                      <Text style={ps.cardFieldLabel}>EXPIRES</Text>
                      <Text style={ps.cardFieldValue}>{expiry || 'MM/YY'}</Text>
                    </View>
                  </View>
                </View>

                <Text style={ps.inputLabel}>Cardholder Name</Text>
                <TextInput style={ps.input} placeholder="Name on card" placeholderTextColor={C.g400} value={cardName} onChangeText={setCardName} autoCapitalize="words" />

                <Text style={ps.inputLabel}>Card Number</Text>
                <TextInput style={ps.input} placeholder="1234 5678 9012 3456" placeholderTextColor={C.g400} value={cardNumber} onChangeText={v => setCardNumber(formatCardNumber(v))} keyboardType="numeric" maxLength={19} />

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={ps.inputLabel}>Expiry Date</Text>
                    <TextInput style={ps.input} placeholder="MM/YY" placeholderTextColor={C.g400} value={expiry} onChangeText={v => setExpiry(formatExpiry(v))} keyboardType="numeric" maxLength={5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ps.inputLabel}>CVV</Text>
                    <TextInput style={ps.input} placeholder="•••" placeholderTextColor={C.g400} value={cvv} onChangeText={v => setCvv(v.replace(/\D/g, '').slice(0, 4))} keyboardType="numeric" secureTextEntry maxLength={4} />
                  </View>
                </View>

                <TouchableOpacity style={[ps.payBtn, paying && { opacity: 0.7 }]} onPress={handleCardPay} disabled={paying} activeOpacity={0.85}>
                  {paying ? <ActivityIndicator size="small" color={C.white} /> : <Text style={ps.payBtnTxt}>Pay {formatCurrency(invoice.total_amount, invoice.currency)}</Text>}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            )}

            {step === 'sadad' && (
              <>
                <View style={ps.sadadInfo}>
                  <FontAwesome5 name="info-circle" size={16} color={C.primary} style={{ marginRight: 10 }} />
                  <Text style={ps.sadadInfoTxt}>
                    We'll generate a SADAD bill reference. Pay using your bank app, ATM, or online banking.
                  </Text>
                </View>
                <TouchableOpacity style={[ps.payBtn, paying && { opacity: 0.7 }]} onPress={handleSadadPay} disabled={paying} activeOpacity={0.85}>
                  {paying ? <ActivityIndicator size="small" color={C.white} /> : <Text style={ps.payBtnTxt}>Generate SADAD Bill</Text>}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </>
            )}

            {step === 'sadad_done' && sadadResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={ps.sadadDoneBox}>
                  <View style={ps.sadadDoneIcon}>
                    <FontAwesome5 name="check-circle" size={28} color={C.green600} />
                  </View>
                  <Text style={ps.sadadDoneTitle}>SADAD Bill Generated</Text>
                  <Text style={ps.sadadDoneSub}>Use the reference below to pay through your bank</Text>
                </View>

                <View style={ps.billRefBox}>
                  <Text style={ps.billRefLabel}>Bill Reference</Text>
                  <Text style={ps.billRefNumber}>{sadadResult.bill_reference}</Text>
                </View>

                <View style={ps.sadadSteps}>
                  {[
                    'Open your banking app or visit an ATM',
                    'Select "Bill Payment" or "SADAD"',
                    `Enter the reference: ${sadadResult.bill_reference}`,
                    `Pay SAR ${sadadResult.amount?.toFixed(2) ?? '—'}`,
                  ].map((step, i) => (
                    <View key={i} style={ps.sadadStep}>
                      <View style={ps.sadadStepNum}><Text style={ps.sadadStepNumTxt}>{i + 1}</Text></View>
                      <Text style={ps.sadadStepTxt}>{step}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={[ps.payBtn, { backgroundColor: C.green600 }]} onPress={() => handleClose(false)} activeOpacity={0.85}>
                  <Text style={ps.payBtnTxt}>Done</Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ClientInvoiceDetailScreen({ route, navigation }) {
  const { invoiceId } = route.params;
  const [invoice, setInvoice]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [payModal, setPayModal]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await clientPortalAPI.invoiceDetail(invoiceId);
      setInvoice(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [invoiceId]);

  const st = STATUS_CONFIG[invoice?.status] || STATUS_CONFIG.DEFAULT;
  const canPay = invoice && ['PENDING', 'OVERDUE', 'SENT'].includes(invoice.status);

  const handlePayClose = (success) => {
    setPayModal(false);
    if (success) load();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {invoice?.invoice_number || 'Invoice'}
          </Text>
          {invoice?.issue_date ? (
            <Text style={s.headerSub}>Issued {formatDate(invoice.issue_date)}</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : !invoice ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="file-invoice" size={28} color={C.g400} />
          </View>
          <Text style={{ color: C.g500, fontSize: 15, fontWeight: '600', marginTop: 8 }}>Invoice not found</Text>
        </View>
      ) : (
        <>
          <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: canPay ? 110 : 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Status Banner */}
            <View style={[s.statusBanner, { backgroundColor: st.bg, borderColor: st.color + '30' }]}>
              <View style={[s.statusIcon, { backgroundColor: st.color + '20' }]}>
                <FontAwesome5 name={st.icon} size={16} color={st.color} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={[s.statusLabel, { color: st.color }]}>{st.label}</Text>
                {invoice.due_date && (
                  <Text style={[s.statusSub, { color: st.color }]}>
                    Due {formatDate(invoice.due_date)}
                  </Text>
                )}
              </View>
            </View>

            {/* Total Amount */}
            <View style={s.amountCard}>
              <Text style={s.amountLabelCard}>Total Amount</Text>
              <Text style={s.amountValueCard}>{formatCurrency(invoice.total_amount, invoice.currency)}</Text>
            </View>

            {/* Line Items */}
            {invoice.items?.length > 0 && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.cardIconWrap}><FontAwesome5 name="list" size={13} color={C.primary} /></View>
                  <Text style={s.cardTitle}>Services</Text>
                </View>
                {invoice.items.map((item, i) => (
                  <View key={i} style={[s.lineItem, i > 0 && { borderTopWidth: 1, borderTopColor: C.g100, paddingTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineDesc}>{item.description || `Service ${i + 1}`}</Text>
                      {item.quantity != null && item.unit_price != null && (
                        <Text style={s.lineQty}>
                          {item.quantity} × {formatCurrency(item.unit_price, invoice.currency)}
                        </Text>
                      )}
                    </View>
                    <Text style={s.lineAmount}>
                      {formatCurrency(item.amount ?? (item.quantity * item.unit_price), invoice.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Totals breakdown */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}><FontAwesome5 name="calculator" size={13} color={C.primary} /></View>
                <Text style={s.cardTitle}>Summary</Text>
              </View>
              {invoice.subtotal != null && (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Subtotal</Text>
                  <Text style={s.summaryValue}>{formatCurrency(invoice.subtotal, invoice.currency)}</Text>
                </View>
              )}
              {invoice.tax_amount != null && invoice.tax_amount > 0 && (
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Tax {invoice.tax_rate ? `(${invoice.tax_rate}%)` : ''}</Text>
                  <Text style={s.summaryValue}>{formatCurrency(invoice.tax_amount, invoice.currency)}</Text>
                </View>
              )}
              {invoice.discount_amount != null && invoice.discount_amount > 0 && (
                <View style={s.summaryRow}>
                  <Text style={[s.summaryLabel, { color: C.green600 }]}>Discount</Text>
                  <Text style={[s.summaryValue, { color: C.green600 }]}>−{formatCurrency(invoice.discount_amount, invoice.currency)}</Text>
                </View>
              )}
              <View style={[s.summaryRow, s.summaryTotal]}>
                <Text style={s.summaryTotalLabel}>Total</Text>
                <Text style={s.summaryTotalValue}>{formatCurrency(invoice.total_amount, invoice.currency)}</Text>
              </View>
            </View>

            {/* Billing info */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}><FontAwesome5 name="info-circle" size={13} color={C.primary} /></View>
                <Text style={s.cardTitle}>Details</Text>
              </View>
              {!!invoice.invoice_number && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Invoice #</Text>
                  <Text style={s.infoValue}>{invoice.invoice_number}</Text>
                </View>
              )}
              {!!invoice.issue_date && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Issue Date</Text>
                  <Text style={s.infoValue}>{formatDate(invoice.issue_date)}</Text>
                </View>
              )}
              {!!invoice.due_date && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Due Date</Text>
                  <Text style={[s.infoValue, invoice.status === 'OVERDUE' && { color: C.red600 }]}>
                    {formatDate(invoice.due_date)}
                  </Text>
                </View>
              )}
              {!!invoice.case_title && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Case</Text>
                  <Text style={s.infoValue} numberOfLines={2}>{invoice.case_title}</Text>
                </View>
              )}
              {!!invoice.notes && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Notes</Text>
                  <Text style={s.infoValue}>{invoice.notes}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Pay Button */}
          {canPay && (
            <View style={s.payBar}>
              <TouchableOpacity style={[s.payBtn, invoice.status === 'OVERDUE' && { backgroundColor: C.red600 }]} onPress={() => setPayModal(true)} activeOpacity={0.85}>
                <FontAwesome5 name="credit-card" size={15} color={C.white} style={{ marginRight: 10 }} />
                <Text style={s.payBtnTxt}>Pay {formatCurrency(invoice.total_amount, invoice.currency)}</Text>
              </TouchableOpacity>
            </View>
          )}

          <PaymentModal visible={payModal} invoice={invoice} onClose={handlePayClose} />
        </>
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

  statusBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1 },
  statusIcon:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusLabel:  { fontSize: 16, fontWeight: '800' },
  statusSub:    { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.75 },

  amountCard:      { backgroundColor: C.primary, borderRadius: 18, padding: 20, marginBottom: 14, alignItems: 'center' },
  amountLabelCard: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountValueCard: { fontSize: 36, fontWeight: '900', color: C.white },

  card:         { backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.dark },

  lineItem:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  lineDesc:   { fontSize: 14, fontWeight: '600', color: C.dark, marginBottom: 2 },
  lineQty:    { fontSize: 12, color: C.g500 },
  lineAmount: { fontSize: 14, fontWeight: '700', color: C.dark, marginLeft: 12 },

  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel:      { fontSize: 14, color: C.g500 },
  summaryValue:      { fontSize: 14, fontWeight: '600', color: C.dark },
  summaryTotal:      { borderTopWidth: 1, borderTopColor: C.g200, paddingTop: 12, marginTop: 4, marginBottom: 0 },
  summaryTotalLabel: { fontSize: 16, fontWeight: '800', color: C.dark },
  summaryTotalValue: { fontSize: 18, fontWeight: '900', color: C.primary },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.g100 },
  infoLabel: { fontSize: 13, color: C.g500 },
  infoValue: { fontSize: 13, fontWeight: '600', color: C.dark, flex: 1, textAlign: 'right' },

  payBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.g200, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  payBtn: { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  payBtnTxt: { color: C.white, fontSize: 16, fontWeight: '800' },
});

const ps = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '95%' },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: C.g200, alignSelf: 'center', marginBottom: 20 },
  header:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  backBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, fontSize: 18, fontWeight: '800', color: C.dark },
  closeBtn:   { width: 34, height: 34, borderRadius: 17, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },

  amountBox:  { backgroundColor: C.blue50, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 20 },
  amountLabel:{ fontSize: 11, color: C.g500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  amountValue:{ fontSize: 26, fontWeight: '900', color: C.primary },
  invoiceRef: { fontSize: 11, color: C.g400, marginTop: 3 },

  methodLabel:{ fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 12 },
  methodBtn:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g200, marginBottom: 12 },
  methodIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 15, fontWeight: '700', color: C.dark },
  methodDesc: { fontSize: 12, color: C.g500, marginTop: 2 },

  // Card form
  cardVisual:       { borderRadius: 18, padding: 22, marginBottom: 20, backgroundColor: C.primary },
  cardChip:         { width: 36, height: 28, borderRadius: 6, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  cardChipInner:    { width: 20, height: 14, borderRadius: 3, backgroundColor: '#D97706' },
  cardNumberDisplay:{ color: C.white, fontSize: 18, fontWeight: '700', letterSpacing: 3, marginBottom: 20 },
  cardBottom:       { flexDirection: 'row', justifyContent: 'space-between' },
  cardFieldLabel:   { fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 3 },
  cardFieldValue:   { fontSize: 13, color: C.white, fontWeight: '700' },

  inputLabel: { fontSize: 12, fontWeight: '700', color: C.dark, marginBottom: 6 },
  input:      { backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.dark, marginBottom: 14 },

  payBtn:    { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  payBtnTxt: { color: C.white, fontSize: 16, fontWeight: '800' },

  sadadInfo:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.blue50, borderRadius: 14, padding: 16, marginBottom: 20 },
  sadadInfoTxt: { flex: 1, fontSize: 13, color: C.primary, lineHeight: 20 },

  sadadDoneBox:    { alignItems: 'center', paddingVertical: 16, marginBottom: 16 },
  sadadDoneIcon:   { width: 64, height: 64, borderRadius: 32, backgroundColor: C.green50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sadadDoneTitle:  { fontSize: 18, fontWeight: '800', color: C.dark, marginBottom: 4 },
  sadadDoneSub:    { fontSize: 13, color: C.g500, textAlign: 'center' },

  billRefBox:    { backgroundColor: C.primary, borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 20 },
  billRefLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  billRefNumber: { fontSize: 28, fontWeight: '900', color: C.white, letterSpacing: 3 },

  sadadSteps:      { marginBottom: 20 },
  sadadStep:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sadadStepNum:    { width: 28, height: 28, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sadadStepNumTxt: { fontSize: 13, fontWeight: '800', color: C.primary },
  sadadStepTxt:    { flex: 1, fontSize: 13, color: C.dark, fontWeight: '500' },
});
