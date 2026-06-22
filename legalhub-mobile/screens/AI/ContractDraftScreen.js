import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar,
  ScrollView, TextInput, Modal, ActivityIndicator, Alert, Clipboard,
  KeyboardAvoidingView, Platform, FlatList, Linking,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { contractsAPI } from '../../services/api';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:   '#1E40AF',
  white:     '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g300: '#D1D5DB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  dark: '#1E293B',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  emerald50: '#ECFDF5', emerald100: '#D1FAE5', emerald600: '#059669',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  purple50: '#FAF5FF', purple100: '#EDE9FE', purple600: '#7C3AED',
  rose50: '#FFF1F2', rose100: '#FFE4E6', rose600: '#E11D48',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

// ─── Contract type definitions ────────────────────────────────────────────────
const CONTRACT_TYPES = [
  { key: 'bail',               icon: 'home',         color: C.purple600, bg: C.purple50, accent: C.purple100, labels: { ar: 'عقد إيجار',        fr: 'Contrat de bail',      en: 'Lease' } },
  { key: 'travail_cdi',        icon: 'user-tie',     color: C.primary,   bg: C.blue50,   accent: C.blue100,   labels: { ar: 'عقد عمل دائم',     fr: 'CDI',                  en: 'Employment CDI' } },
  { key: 'travail_cdd',        icon: 'user-clock',   color: C.blue600,   bg: C.blue50,   accent: C.blue100,   labels: { ar: 'عقد عمل محدد المدة', fr: 'CDD',                 en: 'Employment CDD' } },
  { key: 'prestation_service', icon: 'handshake',    color: C.indigo600, bg: C.indigo50, accent: C.indigo100, labels: { ar: 'عقد خدمات',         fr: 'Prestation de services', en: 'Service Agreement' } },
  { key: 'nda',                icon: 'lock',         color: C.emerald600,bg: C.emerald50,accent: C.emerald100,labels: { ar: 'اتفاقية سرية',      fr: 'NDA / Confidentialité', en: 'NDA' } },
  { key: 'societe',            icon: 'building',     color: C.teal600,   bg: C.teal50,   accent: C.teal100,   labels: { ar: 'تأسيس شركة',        fr: 'Statuts de société',   en: 'Company Formation' } },
  { key: 'vente',              icon: 'exchange-alt', color: C.amber600,  bg: C.amber50,  accent: C.amber100,  labels: { ar: 'عقد بيع',           fr: 'Contrat de vente',     en: 'Sale Agreement' } },
  { key: 'partenariat',        icon: 'people-carry', color: C.rose600,   bg: C.rose50,   accent: C.rose100,   labels: { ar: 'عقد شراكة',         fr: 'Partenariat',          en: 'Partnership' } },
  { key: 'pret',               icon: 'coins',        color: C.emerald600,bg: C.emerald50,accent: C.emerald100,labels: { ar: 'عقد قرض',           fr: 'Contrat de prêt',      en: 'Loan Agreement' } },
  { key: 'franchise',          icon: 'store',        color: C.indigo600, bg: C.indigo50, accent: C.indigo100, labels: { ar: 'عقد امتياز',        fr: 'Franchise',            en: 'Franchise' } },
];

const LANGUAGES = [
  { key: 'ar', label: 'العربية', flag: '🇸🇦' },
  { key: 'fr', label: 'Français', flag: '🇫🇷' },
  { key: 'en', label: 'English', flag: '🇬🇧' },
];

const COUNTRIES = [
  { code: 'TN', label: 'Tunisie' }, { code: 'DZ', label: 'Algérie' },
  { code: 'MA', label: 'Maroc' },   { code: 'EG', label: 'Égypte' },
  { code: 'QA', label: 'Qatar' },   { code: 'SA', label: 'Arabie Saoudite' },
  { code: 'AE', label: 'EAU' },     { code: 'KW', label: 'Koweït' },
  { code: 'BH', label: 'Bahreïn' }, { code: 'OM', label: 'Oman' },
  { code: 'JO', label: 'Jordanie' },{ code: 'LB', label: 'Liban' },
  { code: 'FR', label: 'France' },  { code: 'US', label: 'États-Unis' },
];

