import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
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
  DRAFT:     { label: 'Draft',     color: C.g500,     bg: C.g100,    icon: 'file-alt'            },
  PENDING:   { label: 'Pending',   color: C.amber600, bg: C.amber50, icon: 'clock'               },
  PAID:      { label: 'Paid',      color: C.green600, bg: C.green50, icon: 'check-circle'        },
  OVERDUE:   { label: 'Overdue',   color: C.red600,   bg: C.red50,   icon: 'exclamation-triangle' },
  CANCELLED: { label: 'Cancelled', color: C.g400,     bg: C.g100,    icon: 'times-circle'        },
};

function fmt(amount, currency = 'USD') {
  if (amount == null) return '—';
  return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function AvatarInitials({ name, size = 48 }) {
  const colors = [C.primary, C.purple600, C.green600, C.amber600, C.red600];
  const bg = colors[Math.abs((name?.charCodeAt(0) || 65) - 65) % colors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontWeight: '800', fontSize: size * 0.35 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function InvoiceDetailsScreen({ navigation, route }) {
  const inv = route?.params?.invoice;

  const [sending, setSending]         = useState(false);
  const [reminded, setReminded]       = useState(false);
  const [waSending, setWaSending]     = useState(false);

  const status     = (inv?.status || 'DRAFT').toUpperCase();
  const meta       = STATUS_META[status] || STATUS_META.DRAFT;
  const client     = inv?.client;
  const caseFile   = inv?.case_file || null;
  const clientName = client
    ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
    : 'Unknown Client';
  const items      = inv?.invoice_item || [];
  const currency   = inv?.currency || 'USD';

  const handleRemind = useCallback(() => {
    Alert.alert(
      'Send Payment Reminder',
      `Send a payment reminder to ${clientName} for invoice ${inv?.invoice_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            try {
              await billingAPI.sendReminder(inv.id);
              setReminded(true);
              Alert.alert('Reminder Sent', `A payment reminder has been sent to ${clientName}.`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to send reminder');
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  }, [inv, clientName]);

  const handleEmail = useCallback(() => {
    if (client?.email) Linking.openURL(`mailto:${client.email}`);
  }, [client]);

  const handleWhatsApp = useCallback(() => {
    Alert.alert(
      'Send via WhatsApp',
      `Send invoice ${inv?.invoice_number} notification to ${clientName} via WhatsApp?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setWaSending(true);
            try {
              await billingAPI.sendWhatsapp(inv.id);
              Alert.alert('WhatsApp Sent ✅', `Invoice notification sent to ${clientName} via WhatsApp.`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to send WhatsApp message. Make sure the client has a phone number.');
            } finally {
              setWaSending(false);
            }
          },
        },
      ],
    );
  }, [inv, clientName]);

  if (!inv) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.g500 }}>Invoice not found.</Text>
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
            <Text style={s.headerTitle}>Invoice Details</Text>
            <Text style={s.headerSub}>{inv.invoice_number}</Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
            <FontAwesome5 name={meta.icon} size={11} color={meta.color} />
            <Text style={[s.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* CLIENT CARD */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Client</Text>
          <View style={s.clientCard}>
            <AvatarInitials name={clientName} size={48} />
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={s.clientName}>{clientName}</Text>
              {!!client?.email && (
                <TouchableOpacity onPress={handleEmail} style={s.emailRow}>
                  <FontAwesome5 name="envelope" size={11} color={C.primary} />
                  <Text style={s.clientEmail}>{client.email}</Text>
                </TouchableOpacity>
              )}
            </View>
            {!!client?.email && (
              <TouchableOpacity style={s.emailBtn} onPress={handleEmail}>
                <FontAwesome5 name="envelope" size={15} color={C.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* RELATED CASE */}
        {!!caseFile && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Related Case</Text>
            <View style={s.caseCard}>
              <View style={s.caseIconWrap}>
                <FontAwesome5 name="briefcase" size={18} color={C.primary} />
              </View>
              <Text style={s.caseTitle} numberOfLines={2}>{caseFile.title}</Text>
            </View>
          </View>
        )}

        {/* DATES */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Dates</Text>
          <View style={s.datesRow}>
            <View style={s.dateBox}>
              <FontAwesome5 name="calendar-plus" size={14} color={C.primary} style={{ marginBottom: 6 }} />
              <Text style={s.dateLabel}>Issue Date</Text>
              <Text style={s.dateVal}>{fmtDate(inv.issue_date)}</Text>
            </View>
            <View style={[s.dateBox, { borderLeftWidth: 1, borderLeftColor: C.g200 }]}>
              <FontAwesome5 name="calendar-times" size={14} color={meta.color} style={{ marginBottom: 6 }} />
              <Text style={s.dateLabel}>Due Date</Text>
              <Text style={[s.dateVal, { color: meta.color }]}>{fmtDate(inv.due_date)}</Text>
            </View>
          </View>
        </View>

        {/* LINE ITEMS */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Services</Text>
          {items.length === 0 ? (
            <Text style={{ color: C.g400, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No items</Text>
          ) : (
            <>
              <View style={s.itemHeader}>
                <Text style={[s.itemCol, { flex: 2 }]}>Description</Text>
                <Text style={[s.itemCol, s.itemColRight]}>Qty</Text>
                <Text style={[s.itemCol, s.itemColRight]}>Unit Price</Text>
                <Text style={[s.itemCol, s.itemColRight]}>Total</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={[s.itemRow, i % 2 === 0 && { backgroundColor: C.g50 }]}>
                  <Text style={[s.itemCell, { flex: 2 }]} numberOfLines={2}>{item.description}</Text>
                  <Text style={[s.itemCell, s.itemCellRight]}>{item.quantity}</Text>
                  <Text style={[s.itemCell, s.itemCellRight]}>{fmt(item.unit_price, currency)}</Text>
                  <Text style={[s.itemCell, s.itemCellRight, { fontWeight: '700' }]}>{fmt(item.total, currency)}</Text>
                </View>
              ))}
            </>
          )}

          {/* Totals */}
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalVal}>{fmt(inv.subtotal, currency)}</Text>
            </View>
            {inv.tax_rate > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Tax ({inv.tax_rate}%)</Text>
                <Text style={s.totalVal}>{fmt(inv.tax_amount, currency)}</Text>
              </View>
            )}
            <View style={[s.totalRow, s.totalRowFinal]}>
              <Text style={s.totalLabelFinal}>Total</Text>
              <Text style={s.totalValFinal}>{fmt(inv.total_amount, currency)}</Text>
            </View>
          </View>
        </View>

        {/* NOTES */}
        {!!inv.notes && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Notes</Text>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{inv.notes}</Text>
            </View>
          </View>
        )}

        {/* ACTIONS */}
        {(status === 'OVERDUE' || status === 'PENDING') && (
          <View style={s.section}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: status === 'OVERDUE' ? C.red600 : C.amber600 }]}
              onPress={handleRemind}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator size="small" color={C.white} />
                : <>
                    <FontAwesome5 name="bell" size={14} color={C.white} />
                    <Text style={s.actionBtnText}>{reminded ? 'Send Another Reminder' : 'Send Payment Reminder'}</Text>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#25D366', marginTop: 10 }]}
              onPress={handleWhatsApp}
              disabled={waSending}
            >
              {waSending
                ? <ActivityIndicator size="small" color={C.white} />
                : <>
                    <FontAwesome name="whatsapp" size={16} color={C.white} />
                    <Text style={s.actionBtnText}>Send via WhatsApp</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.primary },
  scroll:       { flex: 1, backgroundColor: C.g50 },
  header:       { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:    { flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:    { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText:{ fontSize: 12, fontWeight: '700' },

  section:      { backgroundColor: C.white, marginBottom: 2, paddingHorizontal: 16, paddingVertical: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.g500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  clientCard:   { flexDirection: 'row', alignItems: 'center' },
  clientName:   { fontSize: 16, fontWeight: '800', color: C.dark, marginBottom: 4 },
  emailRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clientEmail:  { fontSize: 13, color: C.primary },
  emailBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },

  datesRow:     { flexDirection: 'row' },
  dateBox:      { flex: 1, alignItems: 'center', paddingVertical: 12 },
  dateLabel:    { fontSize: 11, color: C.g500, marginBottom: 4 },
  dateVal:      { fontSize: 14, fontWeight: '700', color: C.dark, textAlign: 'center' },

  itemHeader:   { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.g200, marginBottom: 4 },
  itemCol:      { fontSize: 11, fontWeight: '700', color: C.g500, flex: 1 },
  itemColRight: { textAlign: 'right' },
  itemRow:      { flexDirection: 'row', paddingVertical: 10, borderRadius: 8, paddingHorizontal: 4 },
  itemCell:     { fontSize: 13, color: C.dark, flex: 1 },
  itemCellRight:{ textAlign: 'right' },

  totalsBox:    { borderTopWidth: 1, borderTopColor: C.g200, marginTop: 12, paddingTop: 12, gap: 8 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel:   { fontSize: 13, color: C.g500 },
  totalVal:     { fontSize: 13, color: C.dark, fontWeight: '600' },
  totalRowFinal:{ borderTopWidth: 1, borderTopColor: C.g200, paddingTop: 10, marginTop: 4 },
  totalLabelFinal:{ fontSize: 15, fontWeight: '800', color: C.dark },
  totalValFinal:{ fontSize: 17, fontWeight: '800', color: C.primary },

  caseCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.blue50, borderRadius: 12, padding: 14 },
  caseIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' },
  caseTitle:    { fontSize: 15, fontWeight: '700', color: C.primary, flex: 1 },

  notesBox:     { backgroundColor: C.g50, borderRadius: 12, padding: 14 },
  notesText:    { fontSize: 13, color: C.g600, lineHeight: 20 },

  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText:{ color: C.white, fontSize: 14, fontWeight: '700' },
});
