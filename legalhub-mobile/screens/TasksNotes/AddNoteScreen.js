import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { notesAPI, casesAPI } from '../../services/api';

const AMBER = '#D97706';

const COLORS = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray300: '#D1D5DB', gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563',
};

const NOTE_COLORS = [
  { id: 'yellow', bg: '#FEF9C3', border: '#FDE047', dot: '#EAB308' },
  { id: 'blue',   bg: '#DBEAFE', border: '#93C5FD', dot: '#3B82F6' },
  { id: 'green',  bg: '#DCFCE7', border: '#86EFAC', dot: '#22C55E' },
  { id: 'pink',   bg: '#FCE7F3', border: '#F9A8D4', dot: '#EC4899' },
  { id: 'purple', bg: '#F3E8FF', border: '#D8B4FE', dot: '#A855F7' },
  { id: 'orange', bg: '#FFEDD5', border: '#FED7AA', dot: '#F97316' },
];

const NOTE_TAGS = ['Client Meeting', 'Research', 'Court Prep', 'Strategy', 'Reminder', 'Important', 'Follow-up', 'Confidential'];

// ─── Case label helper ────────────────────────────────────────────────────────
const caseLabel = (c) => [c.case_number, c.title].filter(Boolean).join(' — ');

// ─── Inline markdown parser (recursive, handles nested/combined markers) ──────
// Supports: ***bold+italic***, **bold**, *italic*, __underline__, and combos
const parseInline = (text, inherited = {}) => {
  if (!text) return [];

  // Order matters: longer/combined patterns first
  const patterns = [
    { re: /^\*\*\*(.+?)\*\*\*/, bold: true, italic: true },
    { re: /^\*\*(.+?)\*\*/,     bold: true                },
    { re: /^__(.+?)__/,                      underline: true },
    { re: /^\*(.+?)\*/,              italic: true           },
  ];

  const parts = [];
  let i = 0;

  while (i < text.length) {
    let matched = false;
    for (const p of patterns) {
      const m = p.re.exec(text.slice(i));
      if (m) {
        // any plain text before this match
        if (m.index > 0) parts.push({ text: text.slice(i, i + m.index), ...inherited });
        const formats = {
          ...inherited,
          ...(p.bold      && { bold: true }),
          ...(p.italic    && { italic: true }),
          ...(p.underline && { underline: true }),
        };
        // Recursively parse inner content for further nesting
        parts.push(...parseInline(m[1], formats));
        i += m.index + m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // find next special char or end
      const nextSpecial = text.slice(i).search(/\*\*\*|\*\*|__|(?<!\*)\*(?!\*)/);
      const take = nextSpecial === -1 ? text.length - i : nextSpecial || 1;
      parts.push({ text: text.slice(i, i + take), ...inherited });
      i += take;
    }
  }
  return parts;
};

// ─── Expand selection to include surrounding markers ─────────────────────────
// e.g. user selects "mot" inside "**mot**" → canonical selection covers "**mot**"
const getCanonicalSelection = (fullContent, start, end) => {
  const PAIRS = [
    ['***__', '__***'],
    ['***',   '***'  ],
    ['**__',  '__**' ],
    ['*__',   '__*'  ],
    ['__',    '__'   ],
    ['**',    '**'   ],
    ['*',     '*'    ],
  ];
  for (const [pre, suf] of PAIRS) {
    const ps = start - pre.length;
    const pe = end   + suf.length;
    if (
      ps >= 0 && pe <= fullContent.length &&
      fullContent.substring(ps, start) === pre &&
      fullContent.substring(end, pe)   === suf
    ) {
      return { start: ps, end: pe };
    }
  }
  return { start, end };
};

// ─── Format toggle helpers ────────────────────────────────────────────────────
// Given a selected string, return which format flags are active
const parseFlags = (text) => {
  const f = { bold: false, italic: false, underline: false };
  let t = text;
  if (t.startsWith('***') && t.endsWith('***') && t.length > 6) {
    f.bold = true; f.italic = true; t = t.slice(3, -3);
  } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
    f.bold = true; t = t.slice(2, -2);
  } else if (t.startsWith('*') && t.endsWith('*') && t.length > 2) {
    f.italic = true; t = t.slice(1, -1);
  }
  if (t.startsWith('__') && t.endsWith('__') && t.length > 4) f.underline = true;
  return f;
};

// Strip all outer markers to get the raw inner text
const getInner = (text, flags) => {
  let t = text;
  if      (flags.bold && flags.italic && t.startsWith('***')) t = t.slice(3, -3);
  else if (flags.bold  && t.startsWith('**'))                  t = t.slice(2, -2);
  else if (flags.italic && t.startsWith('*'))                  t = t.slice(1, -1);
  if (flags.underline && t.startsWith('__'))                   t = t.slice(2, -2);
  return t;
};

