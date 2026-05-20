import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Animated, Alert, Modal,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ragAPI } from '../../services/api';

// ─── Storage keys ─────────────────────────────────────────────────────────────
const SESSIONS_KEY = (caseId) => `ai_sessions_${caseId}`;
const MSGS_KEY     = (sessionId) => `ai_msgs_${sessionId}`;
const genId        = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MAX_MSGS     = 60;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:  '#1E40AF', secondary: '#3B82F6',
  white:    '#FFFFFF',
  g50:      '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g300:     '#D1D5DB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  dark:     '#1E293B',
  green600: '#16A34A', amber600: '#D97706', red600: '#DC2626',
  blue50:   '#EFF6FF', blue100: '#DBEAFE',
};

const SOURCE_LABELS = {
  case_meta: 'Case Overview', document: 'Document', timeline: 'Timeline',
  tasks: 'Tasks', invoices: 'Invoices', events: 'Hearings', notes: 'Notes', client: 'Client',
};
const SOURCE_COLORS = {
  case_meta: '#3B82F6', document: '#16A34A', timeline: '#9333EA',
  tasks: '#D97706', invoices: '#DC2626', events: '#0891B2', notes: '#7C3AED', client: '#EC4899',
};

const SUGGESTIONS = [
  "What is the current status of this case?",
  "What are the urgent tasks to handle?",
  "Summarize the main documents in this case",
  "Are there any upcoming hearings or deadlines?",
];

// ─── TypingDots ───────────────────────────────────────────────────────────────
const TypingDots = () => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(200, dots.map(d =>
        Animated.sequence([
          Animated.timing(d, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0,  duration: 300, useNativeDriver: true }),
        ])
      ))
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={td.row}>
      {dots.map((d, i) => <Animated.View key={i} style={[td.dot, { transform: [{ translateY: d }] }]} />)}
    </View>
  );
};
const td = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.g400 },
});

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
        let prefix = '';
        let lineWeight = null;
        let fontSize = null;
        let content = line;

        if (line.startsWith('### ')) {
          prefix = '';  lineWeight = '700'; fontSize = 14; content = line.slice(4);
        } else if (line.startsWith('## ')) {
          lineWeight = '800'; fontSize = 15; content = line.slice(3);
        } else if (line.startsWith('# ')) {
          lineWeight = '800'; fontSize = 16; content = line.slice(2);
        } else if (line.startsWith('- ') || line.startsWith('• ')) {
          prefix = '• '; content = line.slice(2);
        } else if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+\.\s)(.*)/);
          prefix = m[1]; content = m[2];
        }

        const inlineParts = parseInline(content);
        const lineStyle = (lineWeight || fontSize)
          ? [lineWeight && { fontWeight: lineWeight }, fontSize && { fontSize }]
          : null;

        return (
          <Text key={i}>
            {i > 0 ? '\n' : ''}
            {prefix ? <Text>{prefix}</Text> : null}
            <Text style={lineStyle}>
              {inlineParts.map((p, j) => (
                <Text key={j} style={[p.bold && { fontWeight: '700' }, p.italic && { fontStyle: 'italic' }]}>
                  {p.t}
                </Text>
              ))}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
};

