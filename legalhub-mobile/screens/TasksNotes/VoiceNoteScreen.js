import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar,
  Animated, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { documentsAPI, notesAPI } from '../../services/api';

const C = {
  red: '#DC2626', dark: '#1E293B', white: '#FFFFFF',
  gray100: '#F3F4F6', gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280',
  green: '#16A34A', amber: '#D97706',
};

// phase: 'idle' | 'recording' | 'processing' | 'asking' | 'saved'

export default function VoiceNoteScreen({ navigation, route }) {
  const lockedCase = route?.params?.lockedCase || null;
  const lockedPartial = lockedCase
    ? { case_identifier: lockedCase.case_number || lockedCase.title }
    : null;

  const [phase, setPhase]             = useState('idle');
  const [seconds, setSeconds]         = useState(0);
  const [isPaused, setIsPaused]       = useState(false);
  const [notes, setNotes]             = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [question, setQuestion]       = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [partialData, setPartialData]               = useState(lockedPartial);
  const [transcriptions, setTranscriptions]         = useState([]);
  const [latestTranscription, setLatestTranscription] = useState('');
  const [confirmedNote, setConfirmedNote]           = useState(null);
  const [error, setError]                           = useState('');

  const recordingRef = useRef(null);
  const intervalRef  = useRef(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  // ── Load saved voice notes ───────────────────────────────────────────────
  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const all = await notesAPI.list({});
      setNotes((all || []).filter(n => n.is_voice_note));
    } catch {
      // silently fail
    } finally {
      setLoadingNotes(false);
    }
  };

  // ── Timer & pulse animation ──────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'recording' && !isPaused) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      clearInterval(intervalRef.current);
      pulseAnim.stopAnimation();
    }
    return () => clearInterval(intervalRef.current);
  }, [phase, isPaused]);

  const fmt = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Recording helpers ────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Microphone access is needed to record voice notes.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setSeconds(0);
      setIsPaused(false);
      setError('');
      setLatestTranscription('');
      setPhase('recording');
    } catch (e) {
      setError('Could not start recording. Check microphone permissions.');
    }
  };

  const stopAndSubmit = async () => {
    if (!recordingRef.current) return;
    clearInterval(intervalRef.current);

    try {
      await recordingRef.current.stopAndUnloadAsync();
    } catch { /* already unloaded */ }

    const uri = recordingRef.current.getURI();
    recordingRef.current = null;
    setSeconds(0);
    setPhase('processing');

    try {
      const result = await documentsAPI.voiceNoteAI(uri, partialData, transcriptions);

      if (result.status === 'confirm') {
        setConfirmedNote(result.note_data);
        if (result.transcription) setLatestTranscription(result.transcription);
        if (result.note_data?.case_number) {
          setPartialData(prev => ({ ...(prev || {}), case_identifier: result.note_data.case_number }));
        }
        setPhase('confirming');
      } else if (result.status === 'saved') {
        setSuccessMsg(result.message);
        setPartialData(lockedPartial);
        setTranscriptions([]);
        setLatestTranscription('');
        setConfirmedNote(null);
        setPhase('saved');
        Speech.speak(result.message, { language: 'en-US', rate: 0.9 });
        if (result.note) {
          setNotes(prev => [result.note, ...prev]);
        }
        setTimeout(() => {
          setSuccessMsg('');
          setPhase('idle');
        }, 3500);
      } else {
        // needs_info — store the transcription so the next call sends full history
        const q = result.question || 'Could you provide more details?';
        setQuestion(q);
        setPartialData(result.partial_data || null);
        if (result.transcription) {
          setLatestTranscription(result.transcription);
          setTranscriptions(prev => [...prev, result.transcription]);
        }
        setPhase('asking');
        Speech.speak(q, { language: 'en-US', rate: 0.9 });
      }
    } catch (e) {
      const msg = e.message || '';
      const isRateLimit = msg.toLowerCase().includes('busy') || msg.includes('429');
      setError(
        isRateLimit
          ? 'The AI service is busy right now. Wait a few seconds and try again.'
          : msg || 'Something went wrong. Please try again.'
      );
      setPhase(partialData ? 'asking' : 'idle');
    }
  };

  const discardRecording = async () => {
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch { }
      recordingRef.current = null;
    }
    clearInterval(intervalRef.current);
    setSeconds(0);
    setIsPaused(false);
    setPhase(partialData ? 'asking' : 'idle');
  };

  const togglePause = async () => {
    if (!recordingRef.current) return;
    if (isPaused) {
      await recordingRef.current.startAsync();
    } else {
      await recordingRef.current.pauseAsync();
    }
    setIsPaused(p => !p);
  };

  const handleMicButton = () => {
    if (phase === 'recording') {
      stopAndSubmit();
    } else if (phase === 'idle' || phase === 'asking') {
      startRecording();
    }
  };

  const handleConfirm = async () => {
    if (!confirmedNote) return;
    setPhase('processing');
    try {
      const result = await documentsAPI.voiceNoteConfirm(confirmedNote);
      setSuccessMsg(result.message);
      setPartialData(lockedPartial);
      setTranscriptions([]);
      setLatestTranscription('');
      setConfirmedNote(null);
      setPhase('saved');
      Speech.speak(result.message, { language: 'en-US', rate: 0.9 });
      if (result.note) setNotes(prev => [result.note, ...prev]);
      setTimeout(() => { setSuccessMsg(''); setPhase('idle'); }, 3500);
    } catch (e) {
      setError(e.message || 'Save failed. Please try again.');
      setPhase('confirming');
    }
  };

  const handleReRecord = () => {
    setConfirmedNote(null);
    setLatestTranscription('');
    if (lockedCase) {
      setPartialData(prev => ({ ...(prev || {}), case_identifier: lockedCase.case_number || lockedCase.title }));
    }
    setPhase('asking');
  };

  // ── Conversation bubble ──────────────────────────────────────────────────
  const renderBubble = () => {
    if (phase === 'processing') {
      return (
        <View style={[s.bubble, s.bubbleNeutral]}>
          <ActivityIndicator color={C.red} size="small" style={{ marginRight: 8 }} />
          <Text style={s.bubbleText}>Processing your voice note…</Text>
        </View>
      );
    }
    if (phase === 'saved') {
      return (
        <View style={[s.bubble, s.bubbleGreen]}>
          <FontAwesome5 name="check-circle" size={16} color={C.green} style={{ marginRight: 8 }} />
          <Text style={[s.bubbleText, { color: C.green }]}>{successMsg}</Text>
        </View>
      );
    }
    if (phase === 'confirming') {
      return (
        <View style={[s.bubble, s.bubbleAmber]}>
          <FontAwesome5 name="exclamation-circle" size={14} color={C.amber} style={{ marginRight: 8 }} />
          <Text style={[s.bubbleText, { color: '#92400e', flex: 1 }]}>
            Please review the note below before saving.
          </Text>
        </View>
      );
    }
    if (phase === 'asking') {
      return (
        <View style={[s.bubble, s.bubbleAmber]}>
          <FontAwesome5 name="robot" size={14} color={C.amber} style={{ marginRight: 8 }} />
          <Text style={[s.bubbleText, { color: '#92400e', flex: 1 }]}>{question}</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={[s.bubble, s.bubbleError]}>
          <FontAwesome5 name="exclamation-circle" size={14} color={C.red} style={{ marginRight: 8 }} />
          <Text style={[s.bubbleText, { color: '#7f1d1d', flex: 1 }]}>{error}</Text>
        </View>
      );
    }
    // idle
    return (
      <View style={[s.bubble, s.bubbleNeutral]}>
        <FontAwesome5 name="microphone" size={14} color={C.gray500} style={{ marginRight: 8 }} />
        <Text style={[s.bubbleText, { color: C.gray500, flex: 1 }]}>
          {partialData && !lockedCase
            ? 'Tap the microphone to continue answering.'
            : lockedCase
            ? 'Tap the microphone and say the note title and content.'
            : 'Tap the microphone and say the note title, content, and case name.'}
        </Text>
      </View>
    );
  };

  // ── Partial data preview ─────────────────────────────────────────────────
  const renderPartialPreview = () => {
    if (phase === 'saved') return null;
    // In idle, only show if there's a locked case to display
    if (phase === 'idle' && !lockedCase) return null;

    let title = '', content = '', caseStr = '';
    if (phase === 'confirming' && confirmedNote) {
      title    = confirmedNote.title   || '';
      content  = confirmedNote.content || '';
      caseStr  = confirmedNote.case_number
        ? `${confirmedNote.case_number} — ${confirmedNote.case_title}`
        : '';
    } else if (partialData) {
      title    = partialData.title           || '';
      content  = partialData.content         || '';
      caseStr  = partialData.case_identifier || '';
    }

    // If locked case and caseStr still empty, use the locked case label
    if (lockedCase && !caseStr) {
      caseStr = lockedCase.case_number
        ? `${lockedCase.case_number} — ${lockedCase.title}`
        : lockedCase.title || '';
    }

    if (!title && !content && !caseStr) return null;

    const Row = ({ label, value, locked }) => (
      <View style={s.previewRow}>
        <FontAwesome5
          name={locked ? 'lock' : (value ? 'check-circle' : 'circle')}
          size={13}
          color={locked ? 'rgba(255,255,255,0.7)' : (value ? C.green : 'rgba(255,255,255,0.4)')}
          style={{ width: 18 }}
        />
        <Text style={s.previewLabel}>{label}</Text>
        <Text style={s.previewValue} numberOfLines={1}>{value || '—'}</Text>
      </View>
    );

    return (
      <View style={s.previewCard}>
        <Row label="Title"   value={title} />
        <Row label="Content" value={content} />
        <Row label="Case"    value={caseStr} locked={!!lockedCase} />
      </View>
    );
  };

  // ── Note list item ───────────────────────────────────────────────────────
  const extractTitle = content => {
    const match = content?.match(/^\*\*(.+?)\*\*/);
    return match ? match[1] : 'Voice note';
  };

  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString();
  };

  // ── Confirmation card ─────────────────────────────────────────────────────
  const renderConfirmCard = () => {
    if (!confirmedNote) return null;
    const { title, content, case_number, case_title } = confirmedNote;
    return (
      <View style={s.confirmCard}>
        <Text style={s.confirmCardTitle}>Review before saving</Text>

        <View style={s.confirmField}>
          <Text style={s.confirmFieldLabel}>Title</Text>
          <Text style={s.confirmFieldValue}>{title}</Text>
        </View>
        <View style={s.confirmField}>
          <Text style={s.confirmFieldLabel}>Content</Text>
          <Text style={s.confirmFieldValue}>{content}</Text>
        </View>
        <View style={s.confirmField}>
          <Text style={s.confirmFieldLabel}>Case</Text>
          <Text style={s.confirmFieldValue}>{case_number} — {case_title}</Text>
        </View>

        {!!error && (
          <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{error}</Text>
        )}

        <View style={s.confirmActions}>
          <TouchableOpacity style={s.confirmBtnSave} onPress={handleConfirm}>
            <FontAwesome5 name="check" size={14} color={C.white} style={{ marginRight: 6 }} />
            <Text style={s.confirmBtnSaveText}>Save Note</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.confirmBtnRedo} onPress={handleReRecord}>
            <FontAwesome5 name="microphone" size={14} color={C.dark} style={{ marginRight: 6 }} />
            <Text style={s.confirmBtnRedoText}>Re-record</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const isActive = phase === 'recording';
  const canTapMic = phase === 'idle' || phase === 'asking' || phase === 'recording';

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.red} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
          <FontAwesome5 name="arrow-left" size={16} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Voice Notes</Text>
        <View style={s.backBtn} />
      </View>

      {/* Recorder area */}
      <View style={[s.recorderArea, phase === 'confirming' && { paddingVertical: 8 }]}>

        {/* Conversation bubble */}
        <View style={s.bubbleWrap}>{renderBubble()}</View>

        {/* Extracted fields preview */}
        {renderPartialPreview()}

        {/* Last transcription */}
        {!!latestTranscription && phase !== 'recording' && phase !== 'idle' && (
          <View style={s.transcriptBox}>
            <FontAwesome5 name="quote-left" size={10} color="rgba(255,255,255,0.5)" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={s.transcriptText} numberOfLines={3}>{latestTranscription}</Text>
          </View>
        )}

        {/* Timer + waveform — hidden during confirmation */}
        {phase !== 'confirming' && <>
          <Text style={s.timer}>{fmt(seconds)}</Text>
          <Text style={s.timerSub}>
            {phase === 'recording'
              ? (isPaused ? 'Paused' : 'Recording…')
              : phase === 'processing'
              ? 'Analysing…'
              : 'Tap to start'}
          </Text>
          <View style={s.waveform}>
            {Array.from({ length: 24 }).map((_, i) => (
              <View
                key={i}
                style={[
                  s.waveBar,
                  {
                    height: isActive && !isPaused ? 8 + Math.random() * 32 : 12,
                    backgroundColor: isActive ? C.white : 'rgba(255,255,255,0.3)',
                  },
                ]}
              />
            ))}
          </View>
        </>}

        {/* Mic button + controls + hint — hidden during confirmation */}
        {phase !== 'confirming' && <>
          <Animated.View
            style={[
              s.pulseRing,
              { transform: [{ scale: isActive ? pulseAnim : 1 }], opacity: isActive ? 0.3 : 0 },
            ]}
          />
          <TouchableOpacity
            style={[s.recordBtn, isActive && s.recordBtnActive]}
            onPress={canTapMic ? handleMicButton : undefined}
            disabled={phase === 'processing' || phase === 'saved'}
          >
            {phase === 'processing' ? (
              <ActivityIndicator color={C.red} size="large" />
            ) : (
              <FontAwesome5
                name={isActive ? 'stop' : 'microphone'}
                size={28}
                color={isActive ? C.red : C.white}
              />
            )}
          </TouchableOpacity>
          {phase === 'recording' && (
            <View style={s.controls}>
              <TouchableOpacity style={s.controlBtn} onPress={togglePause}>
                <FontAwesome5 name={isPaused ? 'play' : 'pause'} size={18} color={C.white} />
                <Text style={s.controlLabel}>{isPaused ? 'Resume' : 'Pause'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.controlBtn, { backgroundColor: 'rgba(255,255,255,0.3)' }]}
                onPress={discardRecording}
              >
                <FontAwesome5 name="trash" size={18} color={C.white} />
                <Text style={s.controlLabel}>Discard</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={s.hint}>
            {phase === 'recording' ? 'Tap stop to submit' : 'Max 30 minutes per recording'}
          </Text>
        </>}
      </View>

      {/* Confirmation card OR saved notes list */}
      <View style={s.listArea}>
        {phase === 'confirming' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {renderConfirmCard()}
          </ScrollView>
        ) : null}
        {phase !== 'confirming' && (
        <Text style={s.listTitle}>
          Saved Voice Notes ({notes.length})
        </Text>)}
        {phase !== 'confirming' && (loadingNotes ? (
          <ActivityIndicator color={C.red} style={{ marginTop: 20 }} />
        ) : notes.length === 0 ? (
          <Text style={s.emptyText}>No voice notes yet. Record your first one above.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {notes.map(n => (
              <View key={n.id} style={s.recCard}>
                <View style={s.recIcon}>
                  <FontAwesome5 name="microphone" size={16} color={C.red} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.recTitle} numberOfLines={1}>
                    {extractTitle(n.content)}
                  </Text>
                  <Text style={s.recMeta}>
                    {n.case_file ? `${n.case_file.case_number}` : 'No case'} • {fmtDate(n.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.red },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  recorderArea: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },

  bubbleWrap: { width: '100%', marginBottom: 12 },
  bubble: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleNeutral: { backgroundColor: 'rgba(255,255,255,0.15)' },
  bubbleGreen:   { backgroundColor: '#dcfce7' },
  bubbleAmber:   { backgroundColor: '#fef3c7' },
  bubbleError:   { backgroundColor: '#fee2e2' },
  bubbleText:    { fontSize: 13, color: C.white, lineHeight: 18 },

  timer: {
    fontSize: 52, fontWeight: '800', color: C.white,
    letterSpacing: 2, fontVariant: ['tabular-nums'],
  },
  timerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, marginBottom: 20 },

  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 50, marginBottom: 24 },
  waveBar:  { width: 4, borderRadius: 2 },

  pulseRing: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: C.white, top: '50%', marginTop: 60,
  },
  recordBtn: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 8, marginBottom: 14,
  },
  recordBtnActive: { backgroundColor: '#FEE2E2' },

  controls: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  controlLabel: { fontSize: 13, color: C.white, fontWeight: '600' },
  hint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  transcriptBox: {
    width: '100%', flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
  },
  transcriptText: {
    flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic', lineHeight: 18,
  },

  previewCard: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 10, gap: 6,
  },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  previewLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 52,
  },
  previewValue: {
    fontSize: 12, color: C.white, fontWeight: '600', flex: 1,
  },

  listArea: {
    flex: 1, backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 20,
  },
  listTitle: { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 14 },
  emptyText: { fontSize: 13, color: C.gray400, textAlign: 'center', marginTop: 20 },

  recCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  recIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
  },
  recTitle: { fontSize: 14, fontWeight: '600', color: C.dark },
  recMeta:  { fontSize: 12, color: C.gray500, marginTop: 2 },

  confirmCard: {
    backgroundColor: C.white, borderRadius: 16,
    paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8,
  },
  confirmCardTitle: {
    fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 14,
  },
  confirmField: {
    borderBottomWidth: 1, borderBottomColor: C.gray100,
    paddingVertical: 10, gap: 2,
  },
  confirmFieldLabel: { fontSize: 11, color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  confirmFieldValue: { fontSize: 14, color: C.dark, fontWeight: '500' },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmBtnSave: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.green, borderRadius: 12, paddingVertical: 13,
  },
  confirmBtnSaveText: { color: C.white, fontWeight: '700', fontSize: 14 },
  confirmBtnRedo: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.gray100, borderRadius: 12, paddingVertical: 13,
  },
  confirmBtnRedoText: { color: C.dark, fontWeight: '600', fontSize: 14 },
});
