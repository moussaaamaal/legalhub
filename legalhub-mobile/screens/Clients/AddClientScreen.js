import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
  Modal, Share,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';

const COLORS = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280',
  gray600: '#4B5563', blue50: '#EFF6FF',
};

const CLIENT_TYPES = ['Individual', 'Company', 'NGO', 'Government'];

export default function AddClientScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState(null);
  const [tokenModal, setTokenModal] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    clientType: 'Individual', company: '', address: '',
    city: '', country: '', idNumber: '', notes: '',
    caseType: '', referredBy: '',
  });

  const progress = (step / 3) * 100;
  const update = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSaveClient = async () => {
    if (!form.firstName.trim() || !form.email.trim()) {
      Alert.alert('Missing Fields', 'First name and email are required.');
      return;
    }

    setLoading(true);
    try {
      const client = await clientsAPI.create({
        first_name:   form.firstName,
        last_name:    form.lastName,
        email:        form.email,
        phone:        form.phone,
        client_type:  form.clientType.toUpperCase(),
        company_name: form.company,
        address:      form.address,
        national_id:  form.idNumber,
        notes:        form.notes,
      });

      const inviteRes = await clientsAPI.invite(client.id);
      setInviteToken(inviteRes.invite_token);
      setTokenModal(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add New Client</Text>
          <View style={s.backBtn} />
        </View>
      </View>

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

          {step === 1 && (
            <>
              <Text style={s.sectionTitle}>Personal Information</Text>
              <Field label="First Name *" placeholder="First name" value={form.firstName} onChange={v => update('firstName', v)} icon="user" />
              <Field label="Last Name *" placeholder="Last name" value={form.lastName} onChange={v => update('lastName', v)} icon="user" />

              <Text style={s.label}>Client Type</Text>
              <View style={s.typeRow}>
                {CLIENT_TYPES.map(t => (
                  <TouchableOpacity key={t} style={[s.typeBtn, form.clientType === t && s.typeBtnActive]} onPress={() => update('clientType', t)}>
                    <Text style={[s.typeBtnText, form.clientType === t && s.typeBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {form.clientType !== 'Individual' && (
                <Field label="Company / Organization" placeholder="Company name" value={form.company} onChange={v => update('company', v)} icon="building" />
              )}
              <Field label="National ID / Passport" placeholder="ID number" value={form.idNumber} onChange={v => update('idNumber', v)} icon="id-card" />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={s.sectionTitle}>Contact Information</Text>
              <Field label="Email Address *" placeholder="email@example.com" value={form.email} onChange={v => update('email', v)} icon="envelope" />
              <Field label="Phone Number *" placeholder="+1 (555) 000-0000" value={form.phone} onChange={v => update('phone', v)} icon="phone" />
              <Field label="Address" placeholder="Street address" value={form.address} onChange={v => update('address', v)} icon="map-marker-alt" />
              <Field label="City" placeholder="City" value={form.city} onChange={v => update('city', v)} icon="city" />
              <Field label="Country" placeholder="Country" value={form.country} onChange={v => update('country', v)} icon="globe" />
            </>
          )}

          {step === 3 && (
            <>
              <Text style={s.sectionTitle}>Additional Information</Text>

              <Text style={s.label}>Primary Legal Need</Text>
              {['Criminal Defense', 'Civil Litigation', 'Corporate Law', 'Family Law', 'Real Estate', 'Other'].map(opt => (
                <TouchableOpacity key={opt} style={[s.radioRow, form.caseType === opt && s.radioRowActive]} onPress={() => update('caseType', opt)}>
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
                placeholderTextColor={COLORS.gray400}
                value={form.notes}
                onChangeText={v => update('notes', v)}
                multiline
              />

              <View style={s.summaryCard}>
                <Text style={s.summaryTitle}>Client Summary</Text>
                {[
                  ['Name', `${form.firstName} ${form.lastName}`.trim()],
                  ['Type', form.clientType],
                  ['Email', form.email],
                  ['Phone', form.phone],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <View key={k} style={s.summaryRow}>
                    <Text style={s.summaryKey}>{k}</Text>
                    <Text style={s.summaryVal}>{v}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep(p => p - 1)} disabled={loading}>
            <Text style={s.btnSecondaryText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity style={s.btnPrimary} onPress={() => setStep(p => p + 1)}>
            <Text style={s.btnPrimaryText}>Continue</Text>
            <FontAwesome5 name="arrow-right" size={13} color={COLORS.white} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.btnPrimary, { backgroundColor: '#059669' }]} onPress={handleSaveClient} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.white} />
              : <>
                  <FontAwesome5 name="user-check" size={14} color={COLORS.white} />
                  <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Save Client</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
      {/* ── INVITE TOKEN MODAL ── */}
      <Modal visible={tokenModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalIconWrap}>
              <FontAwesome5 name="envelope-open-text" size={28} color={COLORS.primary} />
            </View>
            <Text style={s.modalTitle}>Client Invited!</Text>
            <Text style={s.modalSub}>
              An invitation email has been sent to{'\n'}
              <Text style={{ fontWeight: '700', color: COLORS.dark }}>{form.email}</Text>
            </Text>

            <Text style={s.modalTokenLabel}>Invite Token</Text>
            <View style={s.tokenBox}>
              <Text style={s.tokenText} numberOfLines={2} selectable>{inviteToken}</Text>
            </View>
            <Text style={s.modalHint}>The client can use this token to create their account.</Text>

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalBtnShare}
                onPress={() => Share.share({ message: `Your LegalHub invite token: ${inviteToken}` })}
              >
                <FontAwesome5 name="share-alt" size={14} color={COLORS.primary} />
                <Text style={s.modalBtnShareText}>Share Token</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalBtnClose}
                onPress={() => { setTokenModal(false); navigation?.goBack(); }}
              >
                <Text style={s.modalBtnCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
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
      {icon && <FontAwesome5 name={icon} size={13} color={COLORS.gray400} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} />}
      <TextInput style={[s.input, icon && { paddingLeft: 42 }]} placeholder={placeholder} placeholderTextColor={COLORS.gray400} value={value} onChangeText={onChange} />
    </View>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.primary },
  scroll: { flex: 1, backgroundColor: COLORS.gray50 },
  header: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  progressWrap: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 12, color: COLORS.gray500 },
  progressPct: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  progressBar: { height: 6, backgroundColor: COLORS.gray200, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel: { fontSize: 11, color: COLORS.gray400 },
  stepLabelActive: { color: COLORS.primary, fontWeight: '700' },
  section: { margin: 16, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  typeBtnTextActive: { color: COLORS.white },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1.5, borderColor: COLORS.gray200 },
  radioRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.blue50 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  radioText: { fontSize: 14, color: COLORS.gray600, fontWeight: '500' },
  radioTextActive: { color: COLORS.primary, fontWeight: '600' },
  summaryCard: { backgroundColor: COLORS.blue50, borderRadius: 16, padding: 14, marginTop: 12 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#DBEAFE' },
  summaryKey: { fontSize: 12, color: COLORS.gray500 },
  summaryVal: { fontSize: 12, fontWeight: '600', color: COLORS.dark },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnSecondary: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.gray600 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: COLORS.white, borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark, marginBottom: 8 },
  modalSub: { fontSize: 13, color: COLORS.gray500, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  modalTokenLabel: { fontSize: 12, fontWeight: '600', color: COLORS.gray500, alignSelf: 'flex-start', marginBottom: 6 },
  tokenBox: { width: '100%', backgroundColor: COLORS.blue50, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 8 },
  tokenText: { fontSize: 13, fontWeight: '700', color: COLORS.primary, letterSpacing: 1, textAlign: 'center' },
  modalHint: { fontSize: 11, color: COLORS.gray400, textAlign: 'center', marginBottom: 24 },
  modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  modalBtnShare: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.primary },
  modalBtnShareText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  modalBtnClose: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primary },
  modalBtnCloseText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});