// ─── Message bubble ───────────────────────────────────────────────────────────
const Bubble = ({ msg }) => {
  const isUser = msg.role === 'user';
  const [showSrc, setShowSrc] = useState(false);
  return (
    <View style={[bs.row, isUser ? bs.userRow : bs.aiRow]}>
      {!isUser && <View style={bs.avatar}><FontAwesome5 name="robot" size={14} color={C.primary} /></View>}
      <View style={[bs.bubble, isUser ? bs.userBubble : bs.aiBubble]}>
        {isUser
          ? <Text style={bs.userText}>{msg.content}</Text>
          : <MarkdownText text={msg.content} style={bs.aiText} />
        }
        {!isUser && msg.sources?.length > 0 && (
          <TouchableOpacity onPress={() => setShowSrc(v => !v)} style={bs.srcToggle}>
            <FontAwesome5 name={showSrc ? 'chevron-up' : 'chevron-down'} size={10} color={C.g500} />
            <Text style={bs.srcToggleTxt}>
              {showSrc ? 'Hide' : `${msg.sources.length} source${msg.sources.length > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        )}
        {!isUser && showSrc && (
          <View style={bs.srcBox}>
            {msg.sources.map((s, i) => (
              <View key={i} style={bs.srcItem}>
                <View style={[bs.srcDot, { backgroundColor: SOURCE_COLORS[s.source_type] || C.g400 }]} />
                <Text style={bs.srcLabel}>{SOURCE_LABELS[s.source_type] || s.source_type}</Text>
                <Text style={bs.srcScore}>{Math.round(s.relevance_score * 100)}%</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};
const bs = StyleSheet.create({
  row:          { flexDirection: 'row', marginBottom: 12, paddingHorizontal: 16 },
  userRow:      { justifyContent: 'flex-end' },
  aiRow:        { justifyContent: 'flex-start', gap: 8 },
  avatar:       { width: 30, height: 30, borderRadius: 15, backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bubble:       { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble:   { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  aiBubble:     { backgroundColor: C.white, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  userText:     { color: C.white, fontSize: 14, lineHeight: 20 },
  aiText:       { color: C.dark, fontSize: 14, lineHeight: 21 },
  srcToggle:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.g100 },
  srcToggleTxt: { fontSize: 11, color: C.g500, fontWeight: '600' },
  srcBox:       { marginTop: 6, gap: 4 },
  srcItem:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  srcDot:       { width: 7, height: 7, borderRadius: 4 },
  srcLabel:     { fontSize: 11, color: C.g600, flex: 1 },
  srcScore:     { fontSize: 10, color: C.g400, fontWeight: '700' },
});

// ─── Index badge ──────────────────────────────────────────────────────────────
const IndexBadge = ({ status, indexing }) => {
  if (!status && !indexing) return null;
  return (
    <View style={ib.row}>
      {indexing ? (
        <><ActivityIndicator size="small" color={C.amber600} /><Text style={[ib.txt, { color: C.amber600 }]}>Updating…</Text></>
      ) : status?.is_indexed ? (
        <><View style={[ib.dot, { backgroundColor: C.green600 }]} /><Text style={[ib.txt, { color: C.green600 }]}>Up to date · {status.total_chunks} chunks</Text></>
      ) : (
        <><View style={[ib.dot, { backgroundColor: C.amber600 }]} /><Text style={[ib.txt, { color: C.amber600 }]}>Preparing…</Text></>
      )}
    </View>
  );
};
const ib = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.g50, borderBottomWidth: 1, borderBottomColor: C.g200 },
  dot:    { width: 7, height: 7, borderRadius: 4 },
  txt:    { fontSize: 12, fontWeight: '600', flex: 1 },
  btn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.blue100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  btnTxt: { fontSize: 11, color: C.primary, fontWeight: '700' },
});

// ─── Empty state (no messages in current session) ─────────────────────────────
const EmptyState = ({ onSuggestion }) => (
  <View style={es.wrap}>
    <View style={es.iconWrap}><FontAwesome5 name="robot" size={32} color={C.primary} /></View>
    <Text style={es.title}>Ask a question</Text>
    <Text style={es.sub}>All questions in this session are grouped together.</Text>
    <View style={es.suggestionsWrap}>
      {SUGGESTIONS.map((s, i) => (
        <TouchableOpacity key={i} style={es.chip} onPress={() => onSuggestion(s)} activeOpacity={0.7}>
          <FontAwesome5 name="lightbulb" size={11} color={C.primary} />
          <Text style={es.chipTxt}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);
const es = StyleSheet.create({
  wrap:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  iconWrap:        { width: 72, height: 72, borderRadius: 36, backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:           { fontSize: 17, fontWeight: '800', color: C.dark, marginBottom: 6, textAlign: 'center' },
  sub:             { fontSize: 13, color: C.g500, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  suggestionsWrap: { width: '100%', gap: 8 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderWidth: 1, borderColor: C.g200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  chipTxt:         { fontSize: 13, color: C.dark, flex: 1 },
});

// ─── Session card (History list) ──────────────────────────────────────────────
const SessionCard = ({ session, onPress, onDelete, onRename, isActive }) => {
  const date = new Date(session.updatedAt || session.createdAt);
  const now  = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const dateStr = isToday
    ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  const qCount = Math.floor((session.msgCount || 0) / 2);

  return (
    <TouchableOpacity
      style={[sc.card, isActive && sc.cardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[sc.iconWrap, isActive && sc.iconWrapActive]}>
        <FontAwesome5 name="comment-dots" size={15} color={isActive ? C.white : C.primary} />
      </View>
      <View style={sc.info}>
        <Text style={sc.name} numberOfLines={2}>{session.name}</Text>
        <View style={sc.meta}>
          <FontAwesome5 name="clock" size={10} color={C.g400} />
          <Text style={sc.date}>{dateStr}</Text>
          {qCount > 0 && <Text style={sc.count}>{qCount} question{qCount > 1 ? 's' : ''}</Text>}
        </View>
      </View>
      <View style={sc.actions}>
        <TouchableOpacity onPress={onRename} style={sc.actionBtn} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <FontAwesome5 name="pencil-alt" size={11} color={C.g400} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={sc.actionBtn} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <FontAwesome5 name="trash-alt" size={12} color={C.g300} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};
const sc = StyleSheet.create({
  card:           { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, marginHorizontal: 16, marginBottom: 10, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardActive:     { borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.blue50 },
  iconWrap:       { width: 38, height: 38, borderRadius: 11, backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: C.primary },
  info:           { flex: 1, gap: 4 },
  name:           { fontSize: 14, fontWeight: '700', color: C.dark, lineHeight: 19 },
  meta:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date:           { fontSize: 11, color: C.g400 },
  count:          { fontSize: 11, color: C.g500, backgroundColor: C.g100, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  actions:        { flexDirection: 'row', gap: 6, alignItems: 'center' },
  actionBtn:      { padding: 4 },
});

// ─── History tab ──────────────────────────────────────────────────────────────
const HistoryTab = ({ sessions, activeSessionId, onOpen, onDelete, onRename }) => {
  const [renameTarget, setRenameTarget] = useState(null);
  const [draftName,    setDraftName]    = useState('');

  const openRename = (session) => { setRenameTarget(session); setDraftName(session.name); };
  const confirmRename = () => {
    if (draftName.trim()) onRename(renameTarget.id, { name: draftName.trim() });
    setRenameTarget(null);
  };

  if (sessions.length === 0) {
    return (
      <View style={ht.center}>
        <FontAwesome5 name="history" size={32} color={C.g300} />
        <Text style={ht.emptyTitle}>No sessions yet</Text>
        <Text style={ht.emptySub}>Start a conversation — it will appear here.</Text>
      </View>
    );
  }
  return (
    <>
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            isActive={item.id === activeSessionId}
            onPress={() => onOpen(item.id)}
            onDelete={() => onDelete(item.id)}
            onRename={() => openRename(item)}
          />
        )}
        contentContainerStyle={ht.list}
        showsVerticalScrollIndicator={false}
      />
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={() => setRenameTarget(null)}>
          <TouchableOpacity style={rm.box} activeOpacity={1} onPress={() => {}}>
            <Text style={rm.title}>Rename session</Text>
            <TextInput
              style={rm.input}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={rm.row}>
              <TouchableOpacity style={rm.cancelBtn} onPress={() => setRenameTarget(null)}>
                <Text style={rm.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rm.confirmBtn} onPress={confirmRename}>
                <Text style={rm.confirmTxt}>Rename</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};
const ht = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.g600 },
  emptySub:   { fontSize: 13, color: C.g400, textAlign: 'center', paddingHorizontal: 32 },
  list:       { paddingTop: 16, paddingBottom: 24 },
});
const rm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  box:        { backgroundColor: C.white, borderRadius: 16, padding: 24, width: '85%', gap: 16 },
  title:      { fontSize: 16, fontWeight: '700', color: C.dark },
  input:      { borderWidth: 1, borderColor: C.g200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark },
  row:        { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: C.g200, alignItems: 'center' },
  cancelTxt:  { fontSize: 14, color: C.g600 },
  confirmBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function CaseAIAssistantTab({ caseId, caseTitle, caseNumber }) {
  const [tab,             setTab]             = useState('chat');
  const [sessions,        setSessions]        = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [question,        setQuestion]        = useState('');
  const [loading,         setLoading]         = useState(false);
  const [indexing,        setIndexing]        = useState(false);
  const [status,          setStatus]          = useState(null);
  const listRef = useRef(null);

  // ── Boot: load session list ───────────────────────────────────────────────
  useEffect(() => {
    if (!caseId) return;
    loadStatus();
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSIONS_KEY(caseId));
        const list = raw ? JSON.parse(raw) : [];
        setSessions(list);
        if (list.length > 0) {
          // Open most recent session
          await openSession(list[0].id, list);
        } else {
          // Create first session
          await createSession();
        }
      } catch {}
    })();
  }, [caseId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const saveSessions = useCallback(async (list) => {
    try { await AsyncStorage.setItem(SESSIONS_KEY(caseId), JSON.stringify(list)); } catch {}
  }, [caseId]);

  const saveMsgs = useCallback(async (sessionId, msgs) => {
    try { await AsyncStorage.setItem(MSGS_KEY(sessionId), JSON.stringify(msgs.slice(-MAX_MSGS))); } catch {}
  }, []);

  const updateSessionMeta = useCallback((sessionId, updates, currentList) => {
    setSessions(prev => {
      const base = currentList ?? prev;
      const next = base.map(s => s.id === sessionId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
      // Most recent first
      next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      saveSessions(next);
      return next;
    });
  }, [saveSessions]);

  // ── Create new session ────────────────────────────────────────────────────
  const createSession = useCallback(async (currentList) => {
    const id = genId();
    const session = {
      id,
      name: 'New conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      msgCount: 0,
    };
    setSessions(prev => {
      const base = currentList ?? prev;
      const next = [session, ...base];
      saveSessions(next);
      return next;
    });
    setActiveSessionId(id);
    setMessages([]);
    setTab('chat');
    return id;
  }, [saveSessions]);

  // ── Open existing session ─────────────────────────────────────────────────
  const openSession = useCallback(async (sessionId, currentList) => {
    try {
      const raw = await AsyncStorage.getItem(MSGS_KEY(sessionId));
      const msgs = raw ? JSON.parse(raw) : [];
      setMessages(msgs);
      setActiveSessionId(sessionId);
      setTab('chat');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
  }, []);

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback((sessionId) => {
    Alert.alert('Delete session', 'This conversation will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem(MSGS_KEY(sessionId));
          setSessions(prev => {
            const next = prev.filter(s => s.id !== sessionId);
            saveSessions(next);
            // If deleting active session, switch to another or create new
            if (activeSessionId === sessionId) {
              const other = next[0];
              if (other) openSession(other.id);
              else createSession(next);
            }
            return next;
          });
        }
      },
    ]);
  }, [activeSessionId, openSession, createSession, saveSessions]);

  // ── New session button ────────────────────────────────────────────────────
  const newSession = useCallback(() => {
    Alert.alert('New Session', 'Start a new conversation? The current session is saved in History.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New Session', onPress: () => createSession() },
    ]);
  }, [createSession]);

  // ── Index status ──────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const s = await ragAPI.status(caseId);
      setStatus(s);
      if (!s.is_indexed) triggerIndex();
    } catch {}
  }, [caseId]);

  const triggerIndex = useCallback(async () => {
    setIndexing(true);
    try { await ragAPI.ingest(caseId); } catch { setIndexing(false); return; }
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const s = await ragAPI.status(caseId);
        setStatus(s);
        if (s.is_indexed) { setIndexing(false); return; }
      } catch {}
      if (attempts < 15) setTimeout(poll, 8000);
      else setIndexing(false);
    };
    setTimeout(poll, 8000);
  }, [caseId]);

  // ── Send question ─────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const q = (text ?? question).trim();
    if (!q || loading) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession();
    }

    const isFirst = messages.length === 0;
    const userMsg = { id: Date.now().toString(), role: 'user', content: q };
    const newMsgs = [...messages, userMsg];

    setMessages(newMsgs);
    saveMsgs(sessionId, newMsgs);
    setQuestion('');
    setLoading(true);

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await ragAPI.ask(caseId, q, history);
      const aiMsg = {
        id:      (Date.now() + 1).toString(),
        role:    'assistant',
        content: res.answer,
        sources: res.sources || [],
      };
      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);
      saveMsgs(sessionId, finalMsgs);

      if (isFirst) {
        // Generate title from first Q&A — update name once we have it
        const shortQ = q.length > 50 ? q.slice(0, 47) + '…' : q;
        ragAPI.sessionTitle(q, res.answer)
          .then(({ title }) => {
            updateSessionMeta(sessionId, { name: title?.trim() || shortQ, msgCount: finalMsgs.length });
          })
          .catch(() => {
            updateSessionMeta(sessionId, { name: shortQ, msgCount: finalMsgs.length });
          });
      } else {
        updateSessionMeta(sessionId, { msgCount: finalMsgs.length });
      }
    } catch {
      const errMsg = {
        id:      (Date.now() + 1).toString(),
        role:    'assistant',
        content: "An error occurred. Please check your connection and try again.",
        sources: [],
      };
      const finalMsgs = [...newMsgs, errMsg];
      setMessages(finalMsgs);
      saveMsgs(sessionId, finalMsgs);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [question, loading, messages, caseId, activeSessionId, createSession, saveMsgs, updateSessionMeta]);

  // ── Active session name ───────────────────────────────────────────────────
  const activeSession = sessions.find(s => s.id === activeSessionId);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Case badge */}
      {(caseTitle || caseNumber) && (
        <View style={s.caseBadge}>
          <FontAwesome5 name="folder-open" size={11} color={C.primary} />
          <Text style={s.caseBadgeTxt} numberOfLines={1}>
            {caseNumber ? `#${caseNumber} · ` : ''}{caseTitle || ''}
          </Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabBtn, tab === 'chat' && s.tabBtnActive]} onPress={() => setTab('chat')} activeOpacity={0.8}>
          <FontAwesome5 name="comment-alt" size={12} color={tab === 'chat' ? C.primary : C.g400} />
          <Text style={[s.tabTxt, tab === 'chat' && s.tabTxtActive]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'history' && s.tabBtnActive]} onPress={() => setTab('history')} activeOpacity={0.8}>
          <FontAwesome5 name="history" size={12} color={tab === 'history' ? C.primary : C.g400} />
          <Text style={[s.tabTxt, tab === 'history' && s.tabTxtActive]}>Sessions</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.newBtn} onPress={newSession} activeOpacity={0.8}>
          <FontAwesome5 name="plus" size={10} color={C.primary} />
          <Text style={s.newBtnTxt}>New</Text>
        </TouchableOpacity>
      </View>

      {/* ── History tab ─────────────────────────────────────────────────── */}
      {tab === 'history' ? (
        <HistoryTab
          sessions={sessions}
          activeSessionId={activeSessionId}
          onOpen={(id) => openSession(id)}
          onDelete={deleteSession}
          onRename={updateSessionMeta}
        />
      ) : (
        /* ── Chat tab ──────────────────────────────────────────────────── */
        <View style={{ flex: 1 }}>
          {/* Session name bar */}
          {activeSession && (
            <View style={s.sessionBar}>
              <FontAwesome5 name="comment-dots" size={11} color={C.g500} />
              <Text style={s.sessionName} numberOfLines={1}>{activeSession.name}</Text>
            </View>
          )}

          <IndexBadge status={status} indexing={indexing} />

          {messages.length === 0 && !loading ? (
            <EmptyState onSuggestion={send} />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <Bubble msg={item} />}
              contentContainerStyle={s.list}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                loading ? (
                  <View style={s.typingRow}>
                    <View style={bs.avatar}><FontAwesome5 name="robot" size={14} color={C.primary} /></View>
                    <View style={[bs.aiBubble, { paddingHorizontal: 14, paddingVertical: 10 }]}><TypingDots /></View>
                  </View>
                ) : null
              }
            />
          )}

          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask a question about this case…"
              placeholderTextColor={C.g400}
              multiline
              editable={!loading}
              returnKeyType="send"
              onSubmitEditing={() => send()}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!question.trim() || loading) && s.sendBtnOff]}
              onPress={() => send()}
              disabled={!question.trim() || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator size="small" color={C.white} />
                : <FontAwesome5 name="paper-plane" size={14} color={C.white} />
              }
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.g50 },
  caseBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.blue50, borderBottomWidth: 1, borderBottomColor: C.blue100 },
  caseBadgeTxt: { flex: 1, fontSize: 12, color: C.primary, fontWeight: '600' },
  tabBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, paddingHorizontal: 8, paddingTop: 4 },
  tabBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabBtnActive: { borderBottomColor: C.primary },
  tabTxt:       { fontSize: 13, color: C.g400, fontWeight: '600' },
  tabTxtActive: { color: C.primary },
  newBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue100, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 4 },
  newBtnTxt:    { fontSize: 12, color: C.primary, fontWeight: '700' },
  sessionBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g100 },
  sessionName:  { flex: 1, fontSize: 12, color: C.g500, fontStyle: 'italic' },
  list:         { paddingTop: 16, paddingBottom: 8 },
  typingRow:    { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.g200 },
  input:        { flex: 1, backgroundColor: C.g100, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: C.dark, maxHeight: 100 },
  sendBtn:      { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:   { backgroundColor: C.g300 },
});
