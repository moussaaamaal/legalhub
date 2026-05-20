import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, Image, Modal, TextInput, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber600: '#D97706',
  green50: '#F0FDF4', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple600: '#9333EA',
  gold: '#F59E0B',
};

const TAG_META = {
  ACTIVE:   { label: 'Active',   color: C.green600,  bg: C.green50  },
  PENDING:  { label: 'Pending',  color: C.amber600,  bg: C.amber50  },
  PREMIUM:  { label: 'Premium',  color: C.purple600, bg: C.purple50 },
  VIP:      { label: 'VIP',      color: C.primary,   bg: C.blue50   },
  INACTIVE: { label: 'Inactive', color: C.g500,      bg: C.g100     },
};

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

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

function CaseRow({ item }) {
  const statusColors = {
    OPEN:        { bg: C.blue50,   color: C.blue600   },
    IN_PROGRESS: { bg: C.amber50,  color: C.amber600  },
    CLOSED:      { bg: C.g100,     color: C.g500      },
    WON:         { bg: C.green50,  color: C.green600  },
    LOST:        { bg: C.red50,    color: C.red600    },
  };
  const sc = statusColors[item.status] || statusColors.OPEN;
  return (
    <View style={s.caseRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.caseName} numberOfLines={1}>{item.title || item.case_number || 'Case'}</Text>
        <Text style={s.caseSub}>{item.case_number || ''}</Text>
      </View>
      <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
        <Text style={[s.statusPillTxt, { color: sc.color }]}>{item.status || 'OPEN'}</Text>
      </View>
    </View>
  );
}

