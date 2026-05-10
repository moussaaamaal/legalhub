import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Modal,
  TextInput, Alert, Platform, Linking,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
  purple50: '#FAF5FF', purple600: '#9333EA',
  red50: '#FEF2F2', red600: '#DC2626',
};

const MEETING_TYPES = [
  { value: 'IN_PERSON', label: 'In Person',  icon: 'building'   },
  { value: 'VIDEO',     label: 'Video Call',  icon: 'video'      },
  { value: 'PHONE',     label: 'Phone Call',  icon: 'phone'      },
];

const TYPE_CONFIG = {
  IN_PERSON: { label: 'In Person',  color: C.primary,  bg: C.blue50,   icon: 'building'    },
  VIDEO:     { label: 'Video Call', color: C.green600, bg: C.green50,  icon: 'video'       },
  PHONE:     { label: 'Phone Call', color: C.amber600, bg: C.amber50,  icon: 'phone'       },
  DEFAULT:   { label: 'Meeting',    color: C.purple600, bg: C.purple50, icon: 'calendar-alt' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function AppointmentCard({ event, onJoin, onRemind }) {
  const start   = event.start_time ? new Date(event.start_time) : null;
  const tc      = TYPE_CONFIG[event.meeting_type] || TYPE_CONFIG.DEFAULT;
  const isPast  = start && start < new Date();
  const canJoin = !isPast && !!event.meeting_link;

  return (
    <View style={[s.card, isPast && { opacity: 0.65 }]}>
      {/* Date box + info */}
      <View style={s.cardMain}>
        {start ? (
          <View style={[s.dateBox, { backgroundColor: isPast ? C.g100 : C.blue50 }]}>
            <Text style={[s.dateDay, { color: isPast ? C.g400 : C.primary }]}>
              {start.getDate()}
            </Text>
            <Text style={[s.dateMon, { color: isPast ? C.g400 : C.secondary }]}>
              {MONTHS[start.getMonth()]}
            </Text>
            <Text style={[s.dateWeekday, { color: isPast ? C.g400 : C.g500 }]}>
              {DAYS[start.getDay()]}
            </Text>
          </View>
        ) : (
          <View style={[s.dateBox, { backgroundColor: C.g100, justifyContent: 'center' }]}>
            <FontAwesome5 name="calendar-alt" size={22} color={C.g400} />
          </View>
        )}

        <View style={s.cardInfo}>
          <Text style={s.cardTitle} numberOfLines={2}>{event.title || 'Appointment'}</Text>

          <View style={s.rowWrap}>
            {/* Type pill */}
            <View style={[s.typePill, { backgroundColor: tc.bg }]}>
              <FontAwesome5 name={tc.icon} size={9} color={tc.color} style={{ marginRight: 4 }} />
              <Text style={[s.typePillTxt, { color: tc.color }]}>{tc.label}</Text>
            </View>
            {/* Time */}
            {start && (
              <View style={s.timePill}>
                <FontAwesome5 name="clock" size={9} color={C.g500} style={{ marginRight: 4 }} />
                <Text style={s.timePillTxt}>{formatTime(event.start_time)}</Text>
              </View>
            )}
          </View>

          {!!event.location && (
            <View style={s.locationRow}>
              <FontAwesome5 name="map-marker-alt" size={10} color={C.g400} style={{ marginRight: 5 }} />
              <Text style={s.locationTxt} numberOfLines={1}>{event.location}</Text>
            </View>
          )}

          {!!event.attorney_name && (
            <View style={s.locationRow}>
              <FontAwesome5 name="user-tie" size={10} color={C.primary} style={{ marginRight: 5 }} />
              <Text style={[s.locationTxt, { color: C.primary }]}>{event.attorney_name}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      {!isPast && (
        <View style={s.cardActions}>
          {canJoin && (
            <TouchableOpacity style={s.joinBtn} onPress={() => onJoin(event.meeting_link)} activeOpacity={0.8}>
              <FontAwesome5 name="video" size={12} color={C.white} style={{ marginRight: 6 }} />
              <Text style={s.joinBtnTxt}>Join Video</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.remindBtn} onPress={() => onRemind(event)} activeOpacity={0.8}>
            <FontAwesome5 name="bell" size={12} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={s.remindBtnTxt}>Remind Me</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ClientAppointmentsScreen({ navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // Request meeting modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle]               = useState('');
  const [meetingType, setMeetingType]   = useState('IN_PERSON');
  const [preferredDate, setPreferredDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notes, setNotes]               = useState('');
  const [submitting, setSubmitting]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await clientPortalAPI.appointments();
      setAppointments(Array.isArray(data) ? data : (data?.appointments || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleJoin = (link) => {
    Linking.openURL(link).catch(() =>
      Alert.alert('Cannot Open Link', 'The meeting link could not be opened.')
    );
  };

  const handleRemind = (event) => {
    const start = event.start_time ? new Date(event.start_time) : null;
    const dateStr = start
      ? start.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }) + ' at ' + formatTime(event.start_time)
      : 'the scheduled time';
    Alert.alert(
      'Reminder Set',
      `You'll be reminded about "${event.title || 'Appointment'}" on ${dateStr}.`,
      [{ text: 'OK' }]
    );
  };

  const resetForm = () => {
    setTitle('');
    setMeetingType('IN_PERSON');
    setPreferredDate(new Date());
    setNotes('');
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a meeting title.');
      return;
    }
    setSubmitting(true);
    try {
      await clientPortalAPI.requestMeeting({
        title: title.trim(),
        meeting_type: meetingType,
        preferred_date: preferredDate.toISOString(),
        notes: notes.trim() || undefined,
      });
      setModalVisible(false);
      resetForm();
      Alert.alert('Request Sent', 'Your meeting request has been submitted. Your attorney will confirm the time.');
      load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send meeting request.');
    } finally {
      setSubmitting(false);
    }
  };

  const upcoming = appointments.filter(a => !a.start_time || new Date(a.start_time) >= new Date());
  const past     = appointments.filter(a =>  a.start_time  && new Date(a.start_time) <  new Date());

  const formatPickedDate = (d) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) +
    '  ' + formatTime(d.toISOString());

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Appointments</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : appointments.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="calendar-alt" size={28} color={C.g400} />
          </View>
          <Text style={s.emptyTitle}>No Appointments</Text>
          <Text style={s.emptySubtitle}>Request a meeting with your attorney</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
            <FontAwesome5 name="plus" size={13} color={C.white} style={{ marginRight: 8 }} />
            <Text style={s.emptyBtnTxt}>Request Meeting</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {upcoming.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Upcoming</Text>
              {upcoming.map((ev, i) => (
                <AppointmentCard key={ev.id || i} event={ev} onJoin={handleJoin} onRemind={handleRemind} />
              ))}
            </>
          )}

          {past.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>Past</Text>
              {past.map((ev, i) => (
                <AppointmentCard key={ev.id || i} event={ev} onJoin={handleJoin} onRemind={handleRemind} />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      {!loading && appointments.length > 0 && (
        <TouchableOpacity style={s.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
          <FontAwesome5 name="plus" size={18} color={C.white} />
        </TouchableOpacity>
      )}

      {/* Request Meeting Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Drag handle */}
            <View style={s.modalHandle} />

            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Request a Meeting</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }} style={s.modalClose}>
                <Ionicons name="close" size={20} color={C.g500} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={s.fieldLabel}>Meeting Title <Text style={{ color: C.red600 }}>*</Text></Text>
              <TextInput
                style={s.textInput}
                placeholder="e.g. Case review, Contract discussion..."
                placeholderTextColor={C.g400}
                value={title}
                onChangeText={setTitle}
              />

              {/* Meeting Type */}
              <Text style={s.fieldLabel}>Meeting Type</Text>
              <View style={s.typeRow}>
                {MEETING_TYPES.map(mt => (
                  <TouchableOpacity
                    key={mt.value}
                    style={[s.typeChip, meetingType === mt.value && s.typeChipActive]}
                    onPress={() => setMeetingType(mt.value)}
                    activeOpacity={0.8}
                  >
                    <FontAwesome5 name={mt.icon} size={11} color={meetingType === mt.value ? C.white : C.g500} style={{ marginRight: 5 }} />
                    <Text style={[s.typeChipTxt, meetingType === mt.value && s.typeChipTxtActive]}>{mt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preferred Date & Time */}
              <Text style={s.fieldLabel}>Preferred Date & Time</Text>
              <TouchableOpacity style={s.datePicker} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                <FontAwesome5 name="calendar-alt" size={14} color={C.primary} style={{ marginRight: 10 }} />
                <Text style={s.datePickerTxt}>{formatPickedDate(preferredDate)}</Text>
                <FontAwesome5 name="chevron-right" size={11} color={C.g400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={preferredDate}
                  mode="date"
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    setShowDatePicker(false);
                    if (d) {
                      const updated = new Date(d);
                      updated.setHours(preferredDate.getHours(), preferredDate.getMinutes());
                      setPreferredDate(updated);
                      if (Platform.OS === 'android') setShowTimePicker(true);
                    }
                  }}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={preferredDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    setShowTimePicker(false);
                    if (d) setPreferredDate(d);
                  }}
                />
              )}

              {/* Notes */}
              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[s.textInput, { height: 88, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="Any specific topics or questions to discuss..."
                placeholderTextColor={C.g400}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <Text style={s.submitBtnTxt}>Send Request</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, padding: 24 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },

  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: C.dark, marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: C.g500, marginBottom: 24 },
  emptyBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  emptyBtnTxt:   { color: C.white, fontWeight: '700', fontSize: 14 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.g500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  card:       { backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  cardMain:   { flexDirection: 'row', alignItems: 'flex-start' },
  cardInfo:   { flex: 1, marginLeft: 12 },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 8 },
  rowWrap:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },

  dateBox:     { width: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 6 },
  dateDay:     { fontSize: 26, fontWeight: '900', lineHeight: 28 },
  dateMon:     { fontSize: 12, fontWeight: '700', marginTop: 2 },
  dateWeekday: { fontSize: 10, fontWeight: '600', marginTop: 1 },

  typePill:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  typePillTxt: { fontSize: 11, fontWeight: '700' },
  timePill:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g100, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  timePillTxt: { fontSize: 11, fontWeight: '600', color: C.g600 },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationTxt: { fontSize: 11, color: C.g500, flex: 1 },

  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.g100 },
  joinBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green600, paddingVertical: 10, borderRadius: 12 },
  joinBtnTxt:  { color: C.white, fontWeight: '700', fontSize: 13 },
  remindBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue50, paddingVertical: 10, borderRadius: 12 },
  remindBtnTxt:{ color: C.primary, fontWeight: '700', fontSize: 13 },

  fab: { position: 'absolute', bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '92%' },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.g200, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: C.dark },
  modalClose:   { width: 34, height: 34, borderRadius: 17, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },

  fieldLabel:   { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 8 },
  textInput:    { backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g200, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: C.dark, marginBottom: 18 },

  typeRow:         { flexDirection: 'row', gap: 8, marginBottom: 18 },
  typeChip:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.g100, borderWidth: 1.5, borderColor: 'transparent' },
  typeChipActive:  { backgroundColor: C.primary, borderColor: C.primary },
  typeChipTxt:     { fontSize: 12, fontWeight: '600', color: C.g500 },
  typeChipTxtActive:{ color: C.white, fontWeight: '700' },

  datePicker:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g200, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 18 },
  datePickerTxt: { fontSize: 14, color: C.dark, fontWeight: '500', flex: 1 },

  submitBtn:    { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  submitBtnTxt: { color: C.white, fontSize: 16, fontWeight: '800' },
});
