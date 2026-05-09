import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

// ─── IMPORTS DES ÉCRANS ──────────────────────────────────────────────────────
import AddCaseScreen    from './Cases/AddCaseScreen';
import AddClientScreen  from './Clients/AddClientScreen';
import AddNoteScreen    from './TasksNotes/AddNoteScreen';
import ScheduleScreen   from './Schedule/ScheduleScreen';
import InvoiceScreen    from './Invoices/InvoiceScreen';
import AddTaskScreen    from './TasksNotes/AddTaskScreen';
import VoiceNoteScreen  from './TasksNotes/VoiceNoteScreen';

// ─── COULEURS ────────────────────────────────────────────────────────────────
const C = {
  primary:   '#1E40AF',
  secondary: '#3B82F6',
  dark:      '#1E293B',
  white:     '#FFFFFF',
  gray50:    '#F9FAFB',
  gray100:   '#F3F4F6',
  gray200:   '#E5E7EB',
  gray400:   '#9CA3AF',
  gray500:   '#6B7280',
  gray600:   '#4B5563',
  blue50:    '#EFF6FF',
};

// ─── ACTIONS ─────────────────────────────────────────────────────────────────
// Chaque objet déclare :
//   screen    → clé utilisée dans le switch de navigation
//   icon      → nom FontAwesome5
//   label     → texte affiché
//   gradFrom  → couleur de début du dégradé
//   gradTo    → couleur de fin du dégradé
//   desc      → sous-titre descriptif
const ACTIONS = [
  {
    screen:   'AddCase',
    icon:     'briefcase',
    label:    'Add Case',
    gradFrom: '#1E40AF',
    gradTo:   '#3B82F6',
    desc:     'Create a new case file',
  },
  {
    screen:   'AddClient',
    icon:     'user-plus',
    label:    'Add Client',
    gradFrom: '#7C3AED',
    gradTo:   '#6D28D9',
    desc:     'Register a new client',
  },
  {
    screen:   'AddTask',
    icon:     'tasks',
    label:    'Add Task',
    gradFrom: '#D97706',
    gradTo:   '#B45309',
    desc:     'Create a task or to-do',
  },
  {
    screen:   'AddNote',
    icon:     'sticky-note',
    label:    'Add Note',
    gradFrom: '#059669',
    gradTo:   '#047857',
    desc:     'Write a case note',
  },
  {
    screen:   'Schedule',
    icon:     'calendar-plus',
    label:    'Add Schedule',
    gradFrom: '#DB2777',
    gradTo:   '#BE185D',
    desc:     'Schedule hearing or meeting',
  },
  {
    screen:   'Invoice',
    icon:     'file-invoice-dollar',
    label:    'Add Invoice',
    gradFrom: '#0F766E',
    gradTo:   '#0D9488',
    desc:     'Generate client invoice',
  },
  {
    screen:   'VoiceNote',
    icon:     'microphone',
    label:    'Voice Note',
    gradFrom: '#DC2626',
    gradTo:   '#B91C1C',
    desc:     'Record an audio note',
  },
];

// ─── COMPOSANT CARTE D'ACTION ────────────────────────────────────────────────
const ActionCard = ({ item, onPress }) => (
  <TouchableOpacity
    style={styles.card}
    activeOpacity={0.85}
    onPress={() => onPress(item.screen)}
  >
    {/* Icône avec dégradé simulé via deux vues superposées */}
    <View style={[styles.iconCircle, { backgroundColor: item.gradFrom }]}>
      {/* Overlay dégradé léger */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: 18,
            backgroundColor: item.gradTo,
            opacity: 0.45,
          },
        ]}
      />
      <FontAwesome5 name={item.icon} size={24} color={C.white} />
    </View>

    <Text style={styles.cardLabel}>{item.label}</Text>
    <Text style={styles.cardDesc}>{item.desc}</Text>

    {/* Flèche de navigation */}
    <View style={[styles.arrowWrap, { backgroundColor: item.gradFrom + '18' }]}>
      <FontAwesome5 name="chevron-right" size={11} color={item.gradFrom} />
    </View>
  </TouchableOpacity>
);

// ─── ÉCRAN PRINCIPAL ─────────────────────────────────────────────────────────
export default function QuickAddScreen({ navigation }) {
  // currentScreen gère la navigation interne sans React Navigation
  const [currentScreen, setCurrentScreen] = useState(null);

  const navigateTo = (screen) => setCurrentScreen(screen);
  const goBack     = () => setCurrentScreen(null);

  const screenProps = { navigation: { goBack } };

  // ── Router : affiche la bonne page selon currentScreen ──
  if (currentScreen === 'AddCase')   return <AddCaseScreen   {...screenProps} />;
  if (currentScreen === 'AddClient') return <AddClientScreen {...screenProps} />;
  if (currentScreen === 'AddNote')   return <AddNoteScreen   {...screenProps} />;
  if (currentScreen === 'Schedule')  return <ScheduleScreen  {...screenProps} />;
  if (currentScreen === 'Invoice')   return <InvoiceScreen   {...screenProps} />;
  if (currentScreen === 'AddTask')   return <AddTaskScreen   {...screenProps} />;
  if (currentScreen === 'VoiceNote') return <VoiceNoteScreen {...screenProps} />;

  // ── Vue principale : sélecteur de formulaire ──
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {/* Bouton retour (vers le parent si React Navigation est utilisé) */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation?.goBack?.()}
          >
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Quick Add</Text>

          {/* Placeholder à droite pour centrer le titre */}
          <View style={styles.backBtn} />
        </View>
      </View>

      {/* ── CONTENU ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Titre de section */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Select Form Type</Text>
          <Text style={styles.sectionCount}>{ACTIONS.length} options</Text>
        </View>

        {/* Grille 2 colonnes */}
        <View style={styles.grid}>
          {ACTIONS.map((action) => (
            <ActionCard
              key={action.screen}
              item={action}
              onPress={navigateTo}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 20 * 2 - 12) / 2; // 2 colonnes, padding 20, gap 12

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.primary,
  },

  // ── Header ──
  header: {
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
    backgroundColor: C.gray50,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // ── Section header ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.dark,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gray400,
    backgroundColor: C.gray100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  // ── Grille ──
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },

  // ── Carte ──
  card: {
    width: CARD_WIDTH,
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 18,
    // Ombre iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    // Ombre Android
    elevation: 4,
    borderWidth: 1,
    borderColor: C.gray100,
    // Position relative pour la flèche absolue
    position: 'relative',
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    // Ombre colorée légère
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden', // Pour l'overlay dégradé
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: C.dark,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    color: C.gray500,
    fontWeight: '400',
    lineHeight: 16,
    marginBottom: 12,
  },
  arrowWrap: {
    alignSelf: 'flex-start',
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Bannière info ──
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.blue50,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
    marginBottom: 3,
  },
  infoBannerText: {
    fontSize: 12,
    color: C.gray600,
    lineHeight: 18,
  },
});
