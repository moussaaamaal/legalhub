import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { aiAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  indigo600: '#4F46E5', indigo50: '#EEF2FF',
  purple600: '#9333EA', purple50: '#FAF5FF',
};

const QUICK_PROMPTS = [
  { icon: 'gavel',           label: 'Case Strategy',    text: 'What are the best legal strategies for a civil litigation case?' },
  { icon: 'file-contract',   label: 'Draft Clause',     text: 'Draft a confidentiality clause for a service agreement.' },
  { icon: 'search',          label: 'Legal Research',   text: 'Summarize the key principles of contract formation in common law.' },
  { icon: 'calendar-check',  label: 'Deadlines',        text: 'What procedural deadlines should I track for a commercial dispute?' },
  { icon: 'shield-alt',      label: 'Client Rights',    text: 'What are a client\'s rights during a criminal investigation?' },
  { icon: 'balance-scale',   label: 'Case Assessment',  text: 'How do I assess the strength of a negligence claim?' },
];

function TypingDots() {
  return (
    <View style={st.typingBubble}>
      <View style={st.typingDots}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[st.dot, { opacity: 0.4 + i * 0.2 }]} />
        ))}
      </View>
      <Text style={st.typingLabel}>AI is thinking…</Text>
    </View>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[st.msgRow, isUser && st.msgRowUser]}>
      {!isUser && (
        <View style={st.aiAvatar}>
          <FontAwesome5 name="robot" size={14} color={C.white} />
        </View>
      )}
      <View style={[st.bubble, isUser ? st.bubbleUser : st.bubbleAI]}>
        <Text style={[st.bubbleText, isUser && st.bubbleTextUser]}>{msg.text}</Text>
        <Text style={[st.bubbleTime, isUser && st.bubbleTimeUser]}>{msg.time}</Text>
      </View>
    </View>
  );
}

export default function AIAssistantScreen({ navigation }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Hello! I\'m your AI legal assistant. Ask me anything about case strategy, legal research, document drafting, or procedural guidance.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input,     setInput]     = useState('');
  const [isTyping,  setIsTyping]  = useState(false);
  const scrollRef = useRef(null);

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || isTyping) return;
    setInput('');

    setMessages(prev => [...prev, { role: 'user', text: msg, time: now() }]);
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await aiAPI.caseAssistant(null, msg);
      const answer = result.answer || result.summary || result.suggestions || 'Here is my analysis.';
      setMessages(prev => [...prev, { role: 'ai', text: answer, time: now() }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `Sorry, I couldn't process your request: ${err.message || 'Unknown error'}`,
        time: now(),
      }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, isTyping]);

  const showQuickPrompts = messages.length <= 1;

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation?.goBack?.()}>
          <FontAwesome5 name="arrow-left" size={16} color={C.white} />
        </TouchableOpacity>
        <View style={st.aiIconWrap}>
          <FontAwesome5 name="robot" size={18} color={C.white} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.headerTitle}>AI Legal Assistant</Text>
          <View style={st.onlineRow}>
            <View style={st.onlineDot} />
            <Text style={st.onlineText}>Online · Ready to help</Text>
          </View>
        </View>
        <TouchableOpacity
          style={st.clearBtn}
          onPress={() => setMessages([{
            role: 'ai',
            text: 'Hello! I\'m your AI legal assistant. Ask me anything about case strategy, legal research, document drafting, or procedural guidance.',
            time: now(),
          }])}
        >
          <FontAwesome5 name="redo" size={14} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* MESSAGES */}
        <ScrollView
          ref={scrollRef}
          style={st.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {isTyping && <TypingDots />}

          {/* Quick prompts shown only on fresh session */}
          {showQuickPrompts && !isTyping && (
            <View style={st.quickSection}>
              <Text style={st.quickTitle}>Quick Prompts</Text>
              <View style={st.quickGrid}>
                {QUICK_PROMPTS.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={st.quickChip}
                    onPress={() => sendMessage(q.text)}
                    activeOpacity={0.75}
                  >
                    <View style={st.quickIcon}>
                      <FontAwesome5 name={q.icon} size={13} color={C.indigo600} />
                    </View>
                    <Text style={st.quickLabel}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* INPUT */}
        <View style={st.inputBar}>
          <TextInput
            style={st.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a legal question…"
            placeholderTextColor={C.g400}
            multiline
            maxLength={1000}
            onSubmitEditing={() => sendMessage()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[st.sendBtn, (!input.trim() || isTyping) && st.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.8}
          >
            {isTyping
              ? <ActivityIndicator size="small" color={C.white} />
              : <FontAwesome5 name="paper-plane" size={15} color={C.white} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.primary },
  scroll:       { flex: 1, backgroundColor: C.g50 },

  header:       { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8 },
  backBtn:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiIconWrap:   { width: 40, height: 40, borderRadius: 20, backgroundColor: C.indigo600, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: C.white },
  onlineRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  onlineText:   { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  clearBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  msgRow:       { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
  msgRowUser:   { flexDirection: 'row-reverse' },
  aiAvatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: C.indigo600, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble:       { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleAI:     { backgroundColor: C.white, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bubbleUser:   { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleText:   { fontSize: 14, color: C.dark, lineHeight: 21 },
  bubbleTextUser:{ color: C.white },
  bubbleTime:   { fontSize: 10, color: C.g400, marginTop: 5, textAlign: 'right' },
  bubbleTimeUser:{ color: 'rgba(255,255,255,0.6)' },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  typingDots:   { flexDirection: 'row', gap: 4, backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: C.indigo600 },
  typingLabel:  { fontSize: 12, color: C.g400, fontStyle: 'italic' },

  quickSection: { marginTop: 20 },
  quickTitle:   { fontSize: 13, fontWeight: '700', color: C.g500, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  quickGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickChip:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.g200, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  quickIcon:    { width: 28, height: 28, borderRadius: 8, backgroundColor: C.indigo50, alignItems: 'center', justifyContent: 'center' },
  quickLabel:   { fontSize: 13, fontWeight: '600', color: C.dark },

  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.g200 },
  input:        { flex: 1, backgroundColor: C.g50, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark, maxHeight: 120, borderWidth: 1, borderColor: C.g200 },
  sendBtn:      { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: C.g400 },
});
