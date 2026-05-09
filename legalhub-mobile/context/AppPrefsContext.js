import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  theme:        'lh_pref_theme',
  language:     'lh_pref_lang',
  timeFormat:   'lh_pref_time',
  calendarView: 'lh_pref_cal',
};

// ─── THEMES ───────────────────────────────────────────────────────────────────
const LIGHT = {
  isDark: false,
  bg:         '#F9FAFB',
  card:       '#FFFFFF',
  header:     '#1E40AF',
  headerText: '#FFFFFF',
  text:       '#1E293B',
  subText:    '#6B7280',
  border:     '#E5E7EB',
  inputBg:    '#FFFFFF',
  sectionBg:  '#F3F4F6',
};

const DARK = {
  isDark: true,
  bg:         '#0F172A',
  card:       '#1E293B',
  header:     '#0F172A',
  headerText: '#F1F5F9',
  text:       '#F1F5F9',
  subText:    '#94A3B8',
  border:     '#334155',
  inputBg:    '#1E293B',
  sectionBg:  '#1E293B',
};

// ─── LANGUAGES ────────────────────────────────────────────────────────────────
const STRINGS = {
  English: {
    profileSettings:    'Profile Settings',
    personalInfo:       'Personal Information',
    fullName:           'Full Name',
    email:              'Email Address',
    phone:              'Phone Number',
    role:               'Role',
    firm:               'Firm',
    edit:               'Edit',
    save:               'Save',
    cancel:             'Cancel',
    security:           'Security & Privacy',
    changePassword:     'Change Password',
    twoFA:              'Two-Factor Authentication',
    biometric:          'Biometric Login',
    loginHistory:       'Login History',
    notifications:      'Notifications',
    appPreferences:     'App Preferences',
    theme:              'Theme',
    language:           'Language',
    timeFormat:         'Time Format',
    calendarView:       'Calendar View',
    logout:             'Logout',
    officeCode:         'Office Code',
    share:              'Share',
  },
  French: {
    profileSettings:    'Paramètres du profil',
    personalInfo:       'Informations personnelles',
    fullName:           'Nom complet',
    email:              'Adresse e-mail',
    phone:              'Numéro de téléphone',
    role:               'Rôle',
    firm:               'Cabinet',
    edit:               'Modifier',
    save:               'Enregistrer',
    cancel:             'Annuler',
    security:           'Sécurité & Confidentialité',
    changePassword:     'Changer le mot de passe',
    twoFA:              'Authentification à deux facteurs',
    biometric:          'Connexion biométrique',
    loginHistory:       'Historique des connexions',
    notifications:      'Notifications',
    appPreferences:     'Préférences de l\'application',
    theme:              'Thème',
    language:           'Langue',
    timeFormat:         'Format de l\'heure',
    calendarView:       'Vue du calendrier',
    logout:             'Déconnexion',
    officeCode:         'Code du cabinet',
    share:              'Partager',
  },
  Arabic: {
    profileSettings:    'إعدادات الملف الشخصي',
    personalInfo:       'المعلومات الشخصية',
    fullName:           'الاسم الكامل',
    email:              'البريد الإلكتروني',
    phone:              'رقم الهاتف',
    role:               'الدور',
    firm:               'المكتب',
    edit:               'تعديل',
    save:               'حفظ',
    cancel:             'إلغاء',
    security:           'الأمان والخصوصية',
    changePassword:     'تغيير كلمة المرور',
    twoFA:              'المصادقة الثنائية',
    biometric:          'تسجيل الدخول البيومتري',
    loginHistory:       'سجل تسجيل الدخول',
    notifications:      'الإشعارات',
    appPreferences:     'تفضيلات التطبيق',
    theme:              'المظهر',
    language:           'اللغة',
    timeFormat:         'تنسيق الوقت',
    calendarView:       'عرض التقويم',
    logout:             'تسجيل الخروج',
    officeCode:         'رمز المكتب',
    share:              'مشاركة',
  },
};

export const LANGUAGES      = ['English', 'French', 'Arabic'];
export const THEME_OPTIONS  = ['Light Mode', 'Dark Mode', 'Auto (System)'];
export const TIME_OPTIONS   = ['12-hour (AM/PM)', '24-hour'];
export const CAL_OPTIONS    = ['Day View', 'Week View', 'Month View'];

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
const AppPrefsContext = createContext(null);

export const AppPrefsProvider = ({ children }) => {
  const [themeIdx, setThemeIdx]   = useState(0);   // 0=Light 1=Dark 2=Auto
  const [langIdx, setLangIdx]     = useState(0);   // 0=English 1=French 2=Arabic
  const [timeIdx, setTimeIdx]     = useState(0);   // 0=12h 1=24h
  const [calIdx, setCalIdx]       = useState(1);   // 0=Day 1=Week 2=Month

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEYS.theme),
      AsyncStorage.getItem(KEYS.language),
      AsyncStorage.getItem(KEYS.timeFormat),
      AsyncStorage.getItem(KEYS.calendarView),
    ]).then(([t, l, tf, cv]) => {
      if (t  !== null) setThemeIdx(Number(t));
      if (l  !== null) setLangIdx(Number(l));
      if (tf !== null) setTimeIdx(Number(tf));
      if (cv !== null) setCalIdx(Number(cv));
    });
  }, []);

  const setAndSaveTheme = (i)   => { setThemeIdx(i);  AsyncStorage.setItem(KEYS.theme,        String(i)); };
  const setAndSaveLang  = (i)   => { setLangIdx(i);   AsyncStorage.setItem(KEYS.language,     String(i)); };
  const setAndSaveTime  = (i)   => { setTimeIdx(i);   AsyncStorage.setItem(KEYS.timeFormat,   String(i)); };
  const setAndSaveCal   = (i)   => { setCalIdx(i);    AsyncStorage.setItem(KEYS.calendarView, String(i)); };

  const theme   = themeIdx === 1 ? DARK : LIGHT;
  const strings = STRINGS[LANGUAGES[langIdx]] || STRINGS.English;
  const is24h   = timeIdx === 1;
  const calView = CAL_OPTIONS[calIdx];

  return (
    <AppPrefsContext.Provider value={{
      theme, strings, is24h, calView,
      themeIdx, langIdx, timeIdx, calIdx,
      setThemeIdx: setAndSaveTheme,
      setLangIdx:  setAndSaveLang,
      setTimeIdx:  setAndSaveTime,
      setCalIdx:   setAndSaveCal,
    }}>
      {children}
    </AppPrefsContext.Provider>
  );
};

export const useAppPrefs = () => {
  const ctx = useContext(AppPrefsContext);
  if (!ctx) throw new Error('useAppPrefs must be used inside AppPrefsProvider');
  return ctx;
};

// Utility: format a date/time string based on user's time format preference
export const formatTime = (dateStr, is24h) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !is24h });
};
