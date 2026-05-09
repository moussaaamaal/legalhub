import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { tasksAPI, casesAPI, firmAPI } from '../../services/api';

const COLORS = {
  amber: '#D97706', amberLight: '#FFFBEB', amberBorder: '#FDE68A',
  dark: '#1E293B', white: '#FFFFFF',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563',
  green: '#059669', greenBg: '#F0FDF4',
  red: '#DC2626', redBg: '#FEF2F2',
};

const PRIORITIES = [
  { key: 'low',    label: 'Low',    icon: 'arrow-down',  color: COLORS.green, bg: COLORS.greenBg, border: '#BBF7D0' },
  { key: 'medium', label: 'Medium', icon: 'minus',       color: COLORS.amber, bg: COLORS.amberLight, border: COLORS.amberBorder },
  { key: 'high',   label: 'High',   icon: 'arrow-up',    color: COLORS.red,   bg: COLORS.redBg,   border: '#FECACA' },
];

const CATEGORIES = [
  { label: 'Court Filing',     key: 'COURT_FILING'    },
  { label: 'Document Review',  key: 'DOC_REVIEW'      },
  { label: 'Client Meeting',   key: 'CLIENT_MEETING'  },
  { label: 'Research',         key: 'RESEARCH'        },
  { label: 'Correspondence',   key: 'CORRESPONDENCE'  },
  { label: 'Discovery',        key: 'DISCOVERY'       },
  { label: 'Billing',          key: 'BILLING'         },
  { label: 'Other',            key: 'OTHER'           },
];

const TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toISO = (d) => d.toISOString().split('T')[0];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const displayName = (item) =>
  item.full_name ||
  [item.first_name, item.last_name].filter(Boolean).join(' ') ||
  item.name || item.email || '';

const caseLabel = (c) =>
  [c.case_number, c.title].filter(Boolean).join(' — ');

// ─── Autocomplete Field ───────────────────────────────────────────────────────
const AutocompleteField = ({ label, placeholder, value, onChange, results, onSelect, showDrop, icon }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <View style={{ position: 'relative' }}>
      {icon && <FontAwesome5 name={icon} size={13} color={COLORS.gray400} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} />}
      <TextInput
        style={[s.input, { paddingLeft: 42 }]}
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
            <FontAwesome5 name={icon === 'briefcase' ? 'briefcase' : 'user-circle'} size={13} color={COLORS.amber} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.dropItemText} numberOfLines={1}>{icon === 'briefcase' ? caseLabel(item) : displayName(item)}</Text>
              {icon !== 'briefcase' && item.email && <Text style={s.dropItemSub}>{item.email}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    )}
  </View>
);