// ─── Markdown renderer ────────────────────────────────────────────────────────
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

// Check if a line is a markdown table row
const isTableLine = (line) => {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
};
// Check if a line is a separator row (|---|---|)
const isSeparator = (line) => /^\|[\s\-|:]+\|$/.test(line.trim());

// Parse a table row into cells
const parseTableRow = (line) => {
  return line.trim()
    .replace(/^\||\|$/g, '')   // remove leading/trailing |
    .split('|')
    .map(cell => cell.trim());
};

// Render a markdown table block
const MarkdownTable = ({ rows, isRtl }) => {
  if (!rows || rows.length === 0) return null;
  const headers = parseTableRow(rows[0]);
  // rows[1] is usually the separator — skip it
  const dataRows = rows.slice(2).map(parseTableRow);

  return (
    <View style={mt.table}>
      {/* Header row */}
      <View style={mt.headerRow}>
        {headers.map((cell, ci) => (
          <View key={ci} style={[mt.headerCell, ci === 0 && mt.firstCell, ci === headers.length - 1 && mt.lastCell]}>
            <Text style={[mt.headerTxt, isRtl && mt.rtl]} numberOfLines={3}>{cell}</Text>
          </View>
        ))}
      </View>
      {/* Data rows */}
      {dataRows.map((cells, ri) => (
        <View key={ri} style={[mt.dataRow, ri % 2 === 0 && mt.dataRowEven]}>
          {cells.map((cell, ci) => (
            <View key={ci} style={[mt.dataCell, ci === 0 && mt.firstCell, ci === cells.length - 1 && mt.lastCell]}>
              <Text style={[mt.dataTxt, isRtl && mt.rtl]} numberOfLines={6}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

const mt = StyleSheet.create({
  table:       { borderWidth: 1, borderColor: C.g200, borderRadius: 10, overflow: 'hidden', marginVertical: 8 },
  headerRow:   { flexDirection: 'row', backgroundColor: C.primary },
  dataRow:     { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.g200 },
  dataRowEven: { backgroundColor: C.g50 },
  headerCell:  { flex: 1, padding: 8, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.2)' },
  dataCell:    { flex: 1, padding: 8, borderRightWidth: 1, borderRightColor: C.g200 },
  firstCell:   {},
  lastCell:    { borderRightWidth: 0 },
  headerTxt:   { fontSize: 12, fontWeight: '700', color: C.white, lineHeight: 17 },
  dataTxt:     { fontSize: 12, color: C.dark, lineHeight: 18 },
  rtl:         { textAlign: 'right', writingDirection: 'rtl' },
});

// Group lines into blocks: table blocks and text blocks
const groupBlocks = (lines) => {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      // Collect consecutive table lines
      const tableLines = [];
      while (i < lines.length && isTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', lines: tableLines });
    } else {
      // Collect consecutive non-table lines
      const textLines = [];
      while (i < lines.length && !isTableLine(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'text', lines: textLines });
    }
  }
  return blocks;
};

const MarkdownText = ({ text, style }) => {
  const isRtl = style && (
    (Array.isArray(style) ? style : [style]).some(s => s && s.textAlign === 'right')
  );
  const lines = (text || '').split('\n');
  const blocks = groupBlocks(lines);

  return (
    <View>
      {blocks.map((block, bi) => {
        if (block.type === 'table') {
          return <MarkdownTable key={bi} rows={block.lines} isRtl={isRtl} />;
        }
        // Text block
        return (
          <Text key={bi} style={style}>
            {block.lines.map((line, i) => {
              let prefix = '', weight = null, size = null, content = line;
              if (line.startsWith('### '))     { weight = '700'; size = 14; content = line.slice(4); }
              else if (line.startsWith('## ')) { weight = '800'; size = 15; content = line.slice(3); }
              else if (line.startsWith('# '))  { weight = '800'; size = 16; content = line.slice(2); }
              else if (line.startsWith('- ') || line.startsWith('• ')) { prefix = '• '; content = line.slice(2); }
              const parts = parseInline(content);
              return (
                <Text key={i}>
                  {i > 0 ? '\n' : ''}
                  {prefix ? <Text>{prefix}</Text> : null}
                  <Text style={(weight || size) ? [weight && { fontWeight: weight }, size && { fontSize: size }] : null}>
                    {parts.map((p, j) => (
                      <Text key={j} style={[p.bold && { fontWeight: '700' }, p.italic && { fontStyle: 'italic' }]}>{p.t}</Text>
                    ))}
                  </Text>
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
};

// ─── Step 1: Config ───────────────────────────────────────────────────────────
const ConfigStep = ({ onStart, lang, onLangChange }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [country, setCountry] = useState('TN');
  const [showCountry, setShowCountry] = useState(false);
  const [loading, setLoading] = useState(false);

  const canStart = !!selectedType;

  const handleStart = async () => {
    if (!canStart) return;
    setLoading(true);
    try {
      const res = await contractsAPI.startSession({
        contract_type: selectedType.key,
        lang,
        country_code: country,
      });
      onStart(res, selectedType, lang);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de démarrer la session.');
    } finally {
      setLoading(false);
    }
  };

  const selectedCountry = COUNTRIES.find(c => c.code === country);
  const numCols = 2;
  const rows = [];
  for (let i = 0; i < CONTRACT_TYPES.length; i += numCols) {
    rows.push(CONTRACT_TYPES.slice(i, i + numCols));
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* Language selector */}
      <Text style={s.sectionLabel}>{lang === 'ar' ? 'لغة العقد' : lang === 'fr' ? 'Langue du contrat' : 'Contract language'}</Text>
      <View style={s.langRow}>
        {LANGUAGES.map(l => (
          <TouchableOpacity
            key={l.key}
            style={[s.langBtn, lang === l.key && s.langBtnActive]}
            onPress={() => onLangChange(l.key)}
          >
            <Text style={s.langFlag}>{l.flag}</Text>
            <Text style={[s.langTxt, lang === l.key && s.langTxtActive]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Country selector */}
      <Text style={[s.sectionLabel, { marginTop: 16 }]}>{lang === 'ar' ? 'الدولة / الولاية القضائية' : lang === 'fr' ? 'Pays / Juridiction' : 'Country / Jurisdiction'}</Text>
      <TouchableOpacity style={s.countryBtn} onPress={() => setShowCountry(true)}>
        <FontAwesome5 name="globe" size={14} color={C.primary} />
        <Text style={s.countryTxt}>{selectedCountry?.label || (lang === 'ar' ? 'اختر دولة' : lang === 'fr' ? 'Choisir un pays' : 'Choose a country')}</Text>
        <FontAwesome5 name="chevron-down" size={12} color={C.g400} />
      </TouchableOpacity>

      {/* Contract type grid */}
      <Text style={[s.sectionLabel, { marginTop: 20 }]}>{lang === 'ar' ? 'نوع العقد' : lang === 'fr' ? 'Type de contrat' : 'Contract type'}</Text>
      {rows.map((row, ri) => (
        <View key={ri} style={s.typeRow}>
          {row.map(type => {
            const isSelected = selectedType?.key === type.key;
            return (
              <TouchableOpacity
                key={type.key}
                style={[s.typeCard, { backgroundColor: isSelected ? type.color : type.bg }, isSelected && s.typeCardSelected]}
                onPress={() => setSelectedType(type)}
                activeOpacity={0.8}
              >
                <View style={[s.typeIconWrap, { backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : type.accent }]}>
                  <FontAwesome5 name={type.icon} size={20} color={isSelected ? C.white : type.color} />
                </View>
                <Text style={[s.typeLabel, { color: isSelected ? C.white : type.color }]} numberOfLines={2}>
                  {type.labels[lang] || type.labels.fr}
                </Text>
                {isSelected && <FontAwesome5 name="check-circle" size={14} color={C.white} style={{ position: 'absolute', top: 10, right: 10 }} />}
              </TouchableOpacity>
            );
          })}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}

      {/* Start button */}
      <TouchableOpacity
        style={[s.startBtn, !canStart && s.startBtnOff]}
        onPress={handleStart}
        disabled={!canStart || loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={C.white} size="small" />
          : <>
              <FontAwesome5 name="robot" size={16} color={C.white} />
              <Text style={s.startTxt}>{lang === 'ar' ? 'ابدأ مع الذكاء الاصطناعي' : lang === 'fr' ? "Démarrer avec l'IA" : 'Start with AI'}</Text>
            </>
        }
      </TouchableOpacity>

      <View style={s.infoRow}>
        <FontAwesome5 name="info-circle" size={12} color={C.g400} />
        <Text style={s.infoTxt}>{lang === 'ar' ? 'سيطرح عليك الذكاء الاصطناعي أسئلة لجمع المعلومات اللازمة لصياغة العقد.' : lang === 'fr' ? "L'IA vous posera des questions pour collecter les informations nécessaires à la rédaction du contrat." : 'The AI will ask you questions to collect the information needed to draft the contract.'}</Text>
      </View>

      {/* Country modal */}
      <Modal visible={showCountry} transparent animationType="slide" onRequestClose={() => setShowCountry(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowCountry(false)}>
          <View style={s.countrySheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{lang === 'ar' ? 'اختر دولة' : lang === 'fr' ? 'Choisir un pays' : 'Choose a country'}</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.countryItem, item.code === country && s.countryItemActive]}
                  onPress={() => { setCountry(item.code); setShowCountry(false); }}
                >
                  <Text style={[s.countryItemTxt, item.code === country && s.countryItemTxtActive]}>{item.label}</Text>
                  {item.code === country && <FontAwesome5 name="check" size={12} color={C.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};

// ─── Step 2: Questions (AI Questionnaire) ─────────────────────────────────────
const QuestionsStep = ({ session, contractType, lang, onComplete, onBack }) => {
  const [answers, setAnswers] = useState({});
  const [currentAnswers, setCurrentAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const questions = session?.questions || [];

  const allAnswered = questions.every(q => (currentAnswers[q] || '').trim().length > 0);

  const handleNext = async () => {
    if (!allAnswered) return;
    setLoading(true);
    try {
      const merged = { ...answers, ...currentAnswers };
      const res = await contractsAPI.answerQuestions(session.session_id, currentAnswers);
      setAnswers(merged);

      if (res.complete) {
        onComplete(session.session_id, merged);
      } else {
        setCurrentAnswers({});
        // Update session questions via parent (res has new questions)
        session.questions = res.questions || [];
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d\'envoyer les réponses.');
    } finally {
      setLoading(false);
    }
  };

  const contractLabel = contractType?.labels?.[lang] || contractType?.labels?.fr || '';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Context card */}
        <View style={[q.contextCard, { borderLeftColor: contractType?.color || C.primary }]}>
          <View style={[q.contextIcon, { backgroundColor: contractType?.accent || C.blue50 }]}>
            <FontAwesome5 name={contractType?.icon || 'file-contract'} size={16} color={contractType?.color || C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={q.contextTitle}>{contractLabel}</Text>
            <Text style={q.contextSub}>{lang === 'ar' ? 'يرجى الإجابة على الأسئلة التالية' : lang === 'fr' ? 'Répondez aux questions suivantes' : 'Please answer the following questions'}</Text>
          </View>
        </View>

        {/* Already answered */}
        {Object.keys(answers).length > 0 && (
          <View style={q.answeredSection}>
            <Text style={q.answeredTitle}>
              {lang === 'ar' ? 'تم جمعها' : lang === 'fr' ? 'Déjà collecté' : 'Already collected'}
            </Text>
            {Object.entries(answers).map(([key, val]) => (
              <View key={key} style={q.answeredRow}>
                <FontAwesome5 name="check-circle" size={12} color={C.emerald600} />
                <Text style={q.answeredTxt} numberOfLines={1}>{val}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Current questions */}
        {questions.map((question, i) => (
          <View key={i} style={q.questionCard}>
            <View style={q.questionHeader}>
              <View style={q.questionNum}>
                <Text style={q.questionNumTxt}>{i + 1}</Text>
              </View>
              <Text style={[q.questionTxt, lang === 'ar' && q.rtl]}>{question}</Text>
            </View>
            <TextInput
              style={[q.answerInput, lang === 'ar' && q.rtlInput]}
              value={currentAnswers[question] || ''}
              onChangeText={v => setCurrentAnswers(prev => ({ ...prev, [question]: v }))}
              placeholder={lang === 'ar' ? 'أدخل إجابتك هنا...' : lang === 'fr' ? 'Votre réponse...' : 'Your answer...'}
              placeholderTextColor={C.g300}
              multiline
              textAlignVertical="top"
              textAlign={lang === 'ar' ? 'right' : 'left'}
            />
          </View>
        ))}

        {questions.length === 0 && (
          <View style={q.emptyState}>
            <ActivityIndicator color={C.primary} />
            <Text style={q.emptyTxt}>{lang === 'ar' ? 'جاري التحميل...' : 'Chargement...'}</Text>
          </View>
        )}

        {/* Next button */}
        {questions.length > 0 && (
          <TouchableOpacity
            style={[q.nextBtn, { backgroundColor: contractType?.color || C.primary }, !allAnswered && q.nextBtnOff]}
            onPress={handleNext}
            disabled={!allAnswered || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.white} size="small" />
              : <>
                  <Text style={q.nextTxt}>{lang === 'ar' ? 'التالي' : lang === 'fr' ? 'Suivant' : 'Next'}</Text>
                  <FontAwesome5 name="arrow-right" size={13} color={C.white} />
                </>
            }
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const q = StyleSheet.create({
  contextCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, padding: 14, borderLeftWidth: 4, gap: 12, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  contextIcon:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contextTitle:   { fontSize: 15, fontWeight: '800', color: C.dark },
  contextSub:     { fontSize: 12, color: C.g400, marginTop: 2 },
  answeredSection:{ backgroundColor: C.emerald50, borderRadius: 12, padding: 12, marginBottom: 16, gap: 6 },
  answeredTitle:  { fontSize: 11, fontWeight: '700', color: C.emerald600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  answeredRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  answeredTxt:    { flex: 1, fontSize: 12, color: C.g600 },
  questionCard:   { backgroundColor: C.white, borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, gap: 10 },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  questionNum:    { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  questionNumTxt: { fontSize: 12, fontWeight: '800', color: C.white },
  questionTxt:    { flex: 1, fontSize: 14, color: C.dark, lineHeight: 21, fontWeight: '500' },
  answerInput:    { borderWidth: 1, borderColor: C.g200, borderRadius: 12, padding: 12, fontSize: 14, color: C.dark, backgroundColor: C.g50, minHeight: 70 },
  rtl:            { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput:       { textAlign: 'right', writingDirection: 'rtl' },
  nextBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  nextBtnOff:     { opacity: 0.4 },
  nextTxt:        { fontSize: 15, fontWeight: '700', color: C.white },
  emptyState:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt:       { fontSize: 14, color: C.g400 },
});

// ─── Step 3: Generating ───────────────────────────────────────────────────────
const GeneratingStep = ({ lang, contractType }) => (
  <View style={gen.container}>
    <View style={[gen.iconWrap, { backgroundColor: contractType?.bg || C.blue50 }]}>
      <FontAwesome5 name="robot" size={36} color={contractType?.color || C.primary} />
    </View>
    <Text style={gen.title}>
      {lang === 'ar' ? 'جاري صياغة العقد...' : lang === 'fr' ? 'Rédaction en cours...' : 'Generating contract...'}
    </Text>
    <Text style={gen.sub}>
      {lang === 'ar' ? 'الذكاء الاصطناعي يحلل القوانين ويصيغ عقدك' : lang === 'fr' ? "L'IA analyse les lois et rédige votre contrat" : 'AI is analyzing laws and drafting your contract'}
    </Text>
    <ActivityIndicator color={contractType?.color || C.primary} size="large" style={{ marginTop: 20 }} />
    <View style={gen.steps}>
      {(lang === 'ar'
        ? ['استرداد النصوص القانونية...', 'تطبيق القانون المحلي...', 'صياغة البنود...']
        : lang === 'fr'
        ? ['Récupération des textes légaux...', 'Application du droit local...', 'Rédaction des clauses...']
        : ['Retrieving legal texts...', 'Applying local law...', 'Drafting clauses...']
      ).map((step, i) => (
        <View key={i} style={gen.stepRow}>
          <FontAwesome5 name="check" size={10} color={contractType?.color || C.primary} />
          <Text style={gen.stepTxt}>{step}</Text>
        </View>
      ))}
    </View>
  </View>
);

const gen = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap:  { width: 90, height: 90, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title:     { fontSize: 20, fontWeight: '800', color: C.dark, textAlign: 'center', marginBottom: 8 },
  sub:       { fontSize: 14, color: C.g500, textAlign: 'center', lineHeight: 20 },
  steps:     { marginTop: 24, gap: 8, alignSelf: 'stretch' },
  stepRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 10, padding: 10 },
  stepTxt:   { fontSize: 13, color: C.g600 },
});

// ─── Step 4: Preview ──────────────────────────────────────────────────────────
const PreviewStep = ({ sessionId, contractText, contractType, lang, onExportPdf }) => {
  const [tab, setTab] = useState('contract'); // 'contract' | 'risks'
  const [risks, setRisks] = useState('');
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const fetchRisks = async () => {
    if (risks) { setTab('risks'); return; }
    setLoadingRisks(true);
    setTab('risks');
    try {
      const res = await contractsAPI.analyzeRisks(sessionId);
      setRisks(res.risk_analysis || '');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Analyse des risques impossible.');
      setTab('contract');
    } finally {
      setLoadingRisks(false);
    }
  };

  const handleExport = async () => {
    setLoadingPdf(true);
    try {
      const res = await contractsAPI.exportPdf(sessionId);
      const url = res.pdf_url;
      if (url) {
        await Linking.openURL(url);
        onExportPdf?.(url);
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Export PDF impossible.');
    } finally {
      setLoadingPdf(false);
    }
  };

  const copyContract = () => {
    Clipboard.setString(contractText || '');
    Alert.alert(lang === 'ar' ? 'تم النسخ' : 'Copié', lang === 'ar' ? 'تم نسخ العقد' : 'Contrat copié dans le presse-papier');
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Tab bar */}
      <View style={pv.tabBar}>
        <TouchableOpacity style={[pv.tab, tab === 'contract' && pv.tabActive]} onPress={() => setTab('contract')}>
          <FontAwesome5 name="file-alt" size={13} color={tab === 'contract' ? C.primary : C.g400} />
          <Text style={[pv.tabTxt, tab === 'contract' && pv.tabTxtActive]}>
            {lang === 'ar' ? 'العقد' : lang === 'fr' ? 'Contrat' : 'Contract'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[pv.tab, tab === 'risks' && pv.tabActive]} onPress={fetchRisks}>
          <FontAwesome5 name="exclamation-triangle" size={13} color={tab === 'risks' ? C.amber600 : C.g400} />
          <Text style={[pv.tabTxt, tab === 'risks' && { color: C.amber600, fontWeight: '700' }]}>
            {lang === 'ar' ? 'تحليل المخاطر' : lang === 'fr' ? 'Risques' : 'Risks'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {tab === 'contract' ? (
          <View style={pv.contractCard}>
            <MarkdownText text={contractText} style={[pv.contractTxt, lang === 'ar' && pv.rtl]} />
          </View>
        ) : loadingRisks ? (
          <View style={gen.container}>
            <ActivityIndicator color={C.amber600} size="large" />
            <Text style={[gen.sub, { marginTop: 12 }]}>
              {lang === 'ar' ? 'جاري تحليل المخاطر...' : lang === 'fr' ? 'Analyse des risques en cours...' : 'Analyzing risks...'}
            </Text>
          </View>
        ) : (
          <View style={pv.riskCard}>
            <MarkdownText text={risks} style={[pv.contractTxt, lang === 'ar' && pv.rtl]} />
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={pv.actions}>
        <TouchableOpacity style={pv.copyBtn} onPress={copyContract}>
          <FontAwesome5 name="copy" size={14} color={C.g600} />
        </TouchableOpacity>
        <TouchableOpacity style={[pv.pdfBtn, { backgroundColor: contractType?.color || C.primary }]} onPress={handleExport} disabled={loadingPdf}>
          {loadingPdf
            ? <ActivityIndicator color={C.white} size="small" />
            : <>
                <FontAwesome5 name="file-pdf" size={14} color={C.white} />
                <Text style={pv.pdfTxt}>{lang === 'ar' ? 'تصدير PDF' : lang === 'fr' ? 'Exporter PDF' : 'Export PDF'}</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
};

const pv = StyleSheet.create({
  tabBar:      { flexDirection: 'row', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g100 },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13 },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabTxt:      { fontSize: 13, color: C.g400, fontWeight: '600' },
  tabTxtActive:{ color: C.primary, fontWeight: '700' },
  contractCard:{ backgroundColor: C.white, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  riskCard:    { backgroundColor: C.white, borderRadius: 14, padding: 16, borderLeftWidth: 3, borderLeftColor: C.amber600 },
  contractTxt: { fontSize: 13.5, color: C.dark, lineHeight: 22 },
  rtl:         { textAlign: 'right', writingDirection: 'rtl' },
  actions:     { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.g100 },
  copyBtn:     { width: 46, height: 46, borderRadius: 12, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  pdfBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  pdfTxt:      { fontSize: 15, fontWeight: '700', color: C.white },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ContractDraftScreen({ navigation }) {
  // step: 'config' | 'questions' | 'generating' | 'preview'
  const [step, setStep] = useState('config');
  const [session, setSession] = useState(null);
  const [contractType, setContractType] = useState(null);
  const [lang, setLang] = useState('en');
  const [contractText, setContractText] = useState('');

  const stepLabels = {
    config:     { ar: 'إعداد العقد',    fr: 'Configuration',    en: 'Setup' },
    questions:  { ar: 'الأسئلة',         fr: 'Questions',        en: 'Questions' },
    generating: { ar: 'توليد العقد',    fr: 'Génération',       en: 'Generating' },
    preview:    { ar: 'معاينة العقد',   fr: 'Aperçu',           en: 'Preview' },
  };

  const stepIndex = ['config', 'questions', 'generating', 'preview'].indexOf(step);

  const handleStart = useCallback((sessionData, type, selectedLang) => {
    setSession(sessionData);
    setContractType(type);
    setLang(selectedLang);
    setStep('questions');
  }, []);

  const handleQuestionsComplete = useCallback(async (sessionId, allAnswers) => {
    setStep('generating');
    try {
      const res = await contractsAPI.generate(sessionId);
      setContractText(res.contract_text || '');
      setStep('preview');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Génération impossible.');
      setStep('questions');
    }
  }, []);

  const handleBack = useCallback(() => {
    if (step === 'questions') setStep('config');
    else if (step === 'preview') setStep('questions');
    else navigation?.goBack?.();
  }, [step, navigation]);

  const headerTitle = stepLabels[step]?.[lang] || stepLabels[step]?.fr || '';

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <FontAwesome5 name="arrow-left" size={15} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerIconWrap}>
          <FontAwesome5 name="file-contract" size={15} color={C.white} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.headerTitle}>{lang === 'ar' ? 'صياغة العقود' : lang === 'fr' ? 'Rédaction de Contrat' : 'Contract Drafting'}</Text>
          <Text style={s.headerSub}>{headerTitle}</Text>
        </View>

        {/* Step indicator */}
        <View style={s.stepRow}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[s.stepDot, i <= stepIndex && s.stepDotActive, i === stepIndex && s.stepDotCurrent]} />
          ))}
        </View>
      </View>

      {/* Body */}
      <View style={{ flex: 1, backgroundColor: C.g50 }}>
        {step === 'config' && (
          <ConfigStep onStart={handleStart} lang={lang} onLangChange={setLang} />
        )}
        {step === 'questions' && session && (
          <QuestionsStep
            session={session}
            contractType={contractType}
            lang={lang}
            onComplete={handleQuestionsComplete}
            onBack={() => setStep('config')}
          />
        )}
        {step === 'generating' && (
          <GeneratingStep lang={lang} contractType={contractType} />
        )}
        {step === 'preview' && (
          <PreviewStep
            sessionId={session?.session_id}
            contractText={contractText}
            contractType={contractType}
            lang={lang}
            onExportPdf={() => {}}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.primary },
  header:        { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8 },
  backBtn:       { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerIconWrap:{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 15, fontWeight: '800', color: C.white },
  headerSub:     { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  stepRow:       { flexDirection: 'row', gap: 4, alignItems: 'center' },
  stepDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  stepDotActive: { backgroundColor: 'rgba(255,255,255,0.7)' },
  stepDotCurrent:{ width: 14, height: 6, borderRadius: 3, backgroundColor: C.white },

  // Config step
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: C.g500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  langRow:       { flexDirection: 'row', gap: 8 },
  langBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.g200 },
  langBtnActive: { borderColor: C.primary, backgroundColor: C.blue50 },
  langFlag:      { fontSize: 16 },
  langTxt:       { fontSize: 13, fontWeight: '600', color: C.g600 },
  langTxtActive: { color: C.primary, fontWeight: '700' },
  countryBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: C.g200 },
  countryTxt:    { flex: 1, fontSize: 14, color: C.dark, fontWeight: '600' },
  typeRow:       { flexDirection: 'row', gap: 12, marginBottom: 12 },
  typeCard:      { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, minHeight: 110, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  typeCardSelected: { shadowOpacity: 0.15, elevation: 5 },
  typeIconWrap:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeLabel:     { fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  startBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.primary, paddingVertical: 15, borderRadius: 16, marginTop: 8, marginBottom: 12 },
  startBtnOff:   { opacity: 0.4 },
  startTxt:      { fontSize: 16, fontWeight: '800', color: C.white },
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.amber50, borderRadius: 12, padding: 12 },
  infoTxt:       { flex: 1, fontSize: 12, color: C.g500, lineHeight: 17 },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  countrySheet:  { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', paddingBottom: 30 },
  sheetHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: C.g200, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  sheetTitle:    { fontSize: 16, fontWeight: '800', color: C.dark, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  countryItem:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g100 },
  countryItemActive: { backgroundColor: C.blue50 },
  countryItemTxt:    { fontSize: 15, color: C.dark },
  countryItemTxtActive: { color: C.primary, fontWeight: '700' },
});