// Rebuild formatted text from inner + flags
const buildFormatted = (inner, flags) => {
  let t = inner;
  if (flags.underline)                   t = `__${t}__`;
  if      (flags.bold && flags.italic)   t = `***${t}***`;
  else if (flags.bold)                   t = `**${t}**`;
  else if (flags.italic)                 t = `*${t}*`;
  return t;
};

const RichText = ({ text, style, numberOfLines }) => {
  const parts = parseInline(text || '');
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, idx) => (
        <Text
          key={idx}
          style={{
            fontWeight:          p.bold      ? '700'       : undefined,
            fontStyle:           p.italic    ? 'italic'    : undefined,
            textDecorationLine:  p.underline ? 'underline' : undefined,
          }}
        >
          {p.text}
        </Text>
      ))}
    </Text>
  );
};

export default function AddNoteScreen({ navigation }) {
  const [title, setTitle]               = useState('');
  const [content, setContent]           = useState('');
  const [selectedColor, setSelectedColor] = useState('yellow');
  const [selectedTags, setSelectedTags] = useState([]);
  const [isPinned, setIsPinned]         = useState(false);
  const [isPrivate, setIsPrivate]       = useState(false);
  const [loading, setLoading]           = useState(false);

  // ── Formatting ──
  const contentInputRef  = useRef(null);
  const selectionRef     = useRef({ start: 0, end: 0 });
  const contentRef       = useRef('');                          // mirror of content for callbacks
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => { contentRef.current = content; }, [content]);

  const toggleFormat = useCallback((formatKey) => {
    const marker = formatKey === 'bold' ? '**' : formatKey === 'italic' ? '*' : '__';
    const { start, end } = selectionRef.current;
    const before   = content.substring(0, start);
    const selected = content.substring(start, end);
    const after    = content.substring(end);

    const flags   = parseFlags(selected);
    const inner   = getInner(selected, flags);
    flags[formatKey] = !flags[formatKey];           // toggle
    const newSelected = buildFormatted(inner, flags);

    setContent(before + newSelected + after);
    setActiveFormats({ ...flags });

    // Keep selection covering the wrapped text so next format stacks on it
    const newEnd = start + newSelected.length;
    selectionRef.current = { start, end: newEnd };
    setTimeout(() => {
      contentInputRef.current?.setNativeProps({ selection: { start, end: newEnd } });
    }, 30);
  }, [content]);

  // ── Case autocomplete ──
  const [caseSearch, setCaseSearch]         = useState('');
  const [caseResults, setCaseResults]       = useState([]);
  const [showCaseDrop, setShowCaseDrop]     = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const caseDebounce = useRef(null);

  const currentTheme = NOTE_COLORS.find(c => c.id === selectedColor) || NOTE_COLORS[0];

  const toggleTag = (tag) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

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

  // ── Save ──
  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('Missing Field', 'Please write some content for your note.');
      return;
    }
    if (!selectedCaseId) {
      Alert.alert('Missing Field', 'Please link this note to a case.');
      return;
    }

    // Build content with optional title and tags
    const fullContent = [
      title.trim() ? `**${title.trim()}**\n` : '',
      content.trim(),
      selectedTags.length ? `\n\nTags: ${selectedTags.join(', ')}` : '',
    ].join('');

    setLoading(true);
    try {
      await notesAPI.create({
        case_id: selectedCaseId,
        content: fullContent,
      });
      Alert.alert('Success', 'Note saved successfully!', [
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
      <StatusBar barStyle="light-content" backgroundColor={AMBER} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Note</Text>
          <TouchableOpacity style={s.pinBtn} onPress={() => setIsPinned(!isPinned)}>
            <FontAwesome5
              name="thumbtack"
              size={16}
              color={isPinned ? '#FDE68A' : 'rgba(255,255,255,0.6)'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Note Preview */}
        <View style={[s.notePreview, { backgroundColor: currentTheme.bg, borderColor: currentTheme.border }]}>
          <View style={s.previewHeader}>
            <View style={[s.colorDot, { backgroundColor: currentTheme.dot }]} />
            <Text style={s.previewDate}>
              Today, {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isPinned && (
              <FontAwesome5 name="thumbtack" size={12} color={COLORS.gray500} style={{ marginLeft: 'auto' }} />
            )}
          </View>
          <Text style={[s.previewTitle, !title && s.placeholderText]}>
            {title || 'Note title...'}
          </Text>
          {content
            ? <RichText text={content} style={s.previewContent} numberOfLines={3} />
            : <Text style={[s.previewContent, s.placeholderText]} numberOfLines={3}>Start typing your note here...</Text>
          }
          {selectedTags.length > 0 && (
            <View style={s.previewTags}>
              {selectedTags.map(t => (
                <View key={t} style={[s.previewTag, { backgroundColor: currentTheme.border + '66' }]}>
                  <Text style={[s.previewTagText, { color: currentTheme.dot }]}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Write Area */}
        <View style={s.section}>
          <Text style={s.label}>Title</Text>
          <TextInput
            style={s.titleInput}
            placeholder="Enter note title..."
            placeholderTextColor={COLORS.gray400}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Text style={s.charCount}>{title.length}/80</Text>

          <Text style={[s.label, { marginTop: 16 }]}>Content *</Text>
          <TextInput
            ref={contentInputRef}
            style={s.contentInput}
            placeholder="Write your note here..."
            placeholderTextColor={COLORS.gray400}
            value={content}
            onChangeText={setContent}
            onSelectionChange={({ nativeEvent: { selection } }) => {
              const { start, end } = selection;
              if (start !== end) {
                // Expand to include surrounding markers if any
                const canonical = getCanonicalSelection(content, start, end);
                selectionRef.current = canonical;
                setActiveFormats(parseFlags(content.substring(canonical.start, canonical.end)));
              } else {
                selectionRef.current = selection;
                setActiveFormats({ bold: false, italic: false, underline: false });
              }
            }}
            multiline
            textAlignVertical="top"
          />

          {/* Formatting Toolbar */}
          <View style={s.toolbar}>
            {[
              { icon: 'bold',      key: 'bold'      },
              { icon: 'italic',    key: 'italic'    },
              { icon: 'underline', key: 'underline' },
            ].map(t => {
              const active = activeFormats[t.key];
              return (
                <TouchableOpacity
                  key={t.icon}
                  style={[s.toolbarBtn, active && s.toolbarBtnActive]}
                  onPress={() => toggleFormat(t.key)}
                >
                  <FontAwesome5 name={t.icon} size={13} color={active ? COLORS.white : COLORS.dark} />
                </TouchableOpacity>
              );
            })}
            <View style={s.toolbarSep} />
            {[{ icon: 'list-ul' }, { icon: 'list-ol' }].map(t => (
              <TouchableOpacity key={t.icon} style={s.toolbarBtn}>
                <FontAwesome5 name={t.icon} size={13} color={COLORS.gray400} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Note Color */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Note Color</Text>
          <View style={s.colorsRow}>
            {NOTE_COLORS.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[s.colorBtn, { backgroundColor: c.bg, borderColor: c.border }, selectedColor === c.id && s.colorBtnSelected]}
                onPress={() => setSelectedColor(c.id)}
              >
                <View style={[s.colorBtnDot, { backgroundColor: c.dot }]} />
                {selectedColor === c.id && (
                  <View style={s.colorCheck}>
                    <FontAwesome5 name="check" size={8} color={COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Link to Case — searchable autocomplete */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Link to Case *</Text>
          <View style={{ position: 'relative' }}>
            <FontAwesome5
              name="briefcase"
              size={13}
              color={COLORS.gray400}
              style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }}
            />
            <TextInput
              style={[s.input, { paddingLeft: 42 }]}
              placeholder="Search case by title or number..."
              placeholderTextColor={COLORS.gray400}
              value={caseSearch}
              onChangeText={onCaseChange}
              autoCorrect={false}
            />
          </View>
          {selectedCaseId && (
            <View style={s.caseSelected}>
              <FontAwesome5 name="check-circle" size={13} color="#22C55E" />
              <Text style={s.caseSelectedText}>{caseSearch}</Text>
            </View>
          )}
          {showCaseDrop && caseResults.length > 0 && (
            <View style={s.dropdown}>
              {caseResults.slice(0, 6).map((item, idx) => (
                <TouchableOpacity
                  key={item.id ?? idx}
                  style={[s.dropItem, idx < Math.min(caseResults.length, 6) - 1 && s.dropItemBorder]}
                  onPress={() => selectCase(item)}
                >
                  <FontAwesome5 name="briefcase" size={13} color={AMBER} style={{ marginRight: 10 }} />
                  <Text style={s.dropItemText} numberOfLines={1}>{caseLabel(item)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Tags */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Tags</Text>
          <View style={s.tagsWrap}>
            {NOTE_TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                style={[s.tagBtn, selectedTags.includes(tag) && s.tagBtnActive]}
                onPress={() => toggleTag(tag)}
              >
                {selectedTags.includes(tag) && (
                  <FontAwesome5 name="check" size={9} color={COLORS.white} style={{ marginRight: 4 }} />
                )}
                <Text style={[s.tagText, selectedTags.includes(tag) && s.tagTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Options */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Options</Text>
          <ToggleRow
            icon="lock"
            title="Private Note"
            sub="Only visible to you"
            value={isPrivate}
            onToggle={() => setIsPrivate(!isPrivate)}
          />
          <View style={{ height: 12 }} />
          <ToggleRow
            icon="thumbtack"
            title="Pin to Dashboard"
            sub="Show on home screen"
            value={isPinned}
            onToggle={() => setIsPinned(!isPinned)}
          />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation?.goBack()} disabled={loading}>
          <Text style={s.btnSecondaryText}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnPrimary} onPress={handleSave} disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <>
                <FontAwesome5 name="sticky-note" size={14} color={COLORS.white} />
                <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Save Note</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
const ToggleRow = ({ icon, title, sub, value, onToggle }) => (
  <View style={s.optionRow}>
    <View style={s.optionLeft}>
      <View style={[s.optIconWrap, value && { backgroundColor: AMBER + '22' }]}>
        <FontAwesome5 name={icon} size={14} color={value ? AMBER : COLORS.gray500} />
      </View>
      <View style={{ marginLeft: 12 }}>
        <Text style={s.optionTitle}>{title}</Text>
        <Text style={s.optionSub}>{sub}</Text>
      </View>
    </View>
    <TouchableOpacity style={[s.toggle, value && s.toggleActive]} onPress={onToggle}>
      <View style={[s.toggleKnob, value && s.toggleKnobActive]} />
    </TouchableOpacity>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: AMBER },
  scroll:        { flex: 1, backgroundColor: COLORS.gray50 },
  header:        { backgroundColor: AMBER, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  pinBtn:        { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.white },

  // Note preview
  notePreview:    { margin: 16, borderRadius: 20, padding: 16, borderWidth: 2 },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  colorDot:       { width: 10, height: 10, borderRadius: 5 },
  previewDate:    { fontSize: 11, color: COLORS.gray500 },
  previewTitle:   { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 6 },
  previewContent: { fontSize: 13, color: COLORS.gray600, lineHeight: 20 },
  placeholderText:{ color: COLORS.gray400, fontStyle: 'italic' },
  previewTags:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  previewTag:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  previewTagText: { fontSize: 10, fontWeight: '700' },

  // Sections
  section:      { marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 12 },
  label:        { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },

  // Inputs
  titleInput:   { fontSize: 16, fontWeight: '600', color: COLORS.dark, borderBottomWidth: 2, borderBottomColor: COLORS.gray200, paddingBottom: 10, paddingHorizontal: 4 },
  charCount:    { fontSize: 11, color: COLORS.gray400, textAlign: 'right', marginTop: 4 },
  contentInput: { fontSize: 14, color: COLORS.dark, minHeight: 120, lineHeight: 22, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, padding: 14, marginTop: 4 },
  input:        { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },

  // Toolbar
  toolbar:         { flexDirection: 'row', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.gray100, alignItems: 'center' },
  toolbarBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.gray50, alignItems: 'center', justifyContent: 'center' },
  toolbarBtnActive:{ backgroundColor: AMBER },
  toolbarSep:      { width: 1, height: 22, backgroundColor: COLORS.gray200, marginHorizontal: 4 },

  // Colors
  colorsRow:       { flexDirection: 'row', gap: 10 },
  colorBtn:        { width: 44, height: 44, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  colorBtnSelected:{ borderWidth: 3 },
  colorBtnDot:     { width: 18, height: 18, borderRadius: 9 },
  colorCheck:      { position: 'absolute', bottom: -6, right: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },

  // Case autocomplete
  caseSelected:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 },
  caseSelectedText: { fontSize: 13, fontWeight: '600', color: '#22C55E', flex: 1 },
  dropdown:         { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  dropItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  dropItemBorder:   { borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  dropItemText:     { fontSize: 14, color: COLORS.dark, fontWeight: '500', flex: 1 },

  // Tags
  tagsWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBtn:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  tagBtnActive:{ backgroundColor: AMBER, borderColor: AMBER },
  tagText:     { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
  tagTextActive:{ color: COLORS.white },

  // Options
  optionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  optIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  optionTitle:{ fontSize: 14, fontWeight: '600', color: COLORS.dark },
  optionSub:  { fontSize: 11, color: COLORS.gray500 },
  toggle:         { width: 48, height: 26, borderRadius: 13, backgroundColor: COLORS.gray200, paddingHorizontal: 2, justifyContent: 'center' },
  toggleActive:   { backgroundColor: AMBER },
  toggleKnob:     { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  toggleKnobActive: { marginLeft: 22 },

  // Footer
  footer:          { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary:      { flex: 1, flexDirection: 'row', backgroundColor: AMBER, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:  { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnSecondary:    { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText:{ fontSize: 15, fontWeight: '600', color: COLORS.gray600 },
});
