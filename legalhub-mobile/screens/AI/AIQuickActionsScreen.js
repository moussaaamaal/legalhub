import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar,
  ScrollView, Modal, FlatList, ActivityIndicator, Alert, Clipboard,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { aiAPI, documentsAPI } from '../../services/api';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:   '#1E40AF',
  white:     '#FFFFFF',
  g50:       '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g300: '#D1D5DB',
  g400:      '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  dark:      '#1E293B',
  green600:  '#16A34A', amber600: '#D97706', red600:   '#DC2626',
  blue50:    '#EFF6FF', blue100: '#DBEAFE',
  indigo50:  '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  emerald50: '#ECFDF5', emerald100: '#D1FAE5', emerald600: '#059669',
  orange50:  '#FFF7ED', orange100: '#FFEDD5', orange600: '#EA580C',
};

const ACTIONS = [
  {
    id:       'summarize',
    label:    'Summarize',
    icon:     'file-alt',
    desc:     'Instant document summary',
    color:    C.primary,
    bg:       C.blue50,
    accent:   C.blue100,
    needsDoc: true,
  },
  {
    id:       'draft',
    label:    'Draft',
    icon:     'pen-fancy',
    desc:     'Create legal documents',
    color:    C.indigo600,
    bg:       C.indigo50,
    accent:   C.indigo100,
    needsDoc: false,
  },
  {
    id:       'extract',
    label:    'Extract',
    icon:     'calendar-alt',
    desc:     'Find deadlines & dates',
    color:    C.emerald600,
    bg:       C.emerald50,
    accent:   C.emerald100,
    needsDoc: true,
  },
  {
    id:       'analyze',
    label:    'Analyze',
    icon:     'search',
    desc:     'Deep document analysis',
    color:    C.orange600,
    bg:       C.orange50,
    accent:   C.orange100,
    needsDoc: true,
  },
];

// ─── MarkdownText ─────────────────────────────────────────────────────────────
const parseInline = (text) => {
  const parts = [];
  const regex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/gs;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ t: text.slice(last, match.index) });
    const raw = match[0];
    if (raw.startsWith('***'))     parts.push({ t: raw.slice(3, -3), bold: true, italic: true });
    else if (raw.startsWith('**')) parts.push({ t: raw.slice(2, -2), bold: true });
    else                           parts.push({ t: raw.slice(1, -1), italic: true });
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return parts;
};

