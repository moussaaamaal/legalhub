import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, Share, Linking,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563',
  blue50: '#EFF6FF', green600: '#16A34A',
};

const CLIENT_TYPES       = ['Individual', 'Company', 'NGO', 'Government'];
const CONTACT_METHODS    = ['Email', 'Phone', 'WhatsApp', 'In-Person'];
const PRACTICE_AREAS     = ['Criminal Defense', 'Civil Litigation', 'Corporate Law', 'Family Law', 'Real Estate', 'Immigration', 'Labor', 'IP', 'Tax', 'Other'];

export default function AddClientScreen({ navigation }) {
  const [step,       setStep]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [modal,      setModal]      = useState(false);
  const [form,       setForm]       = useState({
    firstName: '', lastName: '', email: '', phone: '',
    whatsapp: '', clientType: 'Individual', company: '',
    address: '', occupation: '', dateOfBirth: '',
    nationalId: '', preferredContact: 'Email',
    caseType: '', referredBy: '', notes: '',
  });

  const update = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSaveClient = async () => {
    if (!form.firstName.trim() || !form.email.trim()) {
      Alert.alert('Missing Fields', 'First name and email are required.');
      return;
    }
    setLoading(true);
    try {
      const client = await clientsAPI.create({
        first_name:               form.firstName,
        last_name:                form.lastName,
        email:                    form.email,
        phone:                    form.phone || undefined,
        whatsapp_number:          form.whatsapp || undefined,
        client_type:              form.clientType.toUpperCase(),
        company_name:             form.company || undefined,
        address:                  form.address || undefined,
        occupation:               form.occupation || undefined,
        date_of_birth:            form.dateOfBirth || undefined,
        national_id:              form.nationalId || undefined,
        preferred_contact_method: form.preferredContact,
        notes:                    form.notes || undefined,
      });

      const inviteRes = await clientsAPI.invite(client.id);
      setInviteData({
        token:     inviteRes.invite_token,
        clientId:  client.id,
        email:     form.email,
        phone:     form.phone || form.whatsapp || '',
        firstName: form.firstName,
      });
      setModal(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = async () => {
    if (!inviteData) return;
    await Share.share({
      message: `Hi ${inviteData.firstName}! You've been invited to LegalHub.\n\nUse this token to create your account: ${inviteData.token}\n\nOr open the app and enter the token manually.`,
      title: 'LegalHub Invitation',
    });
  };

  const handleShareSMS = () => {
    if (!inviteData?.phone) {
      Alert.alert('No phone number', 'No phone number available to send SMS.');
      return;
    }
    const num  = inviteData.phone.replace(/\s/g, '');
    const body = encodeURIComponent(
      `Hi ${inviteData.firstName}! You've been invited to LegalHub. Your invite token: ${inviteData.token}`
    );
    Linking.openURL(`sms:${num}?body=${body}`);
  };

  const progress = (step / 3) * 100;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add New Client</Text>
          <View style={s.backBtn} />
        </View>
      </View>

      {/* ── PROGRESS ── */}
      <View style={s.progressWrap}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>Progress</Text>
          <Text style={s.progressPct}>Step {step} of 3</Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={s.stepsRow}>
          {['Personal Info', 'Contact Info', 'Additional'].map((l, i) => (
            <Text key={i} style={[s.stepLabel, step === i + 1 && s.stepLabelActive]}>{l}</Text>
          ))}
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.section}>

          {/* ── STEP 1: Personal Info ── */}
          {step === 1 && (
            <>
              <Text style={s.sectionTitle}>Personal Information</Text>
              <Field label="First Name *"         placeholder="First name"         value={form.firstName}   onChange={v => update('firstName', v)}   icon="user"         />
              <Field label="Last Name"             placeholder="Last name"          value={form.lastName}    onChange={v => update('lastName', v)}    icon="user"         />
              <Field label="Occupation"            placeholder="e.g. Engineer, CEO" value={form.occupation}  onChange={v => update('occupation', v)}  icon="briefcase"    />
              <Field label="Date of Birth"         placeholder="YYYY-MM-DD"         value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} icon="birthday-cake"/>
              <Field label="National ID / Passport" placeholder="ID number"         value={form.nationalId}  onChange={v => update('nationalId', v)}  icon="id-card"      />

              <Text style={s.label}>Client Type</Text>
              <View style={s.chipRow}>
                {CLIENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.chip, form.clientType === t && s.chipActive]}
                    onPress={() => update('clientType', t)}
                  >
                    <Text style={[s.chipTxt, form.clientType === t && s.chipTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {form.clientType !== 'Individual' && (
                <Field label="Company / Organization" placeholder="Company name" value={form.company} onChange={v => update('company', v)} icon="building" />
              )}
            </>
          )}

          {/* ── STEP 2: Contact Info ── */}
          {step === 2 && (
            <>
              <Text style={s.sectionTitle}>Contact Information</Text>
              <Field label="Email Address *" placeholder="email@example.com"  value={form.email}    onChange={v => update('email', v)}    icon="envelope"       />
              <Field label="Phone Number"    placeholder="+1 (555) 000-0000"  value={form.phone}    onChange={v => update('phone', v)}    icon="phone"          />
              <Field label="WhatsApp Number" placeholder="+1 (555) 000-0000"  value={form.whatsapp} onChange={v => update('whatsapp', v)} icon="whatsapp"       />
              <Field label="Address"         placeholder="Street address"     value={form.address}  onChange={v => update('address', v)}  icon="map-marker-alt" />

              <Text style={s.label}>Preferred Contact Method</Text>
              <View style={s.chipRow}>
                {CONTACT_METHODS.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.chip, form.preferredContact === m && s.chipActive]}
                    onPress={() => update('preferredContact', m)}
                  >
                    <Text style={[s.chipTxt, form.preferredContact === m && s.chipTxtActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ── STEP 3: Additional ── */}
          {step === 3 && (
            <>
              <Text style={s.sectionTitle}>Additional Information</Text>

              <Text style={s.label}>Primary Practice Area</Text>
              {PRACTICE_AREAS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[s.radioRow, form.caseType === opt && s.radioRowActive]}
                  onPress={() => update('caseType', opt)}
                >
                  <View style={[s.radio, form.caseType === opt && s.radioActive]}>
                    {form.caseType === opt && <View style={s.radioDot} />}
                  </View>
                  <Text style={[s.radioText, form.caseType === opt && s.radioTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}

              <Field label="Referred By" placeholder="Name of referral" value={form.referredBy} onChange={v => update('referredBy', v)} icon="user-friends" />

              <Text style={s.label}>Internal Notes</Text>
              <TextInput
                style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="Private notes about client..."
                placeholderTextColor={C.gray400}
                value={form.notes}
                onChangeText={v => update('notes', v)}
                multiline
              />

              {/* Summary */}
              <View style={s.summaryCard}>
                <Text style={s.summaryTitle}>Summary</Text>
                {[
                  ['Name',       `${form.firstName} ${form.lastName}`.trim()],
                  ['Type',       form.clientType],
                  ['Email',      form.email],
                  ['Phone',      form.phone],
                  ['WhatsApp',   form.whatsapp],
                  ['Occupation', form.occupation],
                  ['Contact',    form.preferredContact],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <View key={k} style={s.summaryRow}>
                    <Text style={s.summaryKey}>{k}</Text>
                    <Text style={s.summaryVal} numberOfLines={1}>{v}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── FOOTER BUTTONS ── */}
      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep(p => p - 1)} disabled={loading}>
            <Text style={s.btnSecondaryText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity style={s.btnPrimary} onPress={() => setStep(p => p + 1)}>
            <Text style={s.btnPrimaryText}>Continue</Text>
            <FontAwesome5 name="arrow-right" size={13} color={C.white} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: C.green600 }]}
            onPress={handleSaveClient}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : (
                <>
                  <FontAwesome5 name="user-check" size={14} color={C.white} />
                  <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Save & Invite</Text>
                </>
              )}
          </TouchableOpacity>
        )}
      </View>

      {/* ── INVITE MODAL (MOB-CLT-05) ── */}
      <Modal visible={modal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalIconWrap}>
              <FontAwesome5 name="check-circle" size={30} color={C.green600} />
            </View>
            <Text style={s.modalTitle}>Client Added!</Text>
            <Text style={s.modalSub}>
              Choose how to send the invitation to{'\n'}
              <Text style={{ fontWeight: '700', color: C.dark }}>{inviteData?.email}</Text>
            </Text>

            {/* Invite options */}
            <View style={s.inviteOptions}>
              {/* In-app link */}
              <TouchableOpacity style={s.inviteOption} onPress={handleShareLink}>
                <View style={[s.inviteIconWrap, { backgroundColor: C.blue50 }]}>
                  <FontAwesome5 name="share-alt" size={18} color={C.primary} />
                </View>
                <Text style={s.inviteOptionTitle}>Share Link</Text>
                <Text style={s.inviteOptionSub}>In-app / any app</Text>
              </TouchableOpacity>

              {/* Email */}
              <TouchableOpacity
                style={s.inviteOption}
                onPress={() => {
                  Alert.alert('Email Sent', `Invitation email has been sent to ${inviteData?.email}`);
                }}
              >
                <View style={[s.inviteIconWrap, { backgroundColor: '#FFF7ED' }]}>
                  <FontAwesome5 name="envelope" size={18} color="#EA580C" />
                </View>
                <Text style={s.inviteOptionTitle}>Email</Text>
                <Text style={s.inviteOptionSub}>Auto-sent</Text>
              </TouchableOpacity>

              {/* SMS */}
              <TouchableOpacity style={s.inviteOption} onPress={handleShareSMS}>
                <View style={[s.inviteIconWrap, { backgroundColor: '#F0FFF4' }]}>
                  <FontAwesome5 name="sms" size={18} color={C.green600} />
                </View>
                <Text style={s.inviteOptionTitle}>SMS</Text>
                <Text style={s.inviteOptionSub}>Via device</Text>
              </TouchableOpacity>
            </View>

            {/* Token display */}
            <Text style={s.tokenLabel}>Invite Token</Text>
            <View style={s.tokenBox}>
              <Text style={s.tokenTxt} numberOfLines={2} selectable>{inviteData?.token}</Text>
            </View>

            <TouchableOpacity
              style={s.doneBtn}
              onPress={() => { setModal(false); navigation?.goBack(); }}
            >
              <Text style={s.doneBtnTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const Field = ({ label, placeholder, value, onChange, icon }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <View style={{ position: 'relative' }}>
      {icon && (
        <FontAwesome5
          name={icon}
          size={13}
          color={C.gray400}
          style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }}
        />
      )}
      <TextInput
        style={[s.input, icon && { paddingLeft: 42 }]}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        value={value}
        onChangeText={onChange}
      />
    </View>
  </View>
);

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  progressWrap: { backgroundColor: C.white, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  progressRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel:{ fontSize: 12, color: C.gray500 },
  progressPct:  { fontSize: 12, fontWeight: '700', color: C.primary },
  progressBar:  { height: 6, backgroundColor: C.gray200, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  stepsRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel:    { fontSize: 11, color: C.gray400 },
  stepLabelActive: { color: C.primary, fontWeight: '700' },

  section:      { margin: 16, backgroundColor: C.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 16 },
  label:        { fontSize: 13, fontWeight: '600', color: C.dark, marginBottom: 8 },
  input:        { borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.dark, backgroundColor: C.white },

  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt:    { fontSize: 12, fontWeight: '600', color: C.gray600 },
  chipTxtActive: { color: C.white },

  radioRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1.5, borderColor: C.gray200 },
  radioRowActive: { borderColor: C.primary, backgroundColor: C.blue50 },
  radio:          { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioActive:    { borderColor: C.primary },
  radioDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  radioText:      { fontSize: 14, color: C.gray600, fontWeight: '500' },
  radioTextActive:{ color: C.primary, fontWeight: '600' },

  summaryCard:  { backgroundColor: C.blue50, borderRadius: 16, padding: 14, marginTop: 12 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: C.primary, marginBottom: 10 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#DBEAFE' },
  summaryKey:   { fontSize: 12, color: C.gray500 },
  summaryVal:   { fontSize: 12, fontWeight: '600', color: C.dark, maxWidth: '60%' },

  footer:          { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 },
  btnPrimary:      { flex: 1, flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:  { color: C.white, fontWeight: '700', fontSize: 15 },
  btnSecondary:    { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText:{ fontSize: 15, fontWeight: '600', color: C.gray600 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  modalIconWrap:{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: C.dark, textAlign: 'center', marginBottom: 6 },
  modalSub:     { fontSize: 13, color: C.gray500, textAlign: 'center', marginBottom: 20, lineHeight: 20 },

  inviteOptions:     { flexDirection: 'row', gap: 12, marginBottom: 20 },
  inviteOption:      { flex: 1, alignItems: 'center', gap: 6 },
  inviteIconWrap:    { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inviteOptionTitle: { fontSize: 13, fontWeight: '700', color: C.dark },
  inviteOptionSub:   { fontSize: 11, color: C.gray400 },

  tokenLabel: { fontSize: 12, fontWeight: '600', color: C.gray500, marginBottom: 6 },
  tokenBox:   { backgroundColor: C.blue50, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 20, width: '100%' },
  tokenTxt:   { fontSize: 13, fontWeight: '700', color: C.primary, letterSpacing: 0.5, textAlign: 'center' },

  doneBtn:    { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  doneBtnTxt: { fontSize: 15, fontWeight: '700', color: C.white },
});
