import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontAwesome5 } from '@expo/vector-icons';
import { casesAPI, clientsAPI, firmAPI } from '../../services/api';

const COLORS = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray300: '#D1D5DB', gray400: '#9CA3AF',
  gray500: '#6B7280', gray600: '#4B5563', blue50: '#EFF6FF',
};

const CASE_TYPES = ['Criminal Law', 'Civil Law', 'Corporate Law', 'Family Law', 'Real Estate Law', 'Immigration Law', 'Personal Injury', 'Intellectual Property'];
const PRIORITIES = [
  { label: 'Low',    color: '#16A34A', bg: '#F0FDF4', border: '#DCFCE7' },
  { label: 'Medium', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { label: 'High',   color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { label: 'Urgent', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
];
const CASE_TYPE_MAP = {
  'Criminal Law': 'CRIMINAL', 'Civil Law': 'CIVIL',
  'Corporate Law': 'CORPORATE', 'Family Law': 'FAMILY',
  'Real Estate Law': 'REAL_ESTATE', 'Immigration Law': 'IMMIGRATION',
  'Personal Injury': 'PERSONAL_INJURY', 'Intellectual Property': 'IP',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toISO = (d) => d.toISOString().split('T')[0];

// ─── Helper: build display name ───────────────────────────────────────────────
const displayName = (item) =>
  item.full_name ||
  [item.first_name, item.last_name].filter(Boolean).join(' ') ||
  item.name ||
  item.email ||
  '';

// ─── Autocomplete Field ───────────────────────────────────────────────────────
const AutocompleteField = ({ label, placeholder, value, onChange, results, onSelect, showDrop, icon }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={s.label}>{label}</Text>
    <View style={s.inputWrap}>
      {icon && <FontAwesome5 name={icon} size={14} color={COLORS.gray400} style={s.inputIcon} />}
      <TextInput
        style={[s.input, { paddingLeft: 44 }]}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray400}
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
      />
    </View>
    {showDrop && results.length > 0 && (
      <View style={s.dropdown}>
        {results.slice(0, 6).map((item, idx) => (
          <TouchableOpacity
            key={item.id ?? idx}
            style={[s.dropItem, idx < Math.min(results.length, 6) - 1 && s.dropItemBorder]}
            onPress={() => onSelect(item)}
          >
            <FontAwesome5 name="user-circle" size={14} color={COLORS.secondary} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.dropItemText}>{displayName(item)}</Text>
              {item.email && <Text style={s.dropItemSub}>{item.email}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
);

// ─── Calendar Strip (same design as ScheduleScreen) ──────────────────────────
const CalendarStrip = ({ label, selectedDate, onSelect, calendarBase, onPrev, onNext }) => {
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarBase);
    d.setDate(calendarBase.getDate() + i);
    return d;
  });

  const todayISO = toISO(new Date());

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.calStrip}>
        {/* Month / year header */}
        <View style={s.calMonthRow}>
          <TouchableOpacity onPress={onPrev} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <FontAwesome5 name="chevron-left" size={13} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={s.calMonthText}>
            {calendarBase.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <FontAwesome5 name="chevron-right" size={13} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Day chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 4 }}
        >
          {weekDays.map((d, i) => {
            const iso = toISO(d);
            const isSelected = selectedDate === iso;
            const isToday = iso === todayISO;
            return (
              <TouchableOpacity
                key={i}
                style={[s.calDayBtn, isSelected && s.calDayBtnSelected]}
                onPress={() => onSelect(iso)}
              >
                <Text style={[s.calDayName, isSelected && s.calDayNameSelected]}>
                  {DAYS[d.getDay()]}
                </Text>
                <Text style={[s.calDayNum, isSelected && s.calDayNumSelected]}>
                  {d.getDate()}
                </Text>
                {isToday && (
                  <View style={[s.calTodayDot, isSelected && { backgroundColor: COLORS.white }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected date label */}
        {selectedDate ? (
          <Text style={s.calSelectedText}>
            <FontAwesome5 name="check-circle" size={11} color={COLORS.primary} />
            {'  '}{selectedDate}
          </Text>
        ) : (
          <Text style={s.calSelectedText}>No date selected</Text>
        )}
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddCaseScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', caseType: '', priority: '',
    court: '', judge: '', filingDate: '', description: '', notes: '',
  });

  // ── Client autocomplete ──
  const [clientSearch, setClientSearch]         = useState('');
  const [clientResults, setClientResults]       = useState([]);
  const [showClientDrop, setShowClientDrop]     = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const clientDebounce = useRef(null);

  // ── Attorney autocomplete ──
  const [attorneySearch, setAttorneySearch]         = useState('');
  const [allAttorneys, setAllAttorneys]             = useState([]);
  const [attorneyResults, setAttorneyResults]       = useState([]);
  const [showAttorneyDrop, setShowAttorneyDrop]     = useState(false);
  const [selectedAttorneyId, setSelectedAttorneyId] = useState(null);

  // ── Calendar strip ──
  const [calendarBase, setCalendarBase] = useState(new Date());

  const progress = (step / 3) * 100;
  const update = (key, val) => setForm(p => ({ ...p, [key]: val }));

  // Load team members once
  useEffect(() => {
    firmAPI.getTeam()
      .then(data => {
        const members = Array.isArray(data) ? data : (data.members || data.team || []);
        setAllAttorneys(members);
      })
      .catch(() => {});
  }, []);

  // ── Client search ──
  const onClientChange = (text) => {
    setClientSearch(text);
    setSelectedClientId(null);
    if (clientDebounce.current) clearTimeout(clientDebounce.current);
    if (!text.trim()) { setClientResults([]); setShowClientDrop(false); return; }
    clientDebounce.current = setTimeout(async () => {
      try {
        const data = await clientsAPI.list({ search: text });
        const list = Array.isArray(data) ? data : (data.clients || data.results || []);
        setClientResults(list);
        setShowClientDrop(list.length > 0);
      } catch { setClientResults([]); setShowClientDrop(false); }
    }, 300);
  };

  const selectClient = (item) => {
    setClientSearch(displayName(item));
    setSelectedClientId(item.id);
    setClientResults([]);
    setShowClientDrop(false);
  };

  // ── Attorney search ──
  const onAttorneyChange = (text) => {
    setAttorneySearch(text);
    setSelectedAttorneyId(null);
    if (!text.trim()) { setAttorneyResults([]); setShowAttorneyDrop(false); return; }
    const lower = text.toLowerCase();
    const filtered = allAttorneys.filter(m =>
      displayName(m).toLowerCase().includes(lower)
    );
    setAttorneyResults(filtered);
    setShowAttorneyDrop(filtered.length > 0);
  };

  const selectAttorney = (item) => {
    setAttorneySearch(displayName(item));
    setSelectedAttorneyId(item.id);
    setAttorneyResults([]);
    setShowAttorneyDrop(false);
  };

  // ── Calendar navigation ──
  const prevWeek = () => {
    const d = new Date(calendarBase);
    d.setDate(d.getDate() - 7);
    setCalendarBase(d);
  };
  const nextWeek = () => {
    const d = new Date(calendarBase);
    d.setDate(d.getDate() + 7);
    setCalendarBase(d);
  };

  // ── Submit ──
  const handleCreateCase = async () => {
    if (!form.title.trim()) { Alert.alert('Missing Field', 'Case title is required.'); return; }
    if (!form.caseType)     { Alert.alert('Missing Field', 'Please select a case type.'); return; }

    setLoading(true);
    try {
      await casesAPI.create({
        title:       form.title,
        case_number: `CASE-${Date.now()}`,
        case_type:   CASE_TYPE_MAP[form.caseType] || 'CIVIL',
        priority:    form.priority?.toUpperCase() || 'NORMAL',
        description: form.description,
        court_name:  form.court,
        judge_name:  form.judge,
        filing_date: form.filingDate || null,
        ...(selectedClientId  ? { client_id: selectedClientId }   : {}),
        ...(selectedAttorneyId ? { attorney_id: selectedAttorneyId } : {}),
      });
      Alert.alert('Success', 'Case created successfully!', [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add New Case</Text>
          <View style={s.backBtn} />
        </View>
      </View>

      {/* Progress */}
      <View style={s.progressWrap}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>Step {step} of 3</Text>
          <Text style={s.progressPct}>{Math.round(progress)}%</Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={s.stepsRow}>
          {['Case Info', 'Parties', 'Details'].map((l, i) => (
            <Text key={i} style={[s.stepLabel, step === i + 1 && s.stepLabelActive]}>{l}</Text>
          ))}
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.iconWrap}>
                <FontAwesome5 name="briefcase" size={22} color={COLORS.white} />
              </View>
              <View>
                <Text style={s.sectionTitle}>Case Information</Text>
                <Text style={s.sectionSub}>Basic case details</Text>
              </View>
            </View>

            <Field label="Case Title *" placeholder="e.g., State vs. Johnson" value={form.title} onChange={v => update('title', v)} icon="gavel" />

            <Text style={s.label}>Case Type *</Text>
            <View style={s.typeGrid}>
              {CASE_TYPES.map(t => (
                <TouchableOpacity key={t} style={[s.typeBtn, form.caseType === t && s.typeBtnActive]} onPress={() => update('caseType', t)}>
                  <Text style={[s.typeBtnText, form.caseType === t && s.typeBtnTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Priority Level *</Text>
            <View style={s.priorityRow}>
              {PRIORITIES.map(p => (
                <TouchableOpacity key={p.label}
                  style={[s.priorityBtn, { backgroundColor: p.bg, borderColor: form.priority === p.label ? p.color : p.border }]}
                  onPress={() => update('priority', p.label)}
                >
                  <FontAwesome5 name="flag" size={10} color={p.color} />
                  <Text style={[s.priorityText, { color: p.color }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={[s.iconWrap, { backgroundColor: '#7C3AED' }]}>
                <FontAwesome5 name="users" size={22} color={COLORS.white} />
              </View>
              <View>
                <Text style={s.sectionTitle}>Parties Involved</Text>
                <Text style={s.sectionSub}>Client & legal team info</Text>
              </View>
            </View>

            <AutocompleteField
              label="Client Name *"
              placeholder="Search client by name..."
              value={clientSearch}
              onChange={onClientChange}
              results={clientResults}
              onSelect={selectClient}
              showDrop={showClientDrop}
              icon="user"
            />

            <AutocompleteField
              label="Assigned Attorney"
              placeholder="Search attorney by name..."
              value={attorneySearch}
              onChange={onAttorneyChange}
              results={attorneyResults}
              onSelect={selectAttorney}
              showDrop={showAttorneyDrop}
              icon="user-tie"
            />

            <Field label="Court / Jurisdiction" placeholder="e.g., Superior Court" value={form.court} onChange={v => update('court', v)} icon="landmark" />
            <Field label="Judge Name" placeholder="Honorable..." value={form.judge} onChange={v => update('judge', v)} icon="gavel" />

            {/* Filing Date — calendar strip */}
            <CalendarStrip
              label="Filing Date"
              selectedDate={form.filingDate}
              onSelect={v => update('filingDate', v)}
              calendarBase={calendarBase}
              onPrev={prevWeek}
              onNext={nextWeek}
            />
          </View>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={[s.iconWrap, { backgroundColor: '#059669' }]}>
                <FontAwesome5 name="file-alt" size={22} color={COLORS.white} />
              </View>
              <View>
                <Text style={s.sectionTitle}>Case Details</Text>
                <Text style={s.sectionSub}>Description & notes</Text>
              </View>
            </View>

            <Text style={s.label}>Case Description</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Describe the case, key facts, charges..."
              placeholderTextColor={COLORS.gray400}
              value={form.description}
              onChangeText={v => update('description', v)}
              multiline numberOfLines={5}
            />

            <Text style={s.label}>Internal Notes</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Private notes for legal team only..."
              placeholderTextColor={COLORS.gray400}
              value={form.notes}
              onChangeText={v => update('notes', v)}
              multiline numberOfLines={4}
            />

            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Case Summary</Text>
              {[
                ['Title',    form.title],
                ['Type',     form.caseType],
                ['Priority', form.priority],
                ['Client',   clientSearch],
                ['Attorney', attorneySearch],
                ['Filing',   form.filingDate],
              ].map(([k, v]) => v ? (
                <View key={k} style={s.summaryRow}>
                  <Text style={s.summaryKey}>{k}</Text>
                  <Text style={s.summaryVal}>{v}</Text>
                </View>
              ) : null)}
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        {step > 1 && (
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep(p => p - 1)} disabled={loading}>
            <Text style={s.btnSecondaryText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity style={s.btnPrimary} onPress={() => setStep(p => p + 1)}>
            <Text style={s.btnPrimaryText}>Continue</Text>
            <FontAwesome5 name="arrow-right" size={14} color={COLORS.white} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.btnPrimary, { backgroundColor: '#059669' }]} onPress={handleCreateCase} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.white} />
              : <>
                  <FontAwesome5 name="check" size={14} color={COLORS.white} />
                  <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Create Case</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Simple Field ─────────────────────────────────────────────────────────────
const Field = ({ label, placeholder, value, onChange, icon }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={s.label}>{label}</Text>
    <View style={s.inputWrap}>
      {icon && <FontAwesome5 name={icon} size={14} color={COLORS.gray400} style={s.inputIcon} />}
      <TextInput style={[s.input, icon && { paddingLeft: 44 }]} placeholder={placeholder} placeholderTextColor={COLORS.gray400} value={value} onChangeText={onChange} />
    </View>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: COLORS.primary },
  scroll:           { flex: 1, backgroundColor: COLORS.gray50 },
  header:           { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:          { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:      { fontSize: 18, fontWeight: '700', color: COLORS.white },

  progressWrap:     { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  progressRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel:    { fontSize: 13, fontWeight: '600', color: COLORS.dark },
  progressPct:      { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  progressBar:      { height: 6, backgroundColor: COLORS.gray200, borderRadius: 3, marginBottom: 8 },
  progressFill:     { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  stepsRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel:        { fontSize: 11, color: COLORS.gray400 },
  stepLabelActive:  { color: COLORS.primary, fontWeight: '700' },

  section:          { margin: 16, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  iconWrap:         { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:     { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  sectionSub:       { fontSize: 12, color: COLORS.gray500 },

  label:            { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  inputWrap:        { position: 'relative' },
  inputIcon:        { position: 'absolute', left: 14, top: 14, zIndex: 1 },
  input:            { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },
  textarea:         { height: 100, textAlignVertical: 'top', paddingTop: 12 },

  // Autocomplete dropdown
  dropdown:         { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  dropItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  dropItemBorder:   { borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  dropItemText:     { fontSize: 14, color: COLORS.dark, fontWeight: '500' },
  dropItemSub:      { fontSize: 11, color: COLORS.gray400, marginTop: 1 },

  // Calendar strip
  calStrip:         { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.gray200, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  calMonthRow:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 12, paddingHorizontal: 16 },
  calMonthText:     { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  calDayBtn:        { width: 52, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.gray50, borderWidth: 1.5, borderColor: COLORS.gray200 },
  calDayBtnSelected:{ backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  calDayName:       { fontSize: 11, color: COLORS.gray500, fontWeight: '600' },
  calDayNameSelected: { color: 'rgba(255,255,255,0.8)' },
  calDayNum:        { fontSize: 17, fontWeight: '800', color: COLORS.dark },
  calDayNumSelected:{ color: COLORS.white },
  calTodayDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  calSelectedText:  { fontSize: 12, color: COLORS.gray500, textAlign: 'center', marginTop: 10, marginBottom: 4, fontWeight: '500' },

  // Case type / priority
  typeGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  typeBtnActive:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeBtnText:      { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  typeBtnTextActive:{ color: COLORS.white },
  priorityRow:      { flexDirection: 'row', gap: 8, marginBottom: 16 },
  priorityBtn:      { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', gap: 4 },
  priorityText:     { fontSize: 11, fontWeight: '700' },

  // Summary
  summaryCard:      { backgroundColor: COLORS.blue50, borderRadius: 16, padding: 14, marginTop: 8 },
  summaryTitle:     { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 10 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#DBEAFE' },
  summaryKey:       { fontSize: 12, color: COLORS.gray500 },
  summaryVal:       { fontSize: 12, fontWeight: '600', color: COLORS.dark },

  // Footer
  footer:           { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary:       { flex: 1, flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:   { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnSecondary:     { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.gray600 },
});
