import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Alert, Image,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { clientPortalAPI, authAPI } from '../../services/api';

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
  const { signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
    return unsubscribe;
  }, [navigation]);

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
});
