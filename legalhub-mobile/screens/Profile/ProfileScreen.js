import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet, SafeAreaView, StatusBar,
  Switch, TextInput, Alert, Share,
  Modal, ActivityIndicator,
} from 'react-native';
import { FontAwesome5, FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../supabase/supabase';
import { useAuth } from '../../context/AuthContext';
import { useAppPrefs } from '../../context/AppPrefsContext';
import { authAPI, firmAPI, dashboardAPI, clientsAPI, calendarAPI } from '../../services/api';

WebBrowser.maybeCompleteAuthSession();

const BIOMETRIC_KEY = 'lh_biometric_enabled';

// ─── COULEURS ──────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563', gray700: '#374151',
  red50: '#FEF2F2', red100: '#FEE2E2', red200: '#FECACA', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  pink50: '#FDF2F8', pink100: '#FCE7F3', pink600: '#DB2777',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

const Icon = ({ lib = 'FA5', name, size = 16, color = C.dark }) => {
  if (lib === 'FA5') return <FontAwesome5 name={name} size={size} color={color} />;
  if (lib === 'FA')  return <FontAwesome  name={name} size={size} color={color} />;
  if (lib === 'ION') return <Ionicons     name={name} size={size} color={color} />;
  return null;
};

// ─── DONNÉES ──────────────────────────────────────────────────────────────

const SECURITY_ITEMS = [
  { iconLib: 'FA5', iconName: 'lock',        iconColor: C.red600,   iconBg: C.red100,   title: 'Change Password',          sub: 'Update your account password',       type: 'chevron' },
  { iconLib: 'FA5', iconName: 'shield-alt',  iconColor: C.green600, iconBg: C.green100, title: 'Two-Factor Authentication', sub: 'Authenticator app (TOTP)',           type: 'toggle-2fa' },
  { iconLib: 'FA5', iconName: 'fingerprint', iconColor: C.primary,  iconBg: C.blue100,  title: 'Biometric Login',          sub: 'Use fingerprint or Face ID',         type: 'toggle-bio' },
  { iconLib: 'FA5', iconName: 'history',     iconColor: C.amber600, iconBg: C.amber100, title: 'Login History',            sub: 'View recent login activity',         type: 'chevron' },
];

// Valeurs par défaut utilisées si la table n'existe pas encore
const NOTIF_DEFAULTS = {
  hearing_reminders:     true,
  hearing_reminder_offset: '1 hour before',
  task_reminders:        true,
  document_updates:      true,
  client_messages:       true,
  payment_notifications: true,
  email_notifications:   false,
  whatsapp_updates:      true,
};

// pref key par item de notification
const NOTIF_PREF_KEY = {
  'Hearing Reminders':    'hearing_reminders',
  'Task Reminders':       'task_reminders',
  'Document Updates':     'document_updates',
  'Client Messages':      'client_messages',
  'Payment Notifications':'payment_notifications',
  'Email Notifications':  'email_notifications',
  'WhatsApp Updates':     'whatsapp_updates',
};

const NOTIF_ITEMS = [
  { iconLib: 'FA5', iconName: 'gavel',       iconColor: C.amber600,  iconBg: C.amber100,  title: 'Hearing Reminders',   sub: 'Get notified before hearings',  toggleOn: true,  toggleColor: C.primary, radioGroup: 'hearing', radioOptions: ['1 hour before', '2 hours before', '1 day before'] },
  { iconLib: 'FA5', iconName: 'tasks',       iconColor: C.primary,   iconBg: C.blue100,   title: 'Task Reminders',      sub: 'Deadline notifications',        toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'file-alt',    iconColor: C.green600,  iconBg: C.green100,  title: 'Document Updates',    sub: 'New document notifications',    toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'comment',     iconColor: C.purple600, iconBg: C.purple100, title: 'Client Messages',     sub: 'New message alerts',            toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'dollar-sign', iconColor: C.indigo600, iconBg: C.indigo100, title: 'Payment Notifications',sub: 'Invoice and payment updates',  toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'envelope',    iconColor: C.pink600,   iconBg: C.pink100,   title: 'Email Notifications', sub: 'Receive email summaries',       toggleOn: false, toggleColor: C.primary },
  { iconLib: 'FA',  iconName: 'whatsapp',    iconColor: C.teal600,   iconBg: C.teal100,   title: 'WhatsApp Updates',    sub: 'Get updates via WhatsApp',      toggleOn: true,  toggleColor: C.primary },
];

const SOCIAL_LINKS = [
  { lib: 'FA', name: 'twitter',   bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'linkedin',  bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'facebook',  bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'instagram', bg: C.pink100,  color: C.pink600  },
];

// ─── COMPOSANTS RÉUTILISABLES ──────────────────────────────────────────────
const SectionHeader = ({ title, action, onAction, titleColor }) => (
  <View style={s.sectionHeader}>
    <Text style={[s.sectionTitle, titleColor && { color: titleColor }]}>{title}</Text>
    {action && <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{action}</Text></TouchableOpacity>}
  </View>
);


const RadioGroup = ({ options, value, onChange }) => (
  <View style={{ paddingLeft: 52, marginTop: 6 }}>
    {options.map((opt, i) => (
      <TouchableOpacity key={i} style={[s.row, { marginBottom: 8 }]} onPress={() => onChange(opt)}>
        <View style={[s.radioOuter, value === opt && { borderColor: C.primary }]}>
          {value === opt && <View style={s.radioInner} />}
        </View>
        <Text style={[s.sm, { marginLeft: 8 }]}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const ChevronRow = ({ item }) => (
  <View style={s.card}>
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <View style={s.row}>
        <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
          <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
        </View>
        <View style={{ marginLeft: 12 }}>
          <Text style={s.smBold}>{item.title}</Text>
          <Text style={s.xs}>{item.sub}</Text>
        </View>
      </View>
      <Icon lib="FA5" name="chevron-right" size={13} color={C.gray400} />
    </View>
  </View>
);

// ─── ÉCRAN ─────────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const { user, signOut, updateUser } = useAuth();
  const { theme: T, strings: L } = useAppPrefs();
  const [profile, setProfile]             = useState(null);
  const [officeCode, setOfficeCode]       = useState(null);
  const [stats, setStats]                 = useState({ active_cases: 0, total_clients: 0 });
  // Edit personal info
  const [editing, setEditing]             = useState(false);
  const [editName, setEditName]           = useState('');
  const [editPhone, setEditPhone]         = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  // Change password modal
  const [pwdModal, setPwdModal]           = useState(false);
  const [currentPwd, setCurrentPwd]       = useState('');
  const [newPwd, setNewPwd]               = useState('');
  const [confirmPwd, setConfirmPwd]       = useState('');
  const [savingPwd, setSavingPwd]         = useState(false);
  // 2FA modal
  const [twoFAModal, setTwoFAModal]       = useState(false);
  const [twoFAData, setTwoFAData]         = useState(null);   // { secret, qr_code_url }
  const [twoFACode, setTwoFACode]         = useState('');
  const [twoFALoading, setTwoFALoading]   = useState(false);
  // Biometric
  const [biometricEnabled, setBiometricEnabled]   = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  // Login history modal
  const [historyModal, setHistoryModal]   = useState(false);
  const [loginHistory, setLoginHistory]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Notification preferences
  const [notifPrefs, setNotifPrefs]       = useState(null);
  const [savingNotif, setSavingNotif]     = useState(false);
  const scrollRef   = useRef(null);
  const notifSectionY = useRef(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Calendar integrations
  const [googleConnecting,  setGoogleConnecting]  = useState(false);
  const [googleSyncing,     setGoogleSyncing]     = useState(false);
  const [googleSyncResult,  setGoogleSyncResult]  = useState(null);
  const [googleConnected,   setGoogleConnected]   = useState(false);


  useEffect(() => {
    // Profile + office code
    authAPI.me().then(data => {
      setProfile(data);
      updateUser(data);
      setEditName(data.full_name || '');
      setEditPhone(data.phone || '');
      if (data.role === 'FIRM_ADMIN' || data.role === 'LAWYER') {
        firmAPI.getOfficeCode().then(res => setOfficeCode(res.office_code)).catch(() => {});
      }
    }).catch(() => {});

    // Stats
    Promise.all([dashboardAPI.stats(), clientsAPI.list()])
      .then(([s, clients]) => setStats({
        active_cases:  s.active_cases || 0,
        total_clients: Array.isArray(clients) ? clients.length : 0,
      })).catch(() => {});

    // Notification preferences
    authAPI.getNotifPreferences().then(setNotifPrefs).catch(() => setNotifPrefs(NOTIF_DEFAULTS));

    // Biometric support + saved preference
    LocalAuthentication.hasHardwareAsync().then(supported => {
      setBiometricSupported(supported);
      if (supported) {
        AsyncStorage.getItem(BIOMETRIC_KEY).then(val => setBiometricEnabled(val === 'true'));
      }
    });

  }, []);


  // ── 2FA ────────────────────────────────────────────────
  const handleToggle2FA = useCallback(async () => {
    if (twoFaEnabled) {
      Alert.alert('Disable 2FA', 'Are you sure you want to disable Two-Factor Authentication?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: async () => {
          // No disable endpoint yet — show info
          Alert.alert('Info', 'Contact support to disable 2FA.');
        }},
      ]);
      return;
    }
    setTwoFALoading(true);
    try {
      const data = await authAPI.setup2FA();
      setTwoFAData(data);
      setTwoFAModal(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start 2FA setup.');
    } finally {
      setTwoFALoading(false);
    }
  }, [twoFaEnabled]);

  const handleVerify2FA = useCallback(async () => {
    if (!twoFACode.trim()) return;
    setTwoFALoading(true);
    try {
      await authAPI.verify2FA(twoFACode);
      setProfile(prev => ({ ...prev, two_fa_enabled: true }));
      setTwoFAModal(false);
      setTwoFACode('');
      Alert.alert('Success', '2FA has been enabled on your account.');
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'The code you entered is incorrect.');
    } finally {
      setTwoFALoading(false);
    }
  }, [twoFACode]);

  // ── Biometric ──────────────────────────────────────────
  const handleToggleBiometric = useCallback(async (value) => {
    if (value) {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('Not configured', 'No fingerprint or Face ID is enrolled on this device.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm your identity' });
      if (!result.success) return;
    }
    await AsyncStorage.setItem(BIOMETRIC_KEY, String(value));
    setBiometricEnabled(value);
  }, []);

  // ── Login history ──────────────────────────────────────
  const handleOpenHistory = useCallback(async () => {
    setHistoryModal(true);
    setHistoryLoading(true);
    try {
      const data = await authAPI.loginHistory();
      setLoginHistory(data);
    } catch {
      setLoginHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Notification preferences ───────────────────────────
  const handleNotifToggle = useCallback(async (key, value) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    setSavingNotif(true);
    try {
      await authAPI.updateNotifPreferences({ [key]: value });
    } catch {
      setNotifPrefs(prev => ({ ...prev, [key]: !value })); // rollback
    } finally {
      setSavingNotif(false);
    }
  }, [notifPrefs]);

  const me       = profile || user || {};
  const fullName = me.full_name || 'Your Name';
  const email    = me.email     || '';
  const phone    = me.phone     || '';
  const avatarUrl = me.avatar_url || 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-2.jpg';
  const firmName = me.firm_name || 'Your Firm';
  const role     = me.role      || 'LAWYER';
  const twoFaEnabled = me.two_fa_enabled || false;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await authAPI.updateMe({ full_name: editName, phone: editPhone });
      setProfile(updated);
      updateUser(updated);
      setEditing(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPwd.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }
    setSavingPwd(true);
    try {
      await authAPI.changePassword({ current_password: currentPwd, new_password: newPwd });
      Alert.alert('Success', 'Password changed successfully.');
      setPwdModal(false);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to change password.');
    } finally {
      setSavingPwd(false);
    }
  };

  const handlePickAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName || 'avatar.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
    setUploadingAvatar(true);
    try {
      const data = await authAPI.uploadAvatar(formData);
      setProfile(prev => ({ ...prev, avatar_url: data.avatar_url }));
      updateUser({ ...me, avatar_url: data.avatar_url });
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not update profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [me, updateUser]);

  // ── Google Calendar — même pattern qu'AuthScreen (Supabase OAuth) ──────────
  const handleConnectGoogle = async () => {
    setGoogleConnecting(true);
    try {
      const redirectTo = Linking.createURL('oauth/google/callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes:              'https://www.googleapis.com/auth/calendar',
          redirectTo,
          skipBrowserRedirect: true,
          queryParams:         { access_type: 'offline', prompt: 'consent' },
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error('URL OAuth manquante');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return;

      // Supabase met les tokens dans le fragment (#) — même parsing qu'AuthScreen
      const raw = result.url.includes('#')
        ? result.url.split('#')[1]
        : result.url.split('?')[1] || '';
      const params = Object.fromEntries(
        raw.split('&').filter(Boolean).map(p => {
          const [k, ...v] = p.split('=');
          return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
        })
      );

      const providerToken = params.provider_token;
      if (!providerToken) throw new Error('Token Google Calendar absent. Vérifiez que le scope calendar est autorisé dans Supabase → Providers → Google.');

      await calendarAPI.saveGoogleToken({
        access_token:  providerToken,
        refresh_token: params.provider_refresh_token || null,
        expires_in:    parseInt(params.expires_in) || 3600,
      });

      setGoogleConnected(true);
      Alert.alert('Connecté ✓', 'Google Calendar connecté ! Appuyez sur Sync Now pour synchroniser.');
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Erreur', err.message || 'Impossible de connecter Google Calendar.');
      }
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleSyncGoogle = async () => {
    setGoogleSyncing(true);
    setGoogleSyncResult(null);
    try {
      const result = await calendarAPI.syncGoogle({});
      setGoogleSyncResult(result);
      Alert.alert(
        'Google Calendar Synced ✅',
        `${result.synced} event${result.synced !== 1 ? 's' : ''} sent to Google Calendar` +
        (result.failed > 0 ? `\n⚠️ ${result.failed} event(s) failed` : '')
      );
    } catch (err) {
      Alert.alert(
        'Sync Failed',
        err.message?.includes('not connected')
          ? 'Connect Google Calendar first by tapping "Connect".'
          : err.message || 'Sync failed. Try reconnecting.'
      );
    } finally {
      setGoogleSyncing(false);
    }
  };


  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          try { await authAPI.logout(); } catch (_) {}
          await signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await authAPI.deleteAccount();
              await signOut();
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const personalFields = [
    { label: 'Full Name',     iconLib: 'FA5', iconName: 'user',     iconColor: C.primary,   iconBg: C.blue100,   value: editing ? editName  : fullName, editable: editing, onEdit: setEditName,  keyboardType: 'default'       },
    { label: 'Email Address', iconLib: 'FA5', iconName: 'envelope', iconColor: C.purple600, iconBg: C.purple100, value: email,                           editable: false,                          keyboardType: 'email-address' },
    { label: 'Phone Number',  iconLib: 'FA5', iconName: 'phone',    iconColor: C.green600,  iconBg: C.green100,  value: editing ? editPhone : phone,    editable: editing, onEdit: setEditPhone, keyboardType: 'phone-pad'     },
    { label: 'Role',          iconLib: 'FA5', iconName: 'id-card',  iconColor: C.amber600,  iconBg: C.amber100,  value: role,                            editable: false,                          keyboardType: 'default'       },
    { label: 'Firm',          iconLib: 'FA5', iconName: 'building', iconColor: C.red600,    iconBg: C.red100,    value: firmName,                        editable: false,                          keyboardType: 'default'       },
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <TouchableOpacity style={s.headerBtn}onPress={() => navigation?.goBack?.()}>
            <Icon lib="FA5" name="arrow-left" size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profile Settings</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => scrollRef.current?.scrollTo({ y: notifSectionY.current, animated: true })}>
            <Icon lib="ION" name="notifications-outline" size={22} color={C.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={{ paddingBottom: 90 }} showsVerticalScrollIndicator={false}>

        {/* ── PROFILE HEADER ── */}
        <View style={[s.section, { backgroundColor: C.blue50 }]}>
          <View style={s.profileCard}>
            {/* Avatar */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ position: 'relative', marginBottom: 12 }}>
                <Image
                  source={{ uri: avatarUrl }}
                  style={s.profileAvatar}
                />
                <TouchableOpacity style={s.cameraBtn} onPress={handlePickAvatar} disabled={uploadingAvatar}>
                  {uploadingAvatar
                    ? <ActivityIndicator size={14} color={C.white} />
                    : <Icon lib="FA5" name="camera" size={14} color={C.white} />}
                </TouchableOpacity>
              </View>
              <Text style={s.profileName}>{fullName}</Text>
              <Text style={s.profileRole}>{role}</Text>
              <View style={[s.row, { marginTop: 8, marginBottom: 6, gap: 8 }]}>
                <View style={[s.tag, { backgroundColor: C.green100 }]}>
                  <Text style={[s.tagText, { color: C.green600 }]}>Active</Text>
                </View>
              </View>
              <Text style={s.xs}>{firmName}</Text>
            </View>
            {/* Stats */}
            <View style={[s.row, { justifyContent: 'space-around', paddingTop: 16, borderTopWidth: 1, borderTopColor: C.gray100 }]}>
              {[
                { val: String(stats.active_cases),  label: 'Active Cases' },
                { val: String(stats.total_clients), label: 'Total Clients', bordered: true },
              ].map((st, i) => (
                <View key={i} style={[{ alignItems: 'center', flex: 1 }, st.bordered && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.gray100 }]}>
                  <Text style={s.profileStatVal}>{st.val}</Text>
                  <Text style={s.profileStatLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── PERSONAL INFORMATION ── */}
        <View style={s.section}>
          <SectionHeader
            title="Personal Information"
            action={editing ? null : 'Edit'}
            onAction={() => setEditing(true)}
          />
          {personalFields.map((f, i) => (
            <View key={i} style={s.card}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <View style={s.row}>
                <View style={[s.iconBtn40, { backgroundColor: f.iconBg }]}>
                  <Icon lib={f.iconLib} name={f.iconName} size={16} color={f.iconColor} />
                </View>
                <TextInput
                  style={[s.fieldInput, f.editable && { borderBottomWidth: 1, borderBottomColor: C.primary }]}
                  value={f.value}
                  onChangeText={f.editable ? f.onEdit : undefined}
                  editable={f.editable}
                  keyboardType={f.keyboardType}
                />
              </View>
            </View>
          ))}
          {editing && (
            <View style={[s.row, { gap: 10, marginTop: 8 }]}>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1, backgroundColor: C.gray100, justifyContent: 'center' }]}
                onPress={() => { setEditing(false); setEditName(fullName); setEditPhone(phone); }}
              >
                <Text style={[s.smBold, { color: C.gray600 }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1, backgroundColor: C.primary, justifyContent: 'center' }]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <Text style={[s.smBold, { color: C.white }]}>{savingProfile ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── OFFICE CODE (FIRM_ADMIN & LAWYER) ── */}
        {(role === 'FIRM_ADMIN' || role === 'LAWYER') && officeCode && (
          <View style={s.section}>
            <SectionHeader title="Office Code" />
            <View style={[s.card, { backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue100 }]}>
              <View style={[s.row, { marginBottom: 10 }]}>
                <View style={[s.iconBtn48, { backgroundColor: C.blue100 }]}>
                  <Icon lib="FA5" name="key" size={20} color={C.primary} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.smBold}>{role === 'FIRM_ADMIN' ? 'Firm Office Code' : 'Your Office Code'}</Text>
                  <Text style={s.xs}>{role === 'FIRM_ADMIN' ? 'Share this code with lawyers to join your firm' : 'Your unique code for firm identification'}</Text>
                </View>
              </View>
              <View style={[s.row, { justifyContent: 'space-between', backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.gray200 }]}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary, letterSpacing: 4 }}>{officeCode}</Text>
                <TouchableOpacity
                  onPress={() => Share.share({ message: `Office Code: ${officeCode}` })}
                  style={[s.actionBtn, { backgroundColor: C.blue100 }]}
                >
                  <Icon lib="FA5" name="share" size={15} color={C.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── CALENDAR INTEGRATIONS ── */}
        {(role === 'FIRM_ADMIN' || role === 'LAWYER') && (
          <View style={[s.section, { backgroundColor: '#F0FDF4' }]}>
            <SectionHeader title="Calendar Integrations" />

            {/* Google Calendar */}
            <View style={s.card}>
              <View style={[s.row, { marginBottom: 14 }]}>
                <View style={[s.iconBtn48, { backgroundColor: '#FEE2E2' }]}>
                  <Icon lib="FA5" name="calendar-alt" size={20} color="#DC2626" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.smBold}>Google Calendar</Text>
                  <Text style={s.xs}>Push your LegalHub events to Google</Text>
                  {googleConnected && (
                    <View style={[s.tag, { backgroundColor: C.green100, alignSelf: 'flex-start', marginTop: 4 }]}>
                      <Text style={[s.tagText, { color: C.green600 }]}>Connected ✓</Text>
                    </View>
                  )}
                  {googleSyncResult && (
                    <Text style={[s.xs, { color: C.green600, marginTop: 3 }]}>
                      Last sync: {googleSyncResult.synced} events ✓
                    </Text>
                  )}
                </View>
              </View>
              <View style={[s.row, { gap: 8 }]}>
                <TouchableOpacity
                  style={[s.integBtn, { backgroundColor: C.blue50, borderColor: C.blue100 }]}
                  onPress={handleConnectGoogle}
                  disabled={googleConnecting}
                  activeOpacity={0.8}
                >
                  {googleConnecting
                    ? <ActivityIndicator size="small" color={C.primary} />
                    : <Icon lib="FA5" name="link" size={13} color={C.primary} />}
                  <Text style={[s.integBtnTxt, { color: C.primary }]}>
                    {googleConnecting ? 'Opening…' : 'Connect'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.integBtn, { backgroundColor: C.green50, borderColor: C.green100, flex: 1 }]}
                  onPress={handleSyncGoogle}
                  disabled={googleSyncing}
                  activeOpacity={0.8}
                >
                  {googleSyncing
                    ? <ActivityIndicator size="small" color={C.green600} />
                    : <Icon lib="FA5" name="sync-alt" size={13} color={C.green600} />}
                  <Text style={[s.integBtnTxt, { color: C.green600 }]}>
                    {googleSyncing ? 'Syncing…' : 'Sync Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>


          </View>
        )}

        {/* ── SECURITY SETTINGS ── */}
        <View style={[s.section, { backgroundColor: '#FFF5F5' }]}>
          <Text style={[s.sectionTitle, { marginBottom: 14 }]}>Security Settings</Text>
          {SECURITY_ITEMS.map((item, i) => {
            // Change Password & Login History → chevron clickable
            if (item.type === 'chevron') return (
              <TouchableOpacity key={i} onPress={
                item.title === 'Change Password' ? () => setPwdModal(true) :
                item.title === 'Login History'   ? handleOpenHistory       : undefined
              }>
                <ChevronRow item={item} />
              </TouchableOpacity>
            );

            // 2FA toggle
            if (item.type === 'toggle-2fa') return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={[s.row, { flex: 1 }]}>
                    <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{item.sub}</Text>
                      <View style={[s.tag, { backgroundColor: twoFaEnabled ? C.green50 : C.red50, alignSelf: 'flex-start', marginTop: 6 }]}>
                        <Text style={[s.tagText, { color: twoFaEnabled ? C.green600 : C.red600 }]}>{twoFaEnabled ? 'Enabled' : 'Disabled'}</Text>
                      </View>
                    </View>
                  </View>
                  {twoFALoading
                    ? <ActivityIndicator color={C.primary} />
                    : <Switch value={twoFaEnabled} onValueChange={handleToggle2FA} trackColor={{ false: C.gray200, true: C.green600 }} thumbColor={C.white} />
                  }
                </View>
              </View>
            );

            // Biometric toggle
            if (item.type === 'toggle-bio') return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={[s.row, { flex: 1 }]}>
                    <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{biometricSupported ? item.sub : 'Not available on this device'}</Text>
                    </View>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    disabled={!biometricSupported}
                    trackColor={{ false: C.gray200, true: C.primary }}
                    thumbColor={C.white}
                  />
                </View>
              </View>
            );

            return null;
          })}
        </View>

        {/* ── NOTIFICATION PREFERENCES ── */}
        <View style={s.section} onLayout={e => { notifSectionY.current = e.nativeEvent.layout.y; }}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
            <Text style={s.sectionTitle}>Notification Preferences</Text>
            {savingNotif && <ActivityIndicator size="small" color={C.primary} />}
          </View>
          {notifPrefs && NOTIF_ITEMS.map((item, i) => {
            const prefKey = NOTIF_PREF_KEY[item.title];
            const isOn = prefKey ? !!notifPrefs[prefKey] : item.toggleOn;
            return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={s.row}>
                    <View style={[s.iconBtn40, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={16} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{item.sub}</Text>
                    </View>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={val => prefKey && handleNotifToggle(prefKey, val)}
                    trackColor={{ false: C.gray200, true: C.primary }}
                    thumbColor={C.white}
                  />
                </View>
                {item.radioGroup && isOn && (
                  <RadioGroup
                    options={item.radioOptions}
                    value={notifPrefs.hearing_reminder_offset || '1 hour before'}
                    onChange={val => handleNotifToggle('hearing_reminder_offset', val)}
                  />
                )}
              </View>
            );
          })}
          {!notifPrefs && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
        </View>

        {/* ── DANGER ZONE ── */}
        <View style={[s.section, { backgroundColor: '#FFF5F5' }]}>
          <Text style={[s.sectionTitle, { color: C.red600, marginBottom: 14 }]}>Danger Zone</Text>

          <View style={[s.card, { borderWidth: 2, borderColor: C.red200 }]}>
            <View style={[s.row, { marginBottom: 12 }]}>
              <View style={[s.iconBtn48, { backgroundColor: C.red100 }]}>
                <Icon lib="FA5" name="sign-out-alt" size={20} color={C.red600} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.smBold}>Logout</Text>
                <Text style={s.xs}>Sign out from this device</Text>
              </View>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Text style={[s.smBold, { color: C.red600 }]}>Logout from Account</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.card, { borderWidth: 2, borderColor: C.red200 }]}>
            <View style={[s.row, { marginBottom: 12 }]}>
              <View style={[s.iconBtn48, { backgroundColor: C.red100 }]}>
                <Icon lib="FA5" name="trash" size={20} color={C.red600} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.smBold}>Delete Account</Text>
                <Text style={s.xs}>Permanently remove your account</Text>
              </View>
            </View>
            <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount}>
              <Text style={[s.smBold, { color: C.white }]}>Delete My Account</Text>
            </TouchableOpacity>
            <Text style={[s.xs, { color: C.red500, textAlign: 'center', marginTop: 8 }]}>
              This action cannot be undone
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── 2FA SETUP MODAL ── */}
      <Modal visible={twoFAModal} transparent animationType="slide" onRequestClose={() => setTwoFAModal(false)}>
          <View style={s.modalOverlay}>
            <ScrollView
              contentContainerStyle={s.modalBox}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
                <Text style={s.sectionTitle}>Setup Two-Factor Auth</Text>
                <TouchableOpacity onPress={() => { setTwoFAModal(false); setTwoFACode(''); }}>
                  <Icon lib="FA5" name="times" size={18} color={C.gray500} />
                </TouchableOpacity>
              </View>

              <Text style={[s.xs, { marginBottom: 12, lineHeight: 18 }]}>
                1. Open <Text style={{ fontWeight: '700' }}>Google Authenticator</Text> or <Text style={{ fontWeight: '700' }}>Authy</Text> on your phone.{'\n'}
                2. Tap the button below to add LegalHub, or enter the secret key manually.
              </Text>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue100, marginBottom: 12, alignItems: 'center' }]}
                onPress={() => twoFAData && Linking.openURL(twoFAData.qr_code_url)}
              >
                <Icon lib="FA5" name="qrcode" size={16} color={C.primary} />
                <Text style={[s.smBold, { color: C.primary, marginTop: 4 }]}>Open in Authenticator App</Text>
              </TouchableOpacity>

              {twoFAData && (
                <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 10, marginBottom: 14 }}>
                  <Text style={[s.xs, { marginBottom: 4 }]}>Manual secret key:</Text>
                  <Text selectable style={[s.smBold, { letterSpacing: 2, color: C.primary }]}>{twoFAData.secret}</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Enter the 6-digit code from your app</Text>
              <TextInput
                style={[s.pwdInput, { marginBottom: 16, textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
                placeholder="000000"
                placeholderTextColor={C.gray400}
                keyboardType="number-pad"
                maxLength={6}
                value={twoFACode}
                onChangeText={setTwoFACode}
                returnKeyType="done"
                onSubmitEditing={handleVerify2FA}
              />
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: C.primary, alignItems: 'center', paddingVertical: 14 }]}
                onPress={handleVerify2FA}
                disabled={twoFALoading}
              >
                {twoFALoading
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={[s.smBold, { color: C.white }]}>Verify & Enable 2FA</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
      </Modal>

      {/* ── LOGIN HISTORY MODAL ── */}
      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '75%' }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
              <Text style={s.sectionTitle}>Login History</Text>
              <TouchableOpacity onPress={() => setHistoryModal(false)}>
                <Icon lib="FA5" name="times" size={18} color={C.gray500} />
              </TouchableOpacity>
            </View>
            {historyLoading
              ? <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
              : loginHistory.length === 0
                ? <Text style={[s.xs, { textAlign: 'center', marginVertical: 30 }]}>No login history available.</Text>
                : <ScrollView showsVerticalScrollIndicator={false}>
                    {loginHistory.map((entry, i) => (
                      <View key={i} style={[s.row, { paddingVertical: 12, borderBottomWidth: i < loginHistory.length - 1 ? 1 : 0, borderBottomColor: C.gray100 }]}>
                        <View style={[s.iconBtn40, { backgroundColor: C.blue50 }]}>
                          <Icon lib="FA5" name="sign-in-alt" size={15} color={C.primary} />
                        </View>
                        <View style={{ marginLeft: 12 }}>
                          <Text style={s.smBold}>
                            {new Date(entry.logged_in_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </Text>
                          <Text style={s.xs}>
                            {new Date(entry.logged_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
            }
          </View>
        </View>
      </Modal>

      {/* ── CHANGE PASSWORD MODAL ── */}
      {pwdModal && (
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 20 }]}>
              <Text style={s.sectionTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => { setPwdModal(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}>
                <Icon lib="FA5" name="times" size={18} color={C.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Current Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Enter current password" placeholderTextColor={C.gray400} value={currentPwd} onChangeText={setCurrentPwd} />

            <Text style={s.fieldLabel}>New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Min. 8 characters" placeholderTextColor={C.gray400} value={newPwd} onChangeText={setNewPwd} />

            <Text style={s.fieldLabel}>Confirm New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 20 }]} secureTextEntry placeholder="Repeat new password" placeholderTextColor={C.gray400} value={confirmPwd} onChangeText={setConfirmPwd} />

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: C.primary, width: '100%', justifyContent: 'center', paddingVertical: 14 }]}
              onPress={handleChangePassword}
              disabled={savingPwd}
            >
              <Text style={[s.smBold, { color: C.white }]}>{savingPwd ? 'Saving…' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  section: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white, marginBottom: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.dark },
  sectionAction: { fontSize: 13, fontWeight: '600', color: C.primary },

  profileCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 4, borderWidth: 1, borderColor: C.gray100 },
  profileAvatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: C.primary },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
  profileName: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 4 },
  profileRole: { fontSize: 14, color: C.gray600, marginBottom: 4 },
  profileStatVal: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 2 },
  profileStatLabel: { fontSize: 12, color: C.gray600 },

  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.gray100, marginBottom: 10 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { flex: 1, fontSize: 14, fontWeight: '600', color: C.dark, marginLeft: 12 },

  row: { flexDirection: 'row', alignItems: 'center' },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },

  iconBtn40: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconBtn48: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  storageBg: { width: 80, height: 8, backgroundColor: C.gray200, borderRadius: 4 },
  storageFill: { height: 8, backgroundColor: C.amber600, borderRadius: 4 },

  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.gray300, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },

  integBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  integBtnTxt: { fontSize: 13, fontWeight: '700' },

  aboutCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: C.gray100 },
  appIconWrap: { width: 80, height: 80, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  appName: { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 4 },
  updateBtn: { backgroundColor: C.blue50, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14 },
  socialBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  logoutBtn: { backgroundColor: C.red50, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  deleteBtn: { backgroundColor: C.red600, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },

  xs: { fontSize: 12, color: C.gray600 },
  sm: { fontSize: 13, color: C.dark },
  smBold: { fontSize: 13, fontWeight: '700', color: C.dark },

  bottomNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingVertical: 8, paddingHorizontal: 8, position: 'absolute', bottom: 0, left: 0, right: 0, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navLabel: { fontSize: 11, fontWeight: '500', color: C.gray400, marginTop: 2 },
  activeNavIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  fabBtn: { flex: 1, alignItems: 'center', marginTop: -24 },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },

  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: C.white, borderRadius: 24, padding: 24, width: '100%' },
  pwdInput: { borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.dark },
});
