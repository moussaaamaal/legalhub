import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, Modal, Platform,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { authAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  purple50: '#FAF5FF', purple600: '#9333EA',
  red50: '#FEF2F2', red600: '#DC2626',
};

const NOTIF_TYPES = [
  { key: 'case_updates',     label: 'Case Updates',              icon: 'briefcase',      iconBg: C.blue50,   iconColor: C.primary   },
  { key: 'new_invoices',     label: 'New Invoices',              icon: 'file-invoice',   iconBg: C.amber50,  iconColor: C.amber600  },
  { key: 'document_updates', label: 'Document Approvals',        icon: 'file-alt',       iconBg: C.green50,  iconColor: C.green600  },
  { key: 'appointments',     label: 'Appointment Confirmations', icon: 'calendar-check', iconBg: C.purple50, iconColor: C.purple600 },
  { key: 'reminders',        label: 'Reminders',                 icon: 'bell',           iconBg: C.amber50,  iconColor: C.amber600  },
  { key: 'payments',         label: 'Payment Receipts',          icon: 'credit-card',    iconBg: C.green50,  iconColor: C.green600  },
];

function formatHour(date) {
  if (!date) return '--:--';
  const h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function timeStringToDate(str) {
  if (!str) return new Date();
  const [h, m] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function dateToTimeString(date) {
  if (!date) return '00:00';
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function SwitchRow({ label, icon, iconBg, iconColor, value, onValueChange, disabled }) {
  return (
    <View style={s.switchRow}>
      <View style={[s.switchIcon, { backgroundColor: iconBg }]}>
        <FontAwesome5 name={icon} size={13} color={iconColor} />
      </View>
      <Text style={s.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: C.g200, true: C.primary + '70' }}
        thumbColor={value ? C.primary : C.white}
        ios_backgroundColor={C.g200}
      />
    </View>
  );
}

export default function ClientSettingsScreen({ navigation }) {
  const [prefs, setPrefs]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // Silent hours
  const [silentEnabled, setSilentEnabled] = useState(false);
  const [silentStart, setSilentStart]     = useState(new Date());
  const [silentEnd, setSilentEnd]         = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);

  // Notification toggles keyed by NOTIF_TYPES[i].key
  const [toggles, setToggles] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authAPI.getNotifPreferences();
      setPrefs(data);
      const initial = {};
      NOTIF_TYPES.forEach(({ key }) => {
        initial[key] = data[key] !== false;
      });
      setToggles(initial);
      setSilentEnabled(!!data.silent_hours_enabled);
      if (data.silent_start) setSilentStart(timeStringToDate(data.silent_start));
      if (data.silent_end)   setSilentEnd(timeStringToDate(data.silent_end));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authAPI.updateNotifPreferences({
        ...toggles,
        silent_hours_enabled: silentEnabled,
        silent_start: silentEnabled ? dateToTimeString(silentStart) : null,
        silent_end:   silentEnabled ? dateToTimeString(silentEnd)   : null,
      });
      Alert.alert('Saved', 'Your notification preferences have been updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notification Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Notification Types */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}><FontAwesome5 name="bell" size={13} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Notification Types</Text>
                <Text style={s.cardSubtitle}>Choose what you'd like to be notified about</Text>
              </View>
            </View>
            {NOTIF_TYPES.map(({ key, label, icon, iconBg, iconColor }) => (
              <SwitchRow
                key={key}
                label={label}
                icon={icon}
                iconBg={iconBg}
                iconColor={iconColor}
                value={toggles[key] ?? true}
                onValueChange={() => toggle(key)}
              />
            ))}
          </View>

          {/* Silent Hours */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}><FontAwesome5 name="moon" size={13} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Silent Hours</Text>
                <Text style={s.cardSubtitle}>Pause notifications during set hours</Text>
              </View>
            </View>

            <View style={s.switchRow}>
              <View style={[s.switchIcon, { backgroundColor: C.purple50 }]}>
                <FontAwesome5 name="moon" size={13} color={C.purple600} />
              </View>
              <Text style={s.switchLabel}>Enable Silent Hours</Text>
              <Switch
                value={silentEnabled}
                onValueChange={setSilentEnabled}
                trackColor={{ false: C.g200, true: C.primary + '70' }}
                thumbColor={silentEnabled ? C.primary : C.white}
                ios_backgroundColor={C.g200}
              />
            </View>

            {silentEnabled && (
              <>
                {/* Start time */}
                <TouchableOpacity style={s.timePicker} onPress={() => setShowStartPicker(true)} activeOpacity={0.8}>
                  <View style={s.timePickerLeft}>
                    <Text style={s.timePickerLabel}>From</Text>
                    <Text style={s.timePickerValue}>{formatHour(silentStart)}</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
                </TouchableOpacity>

                {/* End time */}
                <TouchableOpacity style={[s.timePicker, { marginBottom: 0 }]} onPress={() => setShowEndPicker(true)} activeOpacity={0.8}>
                  <View style={s.timePickerLeft}>
                    <Text style={s.timePickerLabel}>To</Text>
                    <Text style={s.timePickerValue}>{formatHour(silentEnd)}</Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
                </TouchableOpacity>

                {showStartPicker && (
                  <DateTimePicker
                    value={silentStart}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => { setShowStartPicker(false); if (d) setSilentStart(d); }}
                  />
                )}
                {showEndPicker && (
                  <DateTimePicker
                    value={silentEnd}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => { setShowEndPicker(false); if (d) setSilentEnd(d); }}
                  />
                )}
              </>
            )}
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color={C.white} />
              : <>
                  <FontAwesome5 name="check" size={14} color={C.white} style={{ marginRight: 10 }} />
                  <Text style={s.saveBtnTxt}>Save Preferences</Text>
                </>
            }
          </TouchableOpacity>
        </ScrollView>
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

  card:         { backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.g200, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.dark },
  cardSubtitle: { fontSize: 12, color: C.g500, marginTop: 2 },

  switchRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  switchIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  switchLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: C.dark },

  timePicker:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.g50, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.g200 },
  timePickerLeft: { flex: 1 },
  timePickerLabel:{ fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 2 },
  timePickerValue:{ fontSize: 16, fontWeight: '700', color: C.dark },

  saveBtn:    { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnTxt: { color: C.white, fontSize: 16, fontWeight: '800' },
});