function InvoiceRow({ item }) {
  const paid = item.status === 'PAID';
  return (
    <View style={s.caseRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.caseName} numberOfLines={1}>{item.invoice_number || 'Invoice'}</Text>
        <Text style={s.caseSub}>{item.due_date ? `Due: ${item.due_date.slice(0, 10)}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[s.invoiceAmt, { color: paid ? C.green600 : C.amber600 }]}>
          {item.currency || 'SAR'} {Number(item.total_amount || 0).toFixed(2)}
        </Text>
        <View style={[s.statusPill, { backgroundColor: paid ? C.green50 : C.amber50 }]}>
          <Text style={[s.statusPillTxt, { color: paid ? C.green600 : C.amber600 }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ClientDetailsScreen({ navigation, route }) {
  const clientId = route?.params?.clientId;

  const [client,   setClient]   = useState(null);
  const [cases,    setCases]    = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [updatingVip, setUpdatingVip] = useState(false);
  const [emailModal,   setEmailModal]   = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody,    setEmailBody]    = useState('');

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [cl, cs, inv] = await Promise.all([
        clientsAPI.getById(clientId),
        clientsAPI.getCases(clientId),
        clientsAPI.getInvoices(clientId),
      ]);
      setClient(cl);
      setCases(cs || []);
      setInvoices(inv || []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleSetVip = useCallback(async () => {
    if (!client) return;
    const isVip = client.tag === 'VIP';
    const newTag = isVip ? 'ACTIVE' : 'VIP';
    const confirmMsg = isVip
      ? `Remove VIP status from ${client.first_name} ${client.last_name}?`
      : `Mark ${client.first_name} ${client.last_name} as VIP client?`;

    Alert.alert(
      isVip ? 'Remove VIP' : 'Mark as VIP',
      confirmMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isVip ? 'Remove VIP' : 'Make VIP',
          style: isVip ? 'destructive' : 'default',
          onPress: async () => {
            setUpdatingVip(true);
            try {
              const updated = await clientsAPI.update(clientId, { tag: newTag });
              setClient(updated);
              Alert.alert(
                'Success',
                isVip ? 'VIP status removed.' : `${client.first_name} is now a VIP client!`
              );
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to update client');
            } finally {
              setUpdatingVip(false);
            }
          },
        },
      ]
    );
  }, [client, clientId]);

  const openEmailCompose = useCallback(() => {
    if (!client?.email) return;
    setEmailSubject('');
    setEmailBody('');
    setEmailModal(true);
  }, [client]);

  const sendEmail = useCallback(async () => {
    const to      = encodeURIComponent(client.email);
    const subject = encodeURIComponent(emailSubject.trim());
    const body    = encodeURIComponent(emailBody.trim());
    const url     = `mailto:${to}?subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Error', 'No email app found on this device.');
      return;
    }
    setEmailModal(false);
    await Linking.openURL(url);
  }, [client, emailSubject, emailBody]);

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

  if (!client) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Client Details</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.g500, fontSize: 15 }}>Client not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const tag      = (client.tag || 'ACTIVE').toUpperCase();
  const tagMeta  = TAG_META[tag] || TAG_META.ACTIVE;
  const isVip    = tag === 'VIP';
  const colors   = [C.primary, C.purple600, C.green600, C.amber600, C.red600];
  const avatarBg = colors[Math.abs((fullName.charCodeAt(0) || 65) - 65) % colors.length];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Client Details</Text>
          <View style={s.backBtn} />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* PROFILE CARD */}
        <View style={s.profileCard}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View style={{ position: 'relative' }}>
              {client.avatar_url ? (
                <Image source={{ uri: client.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={s.avatarTxt}>{getInitials(fullName)}</Text>
                </View>
              )}
              {isVip && (
                <View style={s.vipBadgeAbsolute}>
                  <FontAwesome5 name="crown" size={9} color={C.gold} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clientName}>{fullName}</Text>
              {!!client.occupation && <Text style={s.clientSub}>{client.occupation}</Text>}
              {!!client.company_name && <Text style={s.clientSub}>{client.company_name}</Text>}
              <View style={[s.tagPill, { backgroundColor: tagMeta.bg, marginTop: 6 }]}>
                {isVip && <FontAwesome5 name="crown" size={10} color={tagMeta.color} style={{ marginRight: 4 }} />}
                <Text style={[s.tagPillTxt, { color: tagMeta.color }]}>{tagMeta.label}</Text>
              </View>
            </View>
          </View>

          {/* VIP BUTTON */}
          <TouchableOpacity
            style={[s.vipBtn, isVip && s.vipBtnActive]}
            onPress={handleSetVip}
            disabled={updatingVip}
          >
            {updatingVip ? (
              <ActivityIndicator size="small" color={isVip ? C.amber600 : C.white} />
            ) : (
              <>
                <FontAwesome5 name="crown" size={14} color={isVip ? C.amber600 : C.white} style={{ marginRight: 8 }} />
                <Text style={[s.vipBtnTxt, isVip && s.vipBtnTxtActive]}>
                  {isVip ? 'Remove VIP Status' : 'Mark as VIP'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* SEND EMAIL BUTTON */}
          <TouchableOpacity style={s.inviteBtn} onPress={openEmailCompose} disabled={!client?.email}>
            <FontAwesome5 name="envelope" size={13} color={C.primary} style={{ marginRight: 8 }} />
            <Text style={s.inviteBtnTxt}>Send Email</Text>
          </TouchableOpacity>
        </View>

        {/* CONTACT INFO */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Contact Information</Text>
          <InfoRow icon="envelope"    label="Email"       value={client.email} />
          <InfoRow icon="phone"       label="Phone"       value={client.phone} />
          <InfoRow icon="whatsapp"    label="WhatsApp"    value={client.whatsapp_number} />
          <InfoRow icon="map-marker-alt" label="Address"  value={client.address} />
        </View>

        {/* PERSONAL INFO */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Personal Information</Text>
          <InfoRow icon="id-card"     label="National ID"  value={client.national_id} />
          <InfoRow icon="globe"       label="Nationality"  value={client.nationality} />
          <InfoRow icon="birthday-cake" label="Date of Birth" value={client.date_of_birth} />
          <InfoRow icon="venus-mars"  label="Gender"       value={client.gender} />
          <InfoRow icon="building"    label="Client Type"  value={client.client_type} />
        </View>

        {/* NOTES */}
        {!!client.notes && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Notes</Text>
            <Text style={s.notesText}>{client.notes}</Text>
          </View>
        )}

        {/* CASES */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Cases</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeTxt}>{cases.length}</Text>
            </View>
          </View>
          {cases.length === 0 ? (
            <Text style={s.emptyTxt}>No cases found</Text>
          ) : (
            cases.map((c) => <CaseRow key={c.id} item={c} />)
          )}
        </View>

        {/* INVOICES */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Invoices</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeTxt}>{invoices.length}</Text>
            </View>
          </View>
          {invoices.length === 0 ? (
            <Text style={s.emptyTxt}>No invoices found</Text>
          ) : (
            invoices.map((inv) => <InvoiceRow key={inv.id} item={inv} />)
          )}
        </View>

      </ScrollView>

      {/* EMAIL COMPOSE MODAL */}
      <Modal visible={emailModal} transparent animationType="slide" onRequestClose={() => setEmailModal(false)}>
        <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={em.sheet}>
            <View style={em.sheetHeader}>
              <Text style={em.sheetTitle}>New Email</Text>
              <TouchableOpacity onPress={() => setEmailModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <FontAwesome5 name="times" size={16} color={C.g500} />
              </TouchableOpacity>
            </View>

            <View style={em.field}>
              <Text style={em.fieldLabel}>To</Text>
              <Text style={em.fieldValueStatic}>{client?.email}</Text>
            </View>

            <View style={em.divider} />

            <View style={em.field}>
              <Text style={em.fieldLabel}>Subject</Text>
              <TextInput
                style={em.fieldInput}
                placeholder="Enter subject"
                placeholderTextColor={C.g400}
                value={emailSubject}
                onChangeText={setEmailSubject}
                returnKeyType="next"
              />
            </View>

            <View style={em.divider} />

            <TextInput
              style={em.bodyInput}
              placeholder="Write your message…"
              placeholderTextColor={C.g400}
              value={emailBody}
              onChangeText={setEmailBody}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[em.sendBtn, !emailSubject.trim() && em.sendBtnDisabled]}
              onPress={sendEmail}
              disabled={!emailSubject.trim()}
            >
              <FontAwesome5 name="paper-plane" size={14} color={C.white} style={{ marginRight: 8 }} />
              <Text style={em.sendBtnTxt}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.primary },
  scroll:     { flex: 1, backgroundColor: C.g50 },
  header:     { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: C.white },

  profileCard:{ backgroundColor: C.white, margin: 16, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  avatar:     { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:  { color: C.white, fontWeight: '800', fontSize: 22 },
  vipBadgeAbsolute: { position: 'absolute', top: -4, right: -4, backgroundColor: C.white, borderRadius: 8, padding: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  clientName: { fontSize: 18, fontWeight: '800', color: C.dark },
  clientSub:  { fontSize: 13, color: C.g500, marginTop: 1 },
  tagPill:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagPillTxt: { fontSize: 12, fontWeight: '700' },

  vipBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, marginTop: 16 },
  vipBtnActive:{ backgroundColor: C.amber50, borderWidth: 1.5, borderColor: C.amber600 },
  vipBtnTxt:  { color: C.white, fontWeight: '700', fontSize: 14 },
  vipBtnTxtActive: { color: C.amber600 },
  inviteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue50, borderRadius: 14, paddingVertical: 12, marginTop: 10 },
  inviteBtnTxt:{ color: C.primary, fontWeight: '600', fontSize: 14 },

  card:       { backgroundColor: C.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: C.dark, marginBottom: 14 },
  countBadge: { backgroundColor: C.blue100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeTxt: { fontSize: 12, fontWeight: '700', color: C.primary },

  infoRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  infoIconWrap:{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  infoLabel:  { fontSize: 11, color: C.g400, marginBottom: 2 },
  infoValue:  { fontSize: 14, fontWeight: '600', color: C.dark },

  notesText:  { fontSize: 14, color: C.g600, lineHeight: 20 },

  caseRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  caseName:   { fontSize: 13, fontWeight: '700', color: C.dark },
  caseSub:    { fontSize: 11, color: C.g400, marginTop: 2 },
  invoiceAmt: { fontSize: 13, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillTxt: { fontSize: 11, fontWeight: '600' },

  emptyTxt:   { fontSize: 13, color: C.g400, textAlign: 'center', paddingVertical: 12 },
});

const em = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 12, maxHeight: '85%' },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle:      { fontSize: 17, fontWeight: '800', color: C.dark },
  field:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  fieldLabel:      { fontSize: 13, color: C.g500, width: 56 },
  fieldValueStatic:{ fontSize: 14, color: C.dark, flex: 1 },
  fieldInput:      { fontSize: 14, color: C.dark, flex: 1, paddingVertical: 4 },
  divider:         { height: 1, backgroundColor: C.g100 },
  bodyInput:       { fontSize: 14, color: C.dark, minHeight: 140, paddingTop: 4 },
  sendBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnTxt:      { color: C.white, fontWeight: '700', fontSize: 15 },
});
