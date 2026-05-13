import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  red50: '#FEF2F2', red600: '#DC2626',
  green600: '#16A34A',
};

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];

function FormField({ icon, label, value, onChangeText, placeholder, keyboardType, editable = true }) {
  return (
    <View style={s.field}>
      <View style={s.fieldLabelRow}>
        <View style={s.fieldIcon}>
          <FontAwesome5 name={icon} size={11} color={C.primary} />
        </View>
        <Text style={s.fieldLabel}>{label}</Text>
      </View>
      <TextInput
        style={[s.input, !editable && s.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        placeholderTextColor={C.g400}
        keyboardType={keyboardType || 'default'}
        editable={editable}
        autoCapitalize="sentences"
      />
    </View>
  );
}

function GenderSelector({ value, onChange }) {
  return (
    <View style={s.field}>
      <View style={s.fieldLabelRow}>
        <View style={s.fieldIcon}>
          <FontAwesome5 name="venus-mars" size={11} color={C.primary} />
        </View>
        <Text style={s.fieldLabel}>Gender</Text>
      </View>
      <View style={s.genderRow}>
        {GENDER_OPTIONS.map(g => (
          <TouchableOpacity
            key={g}
            style={[s.genderBtn, value === g && s.genderBtnActive]}
            onPress={() => onChange(value === g ? '' : g)}
            activeOpacity={0.8}
          >
            <Text style={[s.genderBtnTxt, value === g && s.genderBtnTxtActive]}>
              {g.charAt(0) + g.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function ClientEditProfileScreen({ navigation, route }) {
  const initialProfile = route?.params?.profile || null;

  const [form, setForm] = useState({
    phone:          initialProfile?.phone          || '',
    whatsapp_number:initialProfile?.whatsapp_number|| '',
    date_of_birth:  initialProfile?.date_of_birth  || '',
    gender:         initialProfile?.gender         || '',
    nationality:    initialProfile?.nationality    || '',
    occupation:     initialProfile?.occupation     || '',
    company_name:   initialProfile?.company_name   || '',
    address:        initialProfile?.address        || '',
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialProfile);

  useEffect(() => {
    if (initialProfile) return;
    clientPortalAPI.profile()
      .then(d => {
        setForm({
          phone:          d.phone           || '',
          whatsapp_number:d.whatsapp_number || '',
          date_of_birth:  d.date_of_birth   || '',
          gender:         d.gender          || '',
          nationality:    d.nationality     || '',
          occupation:     d.occupation      || '',
          company_name:   d.company_name    || '',
          address:        d.address         || '',
        });
      })
      .catch(() => Alert.alert('Error', 'Could not load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== null && v !== undefined) payload[k] = v.trim() === '' ? null : v.trim();
    });

    setSaving(true);
    try {
      await clientPortalAPI.updateProfile(payload);
      Alert.alert('Success', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} style={s.saveBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={C.white} />
            : <Text style={s.saveBtnTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={s.scroll}
            contentContainerStyle={{ paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.infoBox}>
              <FontAwesome5 name="info-circle" size={13} color={C.primary} />
              <Text style={s.infoTxt}>
                You can update your contact details and personal information below.
              </Text>
            </View>

            {/* Contact */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Contact</Text>
              <FormField
                icon="phone" label="Phone"
                value={form.phone} onChangeText={set('phone')}
                keyboardType="phone-pad"
              />
              <FormField
                icon="whatsapp" label="WhatsApp"
                value={form.whatsapp_number} onChangeText={set('whatsapp_number')}
                keyboardType="phone-pad"
              />
              <FormField
                icon="map-marker-alt" label="Address"
                value={form.address} onChangeText={set('address')}
              />
            </View>

            {/* Personal */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Personal</Text>
              <FormField
                icon="birthday-cake" label="Date of Birth"
                value={form.date_of_birth} onChangeText={set('date_of_birth')}
                placeholder="YYYY-MM-DD"
              />
              <GenderSelector value={form.gender} onChange={set('gender')} />
              <FormField
                icon="flag" label="Nationality"
                value={form.nationality} onChangeText={set('nationality')}
              />
            </View>

            {/* Professional */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Professional</Text>
              <FormField
                icon="briefcase" label="Occupation"
                value={form.occupation} onChangeText={set('occupation')}
              />
              <FormField
                icon="building" label="Company"
                value={form.company_name} onChangeText={set('company_name')}
              />
            </View>

            <TouchableOpacity style={s.saveFullBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator size="small" color={C.white} />
                : <>
                    <FontAwesome5 name="check" size={14} color={C.white} style={{ marginRight: 8 }} />
                    <Text style={s.saveFullBtnTxt}>Save Changes</Text>
                  </>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  saveBtn:     { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnTxt:  { color: C.white, fontWeight: '700', fontSize: 14 },

  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: 16, backgroundColor: C.blue50, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.blue100 },
  infoTxt:  { flex: 1, fontSize: 13, color: C.primary, fontWeight: '500', lineHeight: 18 },

  section:      { backgroundColor: C.white, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.g500, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 },

  field:         { marginBottom: 16 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fieldIcon:     { width: 24, height: 24, borderRadius: 7, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  fieldLabel:    { fontSize: 12, fontWeight: '700', color: C.g600 },

  input:         { backgroundColor: C.g50, borderRadius: 12, borderWidth: 1.5, borderColor: C.g200, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.dark, fontWeight: '500' },
  inputDisabled: { backgroundColor: C.g100, color: C.g400 },

  genderRow:       { flexDirection: 'row', gap: 10 },
  genderBtn:       { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.g200, alignItems: 'center', backgroundColor: C.g50 },
  genderBtnActive: { backgroundColor: C.blue50, borderColor: C.primary },
  genderBtnTxt:    { fontSize: 13, fontWeight: '600', color: C.g500 },
  genderBtnTxtActive: { color: C.primary, fontWeight: '700' },

  saveFullBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, marginTop: 4, backgroundColor: C.primary, borderRadius: 18, paddingVertical: 16 },
  saveFullBtnTxt: { color: C.white, fontWeight: '800', fontSize: 15 },
});