const MarkdownText = ({ text, style }) => {
  const lines = (text || '').split('\n');
  return (
    <Text style={style}>
      {lines.map((line, i) => {
        let prefix = '', lineWeight = null, fontSize = null, content = line;
        if (line.startsWith('### '))      { lineWeight = '700'; fontSize = 14; content = line.slice(4); }
        else if (line.startsWith('## '))  { lineWeight = '800'; fontSize = 15; content = line.slice(3); }
        else if (line.startsWith('# '))   { lineWeight = '800'; fontSize = 16; content = line.slice(2); }
        else if (line.startsWith('- ') || line.startsWith('• ')) { prefix = '• '; content = line.slice(2); }
        else if (/^\d+\.\s/.test(line))  { const m = line.match(/^(\d+\.\s)(.*)/); prefix = m[1]; content = m[2]; }
        const inlineParts = parseInline(content);
        const lineStyle   = (lineWeight || fontSize) ? [lineWeight && { fontWeight: lineWeight }, fontSize && { fontSize }] : null;
        return (
          <Text key={i}>
            {i > 0 ? '\n' : ''}
            {prefix ? <Text>{prefix}</Text> : null}
            <Text style={lineStyle}>
              {inlineParts.map((p, j) => (
                <Text key={j} style={[p.bold && { fontWeight: '700' }, p.italic && { fontStyle: 'italic' }]}>{p.t}</Text>
              ))}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
};

// ─── Usage meter ──────────────────────────────────────────────────────────────
const UsageMeter = ({ used, limit, period }) => {
  const pct   = limit > 0 ? Math.min(used / limit, 1) : 0;
  const color = pct > 0.9 ? C.red600 : pct > 0.7 ? C.amber600 : C.primary;
  return (
    <View style={um.card}>
      <View style={um.top}>
        <View style={um.iconWrap}>
          <FontAwesome5 name="tachometer-alt" size={14} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={um.title}>AI Usage</Text>
          <Text style={um.period}>{period || 'This month'}</Text>
        </View>
        <View style={um.badge}>
          <Text style={[um.badgeNum, { color }]}>{used}</Text>
          <Text style={um.badgeSep}>/</Text>
          <Text style={um.badgeLimit}>{limit}</Text>
        </View>
      </View>
      <View style={um.barTrack}>
        <View style={[um.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={um.hint}>{limit - used} actions remaining</Text>
    </View>
  );
};
const um = StyleSheet.create({
  card:       { backgroundColor: C.white, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  top:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconWrap:   { width: 36, height: 36, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 14, fontWeight: '700', color: C.dark },
  period:     { fontSize: 11, color: C.g400, marginTop: 1 },
  badge:      { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  badgeNum:   { fontSize: 26, fontWeight: '900', color: C.primary },
  badgeSep:   { fontSize: 14, color: C.g300 },
  badgeLimit: { fontSize: 14, color: C.g400, fontWeight: '600' },
  barTrack:   { height: 8, backgroundColor: C.g100, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill:    { height: '100%', borderRadius: 4 },
  hint:       { fontSize: 11, color: C.g400 },
});

// ─── Action card ──────────────────────────────────────────────────────────────
const ActionCard = ({ action, onPress }) => (
  <TouchableOpacity style={[ac.card, { backgroundColor: action.bg }]} onPress={onPress} activeOpacity={0.8}>
    <View style={[ac.iconWrap, { backgroundColor: action.accent }]}>
      <FontAwesome5 name={action.icon} size={20} color={action.color} />
    </View>
    <Text style={[ac.label, { color: action.color }]}>{action.label}</Text>
    <Text style={ac.desc}>{action.desc}</Text>
    <View style={[ac.arrow, { backgroundColor: action.accent }]}>
      <FontAwesome5 name="arrow-right" size={10} color={action.color} />
    </View>
  </TouchableOpacity>
);
const ac = StyleSheet.create({
  card:    { flex: 1, borderRadius: 16, padding: 16, gap: 6, minHeight: 130, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  iconWrap:{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  label:   { fontSize: 15, fontWeight: '800' },
  desc:    { fontSize: 11, color: C.g500, lineHeight: 15 },
  arrow:   { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginTop: 'auto' },
});

// ─── Document picker modal ────────────────────────────────────────────────────
const DocPickerModal = ({ visible, onClose, onSelect, loading }) => {
  const [docs,    setDocs]    = useState([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (visible) {
      setFetching(true);
      documentsAPI.list({ limit: 30 })
        .then(data => setDocs(Array.isArray(data) ? data : (data.items || [])))
        .catch(() => setDocs([]))
        .finally(() => setFetching(false));
    }
  }, [visible]);

  const iconForType = (ft = '') => {
    if (ft.includes('pdf'))  return { name: 'file-pdf',  color: '#DC2626' };
    if (ft.includes('word') || ft.includes('doc')) return { name: 'file-word', color: '#1E40AF' };
    return { name: 'file-alt', color: C.g400 };
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dp.overlay}>
        <View style={dp.sheet}>
          <View style={dp.handle} />
          <View style={dp.header}>
            <Text style={dp.title}>Select Document</Text>
            <TouchableOpacity onPress={onClose} style={dp.closeBtn}>
              <FontAwesome5 name="times" size={14} color={C.g500} />
            </TouchableOpacity>
          </View>

          {fetching ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 40 }} />
          ) : docs.length === 0 ? (
            <View style={dp.empty}>
              <FontAwesome5 name="folder-open" size={32} color={C.g300} />
              <Text style={dp.emptyTxt}>No documents found</Text>
            </View>
          ) : (
            <FlatList
              data={docs}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                const ic = iconForType(item.file_type || '');
                return (
                  <TouchableOpacity
                    style={dp.docRow}
                    onPress={() => { onClose(); onSelect(item); }}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <View style={[dp.docIcon, { backgroundColor: ic.color + '18' }]}>
                      <FontAwesome5 name={ic.name} size={16} color={ic.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dp.docName} numberOfLines={1}>{item.file_name || 'Document'}</Text>
                      <Text style={dp.docMeta}>{(item.file_type || '').toUpperCase()}</Text>
                    </View>
                    <FontAwesome5 name="chevron-right" size={12} color={C.g300} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
const dp = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: 16 },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: C.g200, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g100 },
  title:    { flex: 1, fontSize: 16, fontWeight: '800', color: C.dark },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  empty:    { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt: { fontSize: 14, color: C.g400 },
  docRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g50, gap: 12 },
  docIcon:  { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName:  { fontSize: 14, fontWeight: '600', color: C.dark, marginBottom: 2 },
  docMeta:  { fontSize: 11, color: C.g400 },
});

// ─── Result modal ─────────────────────────────────────────────────────────────
const ResultModal = ({ visible, onClose, title, content, actionColor }) => {
  const copy = () => {
    Clipboard.setString(content || '');
    Alert.alert('Copied', 'Result copied to clipboard.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={res.overlay}>
        <SafeAreaView style={res.sheet}>
          <View style={[res.header, { borderBottomColor: (actionColor || C.primary) + '30' }]}>
            <View style={[res.dot, { backgroundColor: actionColor || C.primary }]} />
            <Text style={res.title}>{title}</Text>
            <TouchableOpacity onPress={copy} style={res.copyBtn}>
              <FontAwesome5 name="copy" size={13} color={C.g500} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={res.closeBtn}>
              <FontAwesome5 name="times" size={14} color={C.g500} />
            </TouchableOpacity>
          </View>
          <ScrollView style={res.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <MarkdownText text={content} style={res.text} />
          </ScrollView>
          <TouchableOpacity style={[res.doneBtn, { backgroundColor: actionColor || C.primary }]} onPress={onClose}>
            <Text style={res.doneTxt}>Done</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
};
const res = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', flex: 0 },
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, gap: 8 },
  dot:      { width: 10, height: 10, borderRadius: 5 },
  title:    { flex: 1, fontSize: 16, fontWeight: '800', color: C.dark },
  copyBtn:  { width: 32, height: 32, borderRadius: 10, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  body:     { paddingHorizontal: 20, paddingTop: 16 },
  text:     { fontSize: 14, color: C.dark, lineHeight: 22 },
  doneBtn:  { marginHorizontal: 20, marginVertical: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  doneTxt:  { color: C.white, fontSize: 15, fontWeight: '700' },
});

// ─── Processing overlay ───────────────────────────────────────────────────────
const ProcessingOverlay = ({ visible, label, color }) => {
  if (!visible) return null;
  return (
    <View style={po.overlay}>
      <View style={po.card}>
        <ActivityIndicator size="large" color={color || C.primary} />
        <Text style={po.txt}>{label || 'Processing…'}</Text>
      </View>
    </View>
  );
};
const po = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:    { backgroundColor: C.white, borderRadius: 20, padding: 32, alignItems: 'center', gap: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  txt:     { fontSize: 14, color: C.g500, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AIQuickActionsScreen({ navigation }) {
  const [usage,         setUsage]         = useState(null);
  const [processing,    setProcessing]    = useState(false);
  const [processingLabel, setProcessingLabel] = useState('');
  const [processingColor, setProcessingColor] = useState(C.primary);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [resultTitle,   setResultTitle]   = useState('');
  const [resultContent, setResultContent] = useState('');
  const [resultColor,   setResultColor]   = useState(C.primary);

  useEffect(() => {
    aiAPI.getUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  const handleActionPress = useCallback((action) => {
    if (action.id === 'draft') {
      navigation?.navigate?.('ContractDraft');
      return;
    }
    setPendingAction(action);
    setDocPickerOpen(true);
  }, [navigation]);

  const handleDocSelect = useCallback(async (doc) => {
    if (!pendingAction) return;
    const action = pendingAction;

    setProcessingLabel(
      action.id === 'summarize' ? 'Summarizing document…' :
      action.id === 'extract'   ? 'Extracting dates & deadlines…' :
      'Analyzing document…'
    );
    setProcessingColor(action.color);
    setProcessing(true);

    try {
      let res;
      if (action.id === 'summarize') {
        res = await aiAPI.summarize(doc.id);
        setResultTitle(`Summary — ${doc.file_name || 'Document'}`);
        setResultContent(res.summary || '');
      } else if (action.id === 'extract') {
        res = await aiAPI.extract(doc.id);
        setResultTitle(`Dates & Deadlines — ${doc.file_name || 'Document'}`);
        setResultContent(res.result || '');
      } else if (action.id === 'analyze') {
        res = await aiAPI.analyze(doc.id);
        setResultTitle(`Analysis — ${doc.file_name || 'Document'}`);
        setResultContent(res.result || '');
      }
      setResultColor(action.color);
      setResultVisible(true);
      // Refresh usage counter
      aiAPI.getUsage().then(setUsage).catch(() => {});
    } catch (e) {
      Alert.alert('Error', e.message || 'AI processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [pendingAction]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
          <FontAwesome5 name="arrow-left" size={16} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerIconWrap}>
          <FontAwesome5 name="magic" size={16} color={C.white} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.headerTitle}>AI Legal Tools</Text>
          <Text style={s.headerSub}>Quick AI actions for your documents</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: C.g50 }} contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Usage meter */}
        {usage && (
          <UsageMeter used={usage.used} limit={usage.limit} period={usage.period} />
        )}
        {!usage && (
          <View style={{ marginHorizontal: 16, marginBottom: 20, height: 90, backgroundColor: C.white, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={C.primary} />
          </View>
        )}

        {/* Section title */}
        <Text style={s.sectionTitle}>Quick Actions</Text>

        {/* 2×2 action grid */}
        <View style={s.grid}>
          <View style={s.row}>
            <ActionCard action={ACTIONS[0]} onPress={() => handleActionPress(ACTIONS[0])} />
            <ActionCard action={ACTIONS[1]} onPress={() => handleActionPress(ACTIONS[1])} />
          </View>
          <View style={s.row}>
            <ActionCard action={ACTIONS[2]} onPress={() => handleActionPress(ACTIONS[2])} />
            <ActionCard action={ACTIONS[3]} onPress={() => handleActionPress(ACTIONS[3])} />
          </View>
        </View>

        {/* AI chat shortcut */}
        <TouchableOpacity style={s.chatCard} onPress={() => navigation?.navigate?.('AIAssistant')} activeOpacity={0.85}>
          <View style={s.chatIconWrap}>
            <FontAwesome5 name="comments" size={18} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.chatTitle}>Chat with Firm AI</Text>
            <Text style={s.chatSub}>Ask anything about cases, clients & documents</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={14} color={C.g300} />
        </TouchableOpacity>

      </ScrollView>

      {/* Document picker */}
      <DocPickerModal
        visible={docPickerOpen}
        onClose={() => setDocPickerOpen(false)}
        onSelect={handleDocSelect}
        loading={processing}
      />

      {/* Result modal */}
      <ResultModal
        visible={resultVisible}
        onClose={() => setResultVisible(false)}
        title={resultTitle}
        content={resultContent}
        actionColor={resultColor}
      />

      {/* Processing overlay */}
      <ProcessingOverlay visible={processing} label={processingLabel} color={processingColor} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.primary },
  header:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8 },
  backBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerIconWrap:{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 16, fontWeight: '800', color: C.white },
  headerSub:     { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: C.g500, paddingHorizontal: 16, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid:          { paddingHorizontal: 16, gap: 12, marginBottom: 24 },
  row:           { flexDirection: 'row', gap: 12 },
  chatCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, marginHorizontal: 16, borderRadius: 16, padding: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  chatIconWrap:  { width: 46, height: 46, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  chatTitle:     { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  chatSub:       { fontSize: 12, color: C.g400 },
});