// ─── Calendar Strip ───────────────────────────────────────────────────────────
const CalendarStrip = ({ selectedDate, onSelect, calendarBase, onPrev, onNext }) => {
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarBase);
    d.setDate(calendarBase.getDate() + i);
    return d;
  });
  const todayISO = toISO(new Date());

  return (
    <View style={s.calStrip}>
      <View style={s.calMonthRow}>
        <TouchableOpacity onPress={onPrev} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <FontAwesome5 name="chevron-left" size={13} color={COLORS.amber} />
        </TouchableOpacity>
        <Text style={s.calMonthText}>
          {calendarBase.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <FontAwesome5 name="chevron-right" size={13} color={COLORS.amber} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 4 }}>
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
              <Text style={[s.calDayName, isSelected && s.calDayNameSelected]}>{DAYS[d.getDay()]}</Text>
              <Text style={[s.calDayNum, isSelected && s.calDayNumSelected]}>{d.getDate()}</Text>
              {isToday && <View style={[s.calTodayDot, isSelected && { backgroundColor: COLORS.white }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={s.calSelectedText}>
        {selectedDate || 'No date selected'}
      </Text>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddTaskScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', priority: 'medium', categoryKey: '',
    dueDate: '', dueTime: '', description: '',
    reminder: false, recurringTask: false,
  });
  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Case autocomplete ──
  const [caseSearch, setCaseSearch]         = useState('');
  const [caseResults, setCaseResults]       = useState([]);
  const [showCaseDrop, setShowCaseDrop]     = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const caseDebounce = useRef(null);

  // ── Assign To ──
  const [allMembers, setAllMembers]             = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [selectedMemberName, setSelectedMemberName] = useState('');

  // ── Calendar ──
  const [calendarBase, setCalendarBase] = useState(new Date());

  // Load team members once
  useEffect(() => {
    firmAPI.getTeam()
      .then(data => {
        const members = Array.isArray(data) ? data : (data.members || data.team || []);
        setAllMembers(members);
      })
      .catch(() => {});
  }, []);

  // ── Case search ──
  const onCaseChange = (text) => {
    setCaseSearch(text);
    setSelectedCaseId(null);
    if (caseDebounce.current) clearTimeout(caseDebounce.current);
    if (!text.trim()) { setCaseResults([]); setShowCaseDrop(false); return; }
    caseDebounce.current = setTimeout(async () => {
      try {
        const data = await casesAPI.list({ search: text });
        const list = Array.isArray(data) ? data : (data.cases || data.results || []);
        setCaseResults(list);
        setShowCaseDrop(list.length > 0);
      } catch { setCaseResults([]); setShowCaseDrop(false); }
    }, 300);
  };

  const selectCase = (item) => {
    setCaseSearch(caseLabel(item));
    setSelectedCaseId(item.id);
    setCaseResults([]);
    setShowCaseDrop(false);
  };

  // ── Calendar navigation ──
  const prevWeek = () => { const d = new Date(calendarBase); d.setDate(d.getDate() - 7); setCalendarBase(d); };
  const nextWeek = () => { const d = new Date(calendarBase); d.setDate(d.getDate() + 7); setCalendarBase(d); };

  // ── Submit ──
  const handleCreate = async () => {
    if (!form.title.trim()) { Alert.alert('Missing Field', 'Task title is required.'); return; }
    if (!form.priority)     { Alert.alert('Missing Field', 'Please select a priority.'); return; }

    setLoading(true);
    try {
      await tasksAPI.create({
        title:       form.title,
        priority:    form.priority.toUpperCase(),
        category:    form.categoryKey || null,
        due_date:    form.dueDate  || null,
        due_time:    form.dueTime  || null,
        description: form.description || null,
        reminder:    form.reminder,
        recurring:   form.recurringTask,
        ...(selectedCaseId   ? { case_id: selectedCaseId }       : {}),
        ...(selectedMemberId ? { assigned_to: selectedMemberId } : {}),
      });
      Alert.alert('Success', 'Task created successfully!', [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedPriority = PRIORITIES.find(p => p.key === form.priority) || PRIORITIES[1];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.amber} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add Task</Text>
          <View style={s.backBtn} />
        </View>
      </View>

      {/* Hero */}
      <View style={s.heroBanner}>
        <View style={[s.heroIconWrap, { backgroundColor: selectedPriority.color + '33' }]}>
          <FontAwesome5 name="tasks" size={26} color={COLORS.white} />
        </View>
        <View>
          <Text style={s.heroTitle}>New Task</Text>
          <Text style={s.heroSub}>Create a task for a case</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Task Details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Task Details</Text>
          <Field
            label="Task Title *"
            placeholder="e.g., File Motion to Dismiss"
            value={form.title}
            onChange={v => update('title', v)}
            icon="tasks"
          />

          {/* Related Case — searchable */}
          <AutocompleteField
            label="Related Case"
            placeholder="Search case by title or number..."
            value={caseSearch}
            onChange={onCaseChange}
            results={caseResults}
            onSelect={selectCase}
            showDrop={showCaseDrop}
            icon="briefcase"
          />
        </View>

        {/* Priority */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Priority Level</Text>
          <View style={s.priorityRow}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[s.priorityBtn, { backgroundColor: p.bg, borderColor: form.priority === p.key ? p.color : p.border }]}
                onPress={() => update('priority', p.key)}
              >
                <FontAwesome5 name={p.icon} size={13} color={p.color} />
                <Text style={[s.priorityText, { color: p.color }]}>{p.label}</Text>
                {form.priority === p.key && (
                  <FontAwesome5 name="check-circle" size={13} color={p.color} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Category */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Task Category</Text>
          <View style={s.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[s.catBtn, form.categoryKey === cat.key && s.catBtnActive]}
                onPress={() => update('categoryKey', cat.key)}
              >
                <Text style={[s.catText, form.categoryKey === cat.key && s.catTextActive]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Due Date — calendar strip */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Due Date & Time</Text>

          <Text style={s.label}>Due Date</Text>
          <CalendarStrip
            selectedDate={form.dueDate}
            onSelect={v => update('dueDate', v)}
            calendarBase={calendarBase}
            onPrev={prevWeek}
            onNext={nextWeek}
          />

          {/* Due Time */}
          <Text style={[s.label, { marginTop: 14 }]}>Due Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {TIMES.map(t => (
              <TouchableOpacity
                key={t}
                style={[s.timeChip, form.dueTime === t && s.timeChipActive]}
                onPress={() => update('dueTime', t)}
              >
                <Text style={[s.timeChipText, form.dueTime === t && s.timeChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Assign To — real team members */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Assign To</Text>
          {allMembers.length === 0 ? (
            <Text style={s.emptyText}>Loading team members...</Text>
          ) : (
            <View style={s.assignRow}>
              {allMembers.map(m => {
                const name = displayName(m);
                const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const isSelected = selectedMemberId === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.assignChip, isSelected && s.assignChipActive]}
                    onPress={() => {
                      setSelectedMemberId(isSelected ? null : m.id);
                      setSelectedMemberName(isSelected ? '' : name);
                    }}
                  >
                    <View style={[s.assignAvatar, isSelected && { backgroundColor: COLORS.amber }]}>
                      <Text style={[s.assignAvatarText, isSelected && { color: COLORS.white }]}>{initials}</Text>
                    </View>
                    <Text style={[s.assignName, isSelected && s.assignNameActive]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Description */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Description</Text>
          <TextInput
            style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            placeholder="Add extra details, context, or instructions..."
            placeholderTextColor={COLORS.gray400}
            value={form.description}
            onChangeText={v => update('description', v)}
            multiline
          />
        </View>

        {/* Options */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Options</Text>
          <ToggleRow
            icon="bell"
            title="Set Reminder"
            sub="Get notified before due date"
            value={form.reminder}
            onToggle={() => update('reminder', !form.reminder)}
          />
          <View style={{ height: 12 }} />
          <ToggleRow
            icon="redo"
            title="Recurring Task"
            sub="Repeat this task periodically"
            value={form.recurringTask}
            onToggle={() => update('recurringTask', !form.recurringTask)}
          />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation?.goBack()} disabled={loading}>
          <Text style={s.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnPrimary} onPress={handleCreate} disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <>
                <FontAwesome5 name="check" size={14} color={COLORS.white} />
                <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Create Task</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Simple Field ─────────────────────────────────────────────────────────────
const Field = ({ label, placeholder, value, onChange, icon }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <View style={{ position: 'relative' }}>
      {icon && <FontAwesome5 name={icon} size={13} color={COLORS.gray400} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} />}
      <TextInput style={[s.input, icon && { paddingLeft: 42 }]} placeholder={placeholder} placeholderTextColor={COLORS.gray400} value={value} onChangeText={onChange} />
    </View>
  </View>
);

// ─── Toggle Row ───────────────────────────────────────────────────────────────
const ToggleRow = ({ icon, title, sub, value, onToggle }) => (
  <View style={s.optRow}>
    <View style={s.optLeft}>
      <View style={[s.optIconWrap, value && { backgroundColor: COLORS.amber + '22' }]}>
        <FontAwesome5 name={icon} size={14} color={value ? COLORS.amber : COLORS.gray500} />
      </View>
      <View style={{ marginLeft: 12 }}>
        <Text style={s.optTitle}>{title}</Text>
        <Text style={s.optSub}>{sub}</Text>
      </View>
    </View>
    <TouchableOpacity style={[s.toggle, value && s.toggleOn]} onPress={onToggle}>
      <View style={[s.knob, value && s.knobOn]} />
    </TouchableOpacity>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.amber },
  scroll:       { flex: 1, backgroundColor: COLORS.gray50 },
  header:       { backgroundColor: COLORS.amber, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.white },

  heroBanner:   { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.amber, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:    { fontSize: 20, fontWeight: '800', color: COLORS.white },
  heroSub:      { fontSize: 12, color: 'rgba(255,255,255,0.75)' },

  section:      { margin: 16, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 14 },
  label:        { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  input:        { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },

  // Autocomplete
  dropdown:     { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  dropItem:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  dropItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  dropItemText: { fontSize: 14, color: COLORS.dark, fontWeight: '500' },
  dropItemSub:  { fontSize: 11, color: COLORS.gray400, marginTop: 1 },

  // Priority
  priorityRow:  { gap: 8 },
  priorityBtn:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, marginBottom: 4 },
  priorityText: { fontSize: 14, fontWeight: '700', flex: 1 },

  // Category
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200 },
  catBtnActive: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  catText:      { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  catTextActive:{ color: COLORS.white },

  // Calendar strip
  calStrip:          { backgroundColor: COLORS.gray50, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.gray200, paddingVertical: 12, marginBottom: 4 },
  calMonthRow:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 12, paddingHorizontal: 16 },
  calMonthText:      { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  calDayBtn:         { width: 52, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.gray200 },
  calDayBtnSelected: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  calDayName:        { fontSize: 11, color: COLORS.gray500, fontWeight: '600' },
  calDayNameSelected:{ color: 'rgba(255,255,255,0.8)' },
  calDayNum:         { fontSize: 17, fontWeight: '800', color: COLORS.dark },
  calDayNumSelected: { color: COLORS.white },
  calTodayDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.amber },
  calSelectedText:   { fontSize: 12, color: COLORS.gray500, textAlign: 'center', marginTop: 10, marginBottom: 4, fontWeight: '500' },

  // Time chips
  timeChip:         { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  timeChipActive:   { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  timeChipText:     { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  timeChipTextActive: { color: COLORS.white },

  // Assign
  emptyText:    { fontSize: 13, color: COLORS.gray400, fontStyle: 'italic' },
  assignRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  assignChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, maxWidth: '48%' },
  assignChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amberLight },
  assignAvatar: { width: 30, height: 30, borderRadius: 9, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  assignAvatarText: { fontSize: 10, fontWeight: '800', color: COLORS.gray600 },
  assignName:   { fontSize: 12, fontWeight: '600', color: COLORS.dark, flexShrink: 1 },
  assignNameActive: { color: COLORS.amber },

  // Options / toggles
  optRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1 },
  optIconWrap:  { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  optTitle:     { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  optSub:       { fontSize: 11, color: COLORS.gray500 },
  toggle:       { width: 48, height: 26, borderRadius: 13, backgroundColor: COLORS.gray200, paddingHorizontal: 2, justifyContent: 'center' },
  toggleOn:     { backgroundColor: COLORS.amber },
  knob:         { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  knobOn:       { marginLeft: 22 },

  // Footer
  footer:           { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary:       { flex: 1, flexDirection: 'row', backgroundColor: COLORS.amber, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:   { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnSecondary:     { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.gray600 },
});
