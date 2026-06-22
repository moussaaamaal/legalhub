import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Alert, Image,
  Switch, TextInput, Modal,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { clientPortalAPI, authAPI } from '../../services/api';

const bioEnabledKey = (uid) => `lh_biometric_enabled_${uid}`;
const bioTokenKey   = (uid) => `lh_bio_token_${uid}`;
const BIO_ACTIVE_USER_KEY = 'lh_bio_active_user';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE', red600: '#DC2626',
  purple50: '#FAF5FF', purple600: '#9333EA',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
};

const AVATAR_COLORS = [C.secondary, C.purple600, C.green600, C.amber600, '#DC2626'];

const TAG_META = {
  ACTIVE:   { label: 'Active',  color: C.green600,  bg: C.green50  },
  VIP:      { label: 'VIP',     color: C.primary,   bg: C.blue50   },
  PREMIUM:  { label: 'Premium', color: C.purple600, bg: C.purple50 },
  PENDING:  { label: 'Pending', color: C.amber600,  bg: C.amber50  },
  INACTIVE: { label: 'Inactive',color: C.g500,      bg: C.g100     },
};

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function avatarBg(name) {
  if (!name) return C.secondary;
  return AVATAR_COLORS[Math.abs((name.charCodeAt(0) || 65) - 65) % AVATAR_COLORS.length];
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <FontAwesome5 name={icon} size={12} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function AttorneyCard({ attorney, index }) {
  const name = attorney.full_name || '';
  const bg   = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <View style={[s.attorneyCard, index > 0 && { marginTop: 12 }]}>
      <View style={[s.attorneyAvatar, { backgroundColor: bg }]}>
        <Text style={s.attorneyAvatarTxt}>{getInitials(name)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={s.attorneyName}>{name}</Text>
        {!!attorney.title && <Text style={s.attorneyTitle}>{attorney.title}</Text>}
        {!!attorney.email && <Text style={s.attorneyEmail}>{attorney.email}</Text>}
        {attorney.specializations?.length > 0 && (
          <View style={s.specRow}>
            {attorney.specializations.slice(0, 3).map((sp, i) => (
              <View key={i} style={s.specChip}>
                <Text style={s.specChipTxt}>{sp}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ClientProfileScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Change Password ──────────────────────────────────────
  const [pwdModal, setPwdModal]       = useState(false);
  const [currentPwd, setCurrentPwd]   = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [savingPwd, setSavingPwd]     = useState(false);

  // ── 2FA ─────────────────────────────────────────────────
  const [twoFAModal, setTwoFAModal]           = useState(false);
  const [twoFAData, setTwoFAData]             = useState(null);
  const [twoFACode, setTwoFACode]             = useState('');
  const [twoFALoading, setTwoFALoading]       = useState(false);
  const [disable2FAModal, setDisable2FAModal] = useState(false);
  const [disable2FACode, setDisable2FACode]   = useState('');

  // ── Biometric ────────────────────────────────────────────
  const [biometricEnabled,   setBiometricEnabled]   = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  // ── Login History ────────────────────────────────────────
  const [historyModal,   setHistoryModal]   = useState(false);
  const [loginHistory,   setLoginHistory]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadProfile = () => {
    setLoading(true);
    clientPortalAPI.profile()
      .then(d => setProfile(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handlePickAvatar = async () => {
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
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not update profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    loadProfile();
    const unsubscribe = navigation.addListener('focus', loadProfile);

    LocalAuthentication.hasHardwareAsync().then(supported => {
      setBiometricSupported(supported);
      if (supported && user?.id) {
        AsyncStorage.getItem(bioEnabledKey(user.id)).then(val => setBiometricEnabled(val === 'true'));
      }
    });

    return unsubscribe;
  }, [navigation]);

  // ── Security handlers ────────────────────────────────────
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

  const twoFaEnabled = profile?.two_fa_enabled || false;

  const handleToggle2FA = useCallback(async () => {
    if (twoFaEnabled) {
      setDisable2FACode('');
      setDisable2FAModal(true);
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

  const handleDisable2FA = useCallback(async () => {
    if (!disable2FACode.trim()) return;
    setTwoFALoading(true);
    try {
      await authAPI.disable2FA(disable2FACode.trim());
      setProfile(prev => ({ ...prev, two_fa_enabled: false }));
      setDisable2FAModal(false);
      setDisable2FACode('');
      Alert.alert('Success', '2FA has been disabled on your account.');
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'The code you entered is incorrect.');
    } finally {
      setTwoFALoading(false);
    }
  }, [disable2FACode]);

  const handleToggleBiometric = useCallback(async (value) => {
    const userId = user?.id;
    if (!userId) return;
    if (value) {
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled  = await LocalAuthentication.isEnrolledAsync();
      if (!supported || !enrolled) {
        Alert.alert('Not available', 'No Face ID or fingerprint is enrolled on this device.');
        return;
      }
      Alert.alert(
        'Enable Biometric Login',
        'Use Face ID or fingerprint to sign in quickly next time?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable', onPress: async () => {
              try {
                const data = await authAPI.registerBiometric();
                await SecureStore.setItemAsync(bioTokenKey(userId), data.biometric_token);
                await AsyncStorage.setItem(bioEnabledKey(userId), 'true');
                await AsyncStorage.setItem(BIO_ACTIVE_USER_KEY, userId);
                setBiometricEnabled(true);
              } catch (err) {
                Alert.alert('Error', err.message || 'Could not enable biometric login.');
              }
            },
          },
        ]
      );
    } else {
      try { await authAPI.revokeBiometric(); } catch (_) {}
      await SecureStore.deleteItemAsync(bioTokenKey(userId));
      await AsyncStorage.setItem(bioEnabledKey(userId), 'false');
      const activeUser = await AsyncStorage.getItem(BIO_ACTIVE_USER_KEY);
      if (activeUser === userId) await AsyncStorage.removeItem(BIO_ACTIVE_USER_KEY);
      setBiometricEnabled(false);
    }
  }, [user]);

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

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]
    );
  };

  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
  const tag      = (profile?.tag || 'ACTIVE').toUpperCase();
  const tagMeta  = TAG_META[tag] || TAG_META.ACTIVE;

  // Support both single assigned_attorney and assigned_attorneys array
  const attorneys = profile
    ? (Array.isArray(profile.assigned_attorneys)
        ? profile.assigned_attorneys
        : profile.assigned_attorney
          ? [profile.assigned_attorney]
          : [])
    : [];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Profile</Text>
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => navigation.navigate('ClientEditProfile', { profile })}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="pen" size={13} color={C.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : !profile ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="user-slash" size={28} color={C.g400} />
          </View>
          <Text style={{ color: C.g500, fontSize: 15, fontWeight: '600', marginTop: 8 }}>Profile not found</Text>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Hero */}
          <View style={s.heroCard}>
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85} style={s.avatarWrapper}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
              ) : (
                <View style={[s.avatarCircle, { backgroundColor: avatarBg(fullName) }]}>
                  <Text style={s.avatarInitials}>{getInitials(fullName)}</Text>
                </View>
              )}
              <View style={s.cameraOverlay}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <FontAwesome5 name="camera" size={13} color={C.white} />
                }
              </View>
            </TouchableOpacity>
            <Text style={s.fullName}>{fullName}</Text>
            {!!profile.occupation && <Text style={s.occupation}>{profile.occupation}</Text>}
            <View style={[s.tagBadge, { backgroundColor: tagMeta.bg }]}>
              {tag === 'VIP' && <FontAwesome5 name="crown" size={10} color={tagMeta.color} style={{ marginRight: 4 }} />}
              <Text style={[s.tagBadgeTxt, { color: tagMeta.color }]}>{tagMeta.label}</Text>
            </View>
            {!!profile.client_type && (
              <View style={s.typeBadge}>
                <FontAwesome5 name="building" size={10} color={C.g500} style={{ marginRight: 5 }} />
                <Text style={s.typeBadgeTxt}>{profile.client_type?.replace(/_/g, ' ')}</Text>
              </View>
            )}
          </View>

          {/* Personal Info */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}><FontAwesome5 name="address-card" size={13} color={C.primary} /></View>
              <Text style={s.cardTitle}>Personal Information</Text>
            </View>
            <InfoRow icon="envelope"       label="Email"         value={profile.email} />
            <InfoRow icon="phone"          label="Phone"         value={profile.phone} />
            <InfoRow icon="whatsapp"       label="WhatsApp"      value={profile.whatsapp_number} />
            <InfoRow icon="birthday-cake"  label="Date of Birth" value={profile.date_of_birth} />
            <InfoRow icon="venus-mars"     label="Gender"        value={profile.gender} />
            <InfoRow icon="flag"           label="Nationality"   value={profile.nationality} />
            <InfoRow icon="briefcase"      label="Occupation"    value={profile.occupation} />
            <InfoRow icon="building"       label="Company"       value={profile.company_name} />
            <InfoRow icon="map-marker-alt" label="Address"       value={profile.address} />
          </View>

          {/* Attorneys — supports multiple */}
          {attorneys.length > 0 && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}><FontAwesome5 name="user-tie" size={13} color={C.primary} /></View>
                <Text style={s.cardTitle}>
                  {attorneys.length === 1 ? 'Your Attorney' : `Your Attorneys (${attorneys.length})`}
                </Text>
              </View>
              {attorneys.map((att, i) => (
                <AttorneyCard key={att.id || i} attorney={att} index={i} />
              ))}
            </View>
          )}

          {/* Law Firm */}
          {profile.firm && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}><FontAwesome5 name="building" size={13} color={C.primary} /></View>
                <Text style={s.cardTitle}>Law Firm</Text>
              </View>
              <InfoRow icon="building"       label="Name"    value={profile.firm.name} />
              <InfoRow icon="envelope"       label="Email"   value={profile.firm.email} />
              <InfoRow icon="phone"          label="Phone"   value={profile.firm.phone} />
              <InfoRow icon="map-marker-alt" label="Address" value={[profile.firm.address, profile.firm.city, profile.firm.country].filter(Boolean).join(', ')} />
            </View>
          )}

          {/* Security Settings */}
          <View style={s.secCard}>
            <View style={s.secHeader}>
              <View style={s.secHeaderIcon}><FontAwesome5 name="shield-alt" size={13} color={C.primary} /></View>
              <Text style={s.secTitle}>Security Settings</Text>
            </View>

            {/* Change Password */}
            <TouchableOpacity style={s.secRow} onPress={() => setPwdModal(true)} activeOpacity={0.7}>
              <View style={[s.secIcon, { backgroundColor: '#FEE2E2' }]}>
                <FontAwesome5 name="lock" size={14} color="#DC2626" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.secItemTitle}>Change Password</Text>
                <Text style={s.secItemSub}>Update your account password</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
            </TouchableOpacity>

            {/* Two-Factor Authentication */}
            <View style={s.secRow}>
              <View style={[s.secIcon, { backgroundColor: '#DCFCE7' }]}>
                <FontAwesome5 name="shield-alt" size={14} color="#16A34A" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.secItemTitle}>Two-Factor Authentication</Text>
                <Text style={s.secItemSub}>Authenticator app (TOTP)</Text>
                <View style={[s.secBadge, { backgroundColor: twoFaEnabled ? '#F0FDF4' : '#FEF2F2' }]}>
                  <Text style={[s.secBadgeTxt, { color: twoFaEnabled ? '#16A34A' : '#DC2626' }]}>
                    {twoFaEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              </View>
              {twoFALoading
                ? <ActivityIndicator color={C.primary} />
                : <Switch value={twoFaEnabled} onValueChange={handleToggle2FA} trackColor={{ false: C.g200, true: '#16A34A' }} thumbColor={C.white} />
              }
            </View>

            {/* Biometric Login */}
            <View style={s.secRow}>
              <View style={[s.secIcon, { backgroundColor: C.blue100 }]}>
                <FontAwesome5 name="fingerprint" size={14} color={C.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.secItemTitle}>Biometric Login</Text>
                <Text style={s.secItemSub}>{biometricSupported ? 'Use fingerprint or Face ID' : 'Not available on this device'}</Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                disabled={!biometricSupported}
                trackColor={{ false: C.g200, true: C.primary }}
                thumbColor={C.white}
              />
            </View>

            {/* Login History */}
            <TouchableOpacity style={[s.secRow, { borderBottomWidth: 0 }]} onPress={handleOpenHistory} activeOpacity={0.7}>
              <View style={[s.secIcon, { backgroundColor: '#FEF3C7' }]}>
                <FontAwesome5 name="history" size={14} color="#D97706" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.secItemTitle}>Login History</Text>
                <Text style={s.secItemSub}>View recent login activity</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
            </TouchableOpacity>
          </View>

          {/* Settings */}
          <TouchableOpacity style={s.settingsBtn} onPress={() => navigation.navigate('ClientSettings')} activeOpacity={0.8}>
            <View style={s.settingsIcon}><FontAwesome5 name="bell" size={16} color={C.primary} /></View>
            <Text style={s.settingsTxt}>Notification Settings</Text>
            <FontAwesome5 name="chevron-right" size={12} color={C.g400} />
          </TouchableOpacity>

          {/* Sign Out */}
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
            <View style={s.signOutIcon}><FontAwesome5 name="sign-out-alt" size={16} color={C.red600} /></View>
            <Text style={s.signOutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {/* ── CHANGE PASSWORD MODAL ── */}
      <Modal visible={pwdModal} transparent animationType="slide" onRequestClose={() => setPwdModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={s.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => { setPwdModal(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}>
                <FontAwesome5 name="times" size={18} color={C.g500} />
              </TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Current Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Enter current password" placeholderTextColor={C.g400} value={currentPwd} onChangeText={setCurrentPwd} />
            <Text style={s.fieldLabel}>New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Min. 8 characters" placeholderTextColor={C.g400} value={newPwd} onChangeText={setNewPwd} />
            <Text style={s.fieldLabel}>Confirm New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 20 }]} secureTextEntry placeholder="Repeat new password" placeholderTextColor={C.g400} value={confirmPwd} onChangeText={setConfirmPwd} />
            <TouchableOpacity
              style={[s.modalBtn, { backgroundColor: C.primary }]}
              onPress={handleChangePassword}
              disabled={savingPwd}
            >
              {savingPwd
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.modalBtnTxt}>Update Password</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 2FA SETUP MODAL ── */}
      <Modal visible={twoFAModal} transparent animationType="slide" onRequestClose={() => setTwoFAModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={s.modalBox} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Setup Two-Factor Auth</Text>
              <TouchableOpacity onPress={() => { setTwoFAModal(false); setTwoFACode(''); }}>
                <FontAwesome5 name="times" size={18} color={C.g500} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: C.g600, marginBottom: 12, lineHeight: 18 }}>
              1. Open <Text style={{ fontWeight: '700' }}>Google Authenticator</Text> or <Text style={{ fontWeight: '700' }}>Authy</Text> on your phone.{'\n'}
              2. Tap the button below to add LegalHub, or enter the secret key manually.
            </Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue100, borderRadius: 12, paddingVertical: 12, marginBottom: 12 }}
              onPress={() => twoFAData && Linking.openURL(twoFAData.qr_code_url)}
            >
              <FontAwesome5 name="qrcode" size={16} color={C.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>Open in Authenticator App</Text>
            </TouchableOpacity>
            {twoFAData && (
              <View style={{ backgroundColor: C.g50, borderRadius: 10, padding: 10, marginBottom: 14 }}>
                <Text style={{ fontSize: 12, color: C.g500, marginBottom: 4 }}>Manual secret key:</Text>
                <Text selectable style={{ fontSize: 13, fontWeight: '700', letterSpacing: 2, color: C.primary }}>{twoFAData.secret}</Text>
              </View>
            )}
            <Text style={s.fieldLabel}>Enter the 6-digit code from your app</Text>
            <TextInput
              style={[s.pwdInput, { marginBottom: 16, textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
              placeholder="000000"
              placeholderTextColor={C.g400}
              keyboardType="number-pad"
              maxLength={6}
              value={twoFACode}
              onChangeText={setTwoFACode}
              returnKeyType="done"
              onSubmitEditing={handleVerify2FA}
            />
            <TouchableOpacity
              style={[s.modalBtn, { backgroundColor: C.primary }]}
              onPress={handleVerify2FA}
              disabled={twoFALoading}
            >
              {twoFALoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.modalBtnTxt}>Verify & Enable 2FA</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── DISABLE 2FA MODAL ── */}
      <Modal visible={disable2FAModal} transparent animationType="slide" onRequestClose={() => setDisable2FAModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Disable 2FA</Text>
              <TouchableOpacity onPress={() => { setDisable2FAModal(false); setDisable2FACode(''); }}>
                <FontAwesome5 name="times" size={18} color={C.g500} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: C.g500, marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app to confirm.
            </Text>
            <TextInput
              style={[s.pwdInput, { marginBottom: 16 }]}
              placeholder="6-digit code"
              placeholderTextColor={C.g400}
              keyboardType="number-pad"
              maxLength={6}
              value={disable2FACode}
              onChangeText={setDisable2FACode}
              returnKeyType="done"
              onSubmitEditing={handleDisable2FA}
            />
            <TouchableOpacity
              style={[s.modalBtn, { backgroundColor: C.red600 }]}
              onPress={handleDisable2FA}
              disabled={twoFALoading}
            >
              {twoFALoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={s.modalBtnTxt}>Confirm & Disable 2FA</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── LOGIN HISTORY MODAL ── */}
      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '75%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Login History</Text>
              <TouchableOpacity onPress={() => setHistoryModal(false)}>
                <FontAwesome5 name="times" size={18} color={C.g500} />
              </TouchableOpacity>
            </View>
            {historyLoading
              ? <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
              : loginHistory.length === 0
                ? <Text style={{ fontSize: 13, color: C.g500, textAlign: 'center', marginVertical: 30 }}>No login history available.</Text>
                : <ScrollView showsVerticalScrollIndicator={false}>
                    {loginHistory.map((entry, i) => {
                      const method = entry.login_method;
                      const isGoogle    = method === 'google';
                      const isBiometric = method === 'biometric';
                      const iconName  = isGoogle ? 'google' : isBiometric ? 'fingerprint' : 'lock';
                      const iconColor = isGoogle ? '#EA4335' : isBiometric ? '#6C47FF' : C.primary;
                      const iconBg    = isGoogle ? '#fce8e8' : isBiometric ? '#ede8ff' : C.blue50;
                      const methodLabel = isGoogle ? 'Google' : isBiometric ? 'Biometric' : 'Password';
                      return (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < loginHistory.length - 1 ? 1 : 0, borderBottomColor: C.g100 }}>
                          <View style={[s.histIcon, { backgroundColor: iconBg }]}>
                            <FontAwesome5 name={iconName} size={15} color={iconColor} />
                          </View>
                          <View style={{ marginLeft: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.dark }}>
                              {new Date(entry.logged_in_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </Text>
                            <Text style={{ fontSize: 12, color: C.g600 }}>
                              {new Date(entry.logged_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              {' · '}{methodLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
            }
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  editBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },

  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },

  heroCard:       { backgroundColor: C.white, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: C.g100, marginBottom: 10 },
  avatarWrapper:  { position: 'relative', marginBottom: 14 },
  avatarCircle:   { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  avatarImage:    { width: 84, height: 84, borderRadius: 42 },
  avatarInitials: { color: C.white, fontWeight: '800', fontSize: 32 },
  cameraOverlay:  { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
  fullName:       { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 4 },
  occupation:     { fontSize: 13, color: C.g500, marginBottom: 8 },
  tagBadge:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginBottom: 8 },
  tagBadgeTxt:    { fontSize: 13, fontWeight: '700' },
  typeBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g100, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginTop: 2 },
  typeBadgeTxt:   { fontSize: 12, color: C.g600, fontWeight: '600' },

  card:         { backgroundColor: C.white, borderRadius: 18, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.g100, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.dark },

  infoRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  infoIcon:  { width: 30, height: 30, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoLabel: { fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 1 },
  infoValue: { fontSize: 14, fontWeight: '600', color: C.dark },

  attorneyCard:      { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.g100 },
  attorneyAvatar:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  attorneyAvatarTxt: { color: C.white, fontWeight: '800', fontSize: 17 },
  attorneyName:      { fontSize: 15, fontWeight: '700', color: C.dark },
  attorneyTitle:     { fontSize: 12, color: C.g400, marginTop: 2 },
  attorneyEmail:     { fontSize: 12, color: C.primary, marginTop: 4 },
  specRow:           { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  specChip:          { backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  specChipTxt:       { fontSize: 11, fontWeight: '600', color: C.primary },

  settingsBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 10, backgroundColor: C.white, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: C.g100 },
  settingsIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  settingsTxt:  { flex: 1, fontSize: 15, fontWeight: '600', color: C.dark },

  signOutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginHorizontal: 16, marginTop: 4, backgroundColor: C.white, borderRadius: 18, paddingVertical: 16, borderWidth: 1.5, borderColor: '#FECACA' },
  signOutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  signOutTxt:  { fontSize: 15, fontWeight: '700', color: C.red600 },

  // Security section
  secCard:        { backgroundColor: C.white, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.g100, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  secHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: C.g100 },
  secHeaderIcon:  { width: 32, height: 32, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  secTitle:       { fontSize: 15, fontWeight: '800', color: C.dark },
  secRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g100 },
  secIcon:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secItemTitle:   { fontSize: 14, fontWeight: '700', color: C.dark },
  secItemSub:     { fontSize: 12, color: C.g500, marginTop: 1 },
  secBadge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 5 },
  secBadgeTxt:    { fontSize: 11, fontWeight: '600' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { backgroundColor: C.white, borderRadius: 24, padding: 24, width: '100%' },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: C.dark },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: C.g500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pwdInput:     { borderWidth: 1.5, borderColor: C.g200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.dark },
  modalBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  modalBtnTxt:  { fontSize: 14, fontWeight: '700', color: C.white },
  histIcon:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
