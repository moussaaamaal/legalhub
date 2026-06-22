import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  TextInput, Alert, Modal, ActivityIndicator,
  Image, Clipboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { firmAPI, authAPI, dashboardAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ─── Colors ────────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6',
  white: '#FFFFFF', bg: '#F3F4F6',
  dark: '#1E293B', gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563', gray700: '#374151',
  gray100: '#F3F4F6', gray200: '#E5E7EB',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  teal50: '#F0FDFA', teal600: '#0D9488',
};

const ROLES = ['FIRM_ADMIN', 'LAWYER'];
const ROLE_LABELS = { FIRM_ADMIN: 'Firm Admin', LAWYER: 'Lawyer' };
const ROLE_COLORS = {
  FIRM_ADMIN: { bg: C.purple100, color: C.purple600 },
  LAWYER:     { bg: C.blue100,   color: C.blue600   },
};

// ─── Small helpers ─────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const style = ROLE_COLORS[role] || { bg: C.gray100, color: C.gray600 };
  return (
    <View style={[s.badge, { backgroundColor: style.bg }]}>
      <Text style={[s.badgeText, { color: style.color }]}>{ROLE_LABELS[role] || role}</Text>
    </View>
  );
};

const SectionHeader = ({ icon, title, color = C.primary }) => (
  <View style={s.sectionHeader}>
    <View style={[s.sectionIconWrap, { backgroundColor: color + '20' }]}>
      <FontAwesome5 name={icon} size={14} color={color} />
    </View>
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

const StatCard = ({ icon, label, value, color = C.primary }) => (
  <View style={[s.statCard, { borderLeftColor: color }]}>
    <FontAwesome5 name={icon} size={18} color={color} />
    <Text style={s.statValue}>{value ?? '—'}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────
export default function CabinetManagementScreen({ navigation }) {
  const { user } = useAuth();

  // Data
  const [firmProfile, setFirmProfile]     = useState(null);
  const [branding, setBranding]           = useState(null);
  const [officeCode, setOfficeCode]       = useState(null);
  const [team, setTeam]                   = useState([]);
  const [stats, setStats]                 = useState(null);
  const [loading, setLoading]             = useState(true);

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm]       = useState({});
  const [savingProfile, setSavingProfile]   = useState(false);

  // Logo
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Invite lawyer modal
  const [inviteModal, setInviteModal]     = useState(false);
  const [inviteEmail, setInviteEmail]     = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting, setInviting]           = useState(false);

  // Member role modal
  const [roleModal, setRoleModal]         = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newRole, setNewRole]             = useState('');
  const [savingRole, setSavingRole]       = useState(false);

  // Member detail modal
  const [detailMember, setDetailMember]   = useState(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, brand, code, teamData] = await Promise.allSettled([
        firmAPI.getProfile(),
        firmAPI.getBranding(),
        firmAPI.getOfficeCode(),
        firmAPI.getTeam(),
      ]);
      if (profile.status  === 'fulfilled') setFirmProfile(profile.value);
      if (brand.status    === 'fulfilled') setBranding(brand.value);
      if (code.status     === 'fulfilled') setOfficeCode(code.value?.office_code || code.value);
      if (teamData.status === 'fulfilled') setTeam(Array.isArray(teamData.value) ? teamData.value : []);

      // Try firm stats, fall back to dashboard stats
      try {
        const s = await firmAPI.getStats();
        setStats(s);
      } catch {
        try {
          const s = await dashboardAPI.stats();
          setStats(s);
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Profile form init ──────────────────────────────────────────────────────
  useEffect(() => {
    if (firmProfile) {
      setProfileForm({
        name:                firmProfile.name                || '',
        legal_entity_type:   firmProfile.legal_entity_type   || '',
        registration_number: firmProfile.registration_number || '',
        tax_id:              firmProfile.tax_id              || '',
        email:               firmProfile.email               || '',
        phone:               firmProfile.phone               || '',
        address:             firmProfile.address             || '',
        city:                firmProfile.city                || '',
        country:             firmProfile.country             || 'DZ',
        description:         firmProfile.description         || '',
        practice_areas:      (firmProfile.practice_areas || []).join(', '),
      });
    }
  }, [firmProfile]);

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload = {
        ...profileForm,
        practice_areas: profileForm.practice_areas
          ? profileForm.practice_areas.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      };
      const updated = await firmAPI.updateProfile(payload);
      setFirmProfile(updated);
      setEditingProfile(false);
      Alert.alert('Success', 'Firm profile updated.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Upload logo ────────────────────────────────────────────────────────────
  const handleUploadLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', "Autorisez l'accès à la galerie dans les paramètres.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', { uri: asset.uri, type: 'image/jpeg', name: 'logo.jpg' });

    setUploadingLogo(true);
    try {
      const res = await firmAPI.uploadLogo(formData);
      setBranding(prev => ({ ...prev, logo_url: res.logo_url || res.url }));
      Alert.alert('Success', 'Logo updated.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Invite lawyer ──────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteFullName.trim()) { Alert.alert('Error', 'Please enter the full name.'); return; }
    if (!inviteEmail.trim())    { Alert.alert('Error', 'Please enter an email address.'); return; }
    setInviting(true);
    try {
      await authAPI.inviteLawyer({ email: inviteEmail.trim(), full_name: inviteFullName.trim() });
      Alert.alert('Invitation sent', `Invitation sent to ${inviteEmail.trim()}.`);
      setInviteModal(false);
      setInviteEmail('');
      setInviteFullName('');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setInviting(false);
    }
  };

  // ── Change member role ─────────────────────────────────────────────────────
  const openRoleModal = (member) => {
    setSelectedMember(member);
    setNewRole(member.role);
    setRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!selectedMember) return;
    setSavingRole(true);
    try {
      await firmAPI.updateMemberRole(selectedMember.id, newRole);
      setTeam(prev => prev.map(m => m.id === selectedMember.id ? { ...m, role: newRole } : m));
      setRoleModal(false);
      Alert.alert('Success', `${selectedMember.full_name}'s role updated.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingRole(false);
    }
  };

  // ── Deactivate member ──────────────────────────────────────────────────────
  const handleDeactivate = (member) => {
    Alert.alert(
      'Deactivate member',
      `Deactivate ${member.full_name}? They will no longer have access to the firm.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive',
          onPress: async () => {
            try {
              await firmAPI.deactivateMember(member.id);
              setTeam(prev => prev.map(m => m.id === member.id ? { ...m, is_active: false } : m));
              Alert.alert('Success', `${member.full_name} has been deactivated.`);
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  // ── Copy office code ──────────────────────────────────────────────────────
  const handleCopyCode = () => {
    if (officeCode) {
      Clipboard.setString(officeCode);
      Alert.alert('Copied', 'Firm code copied to clipboard.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.centered}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={[s.sm, { marginTop: 12, color: C.gray500 }]}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const logoUrl = branding?.logo_url || firmProfile?.logo_url;
  const activeMembers   = team.filter(m => m.is_active !== false);
  const inactiveMembers = team.filter(m => m.is_active === false);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Firm Management</Text>
        <TouchableOpacity onPress={load} style={s.backBtn}>
          <Ionicons name="refresh" size={20} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Identité Visuelle & Branding ─────────────────────────────── */}
        <SectionHeader icon="palette" title="Identité Visuelle" color={C.purple600} />
        <View style={s.card}>
          {/* Logo */}
          <View style={s.logoRow}>
            <TouchableOpacity onPress={handleUploadLogo} disabled={uploadingLogo} style={s.logoWrap}>
              {uploadingLogo ? (
                <ActivityIndicator color={C.primary} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={s.logoImg} resizeMode="contain" />
              ) : (
                <View style={s.logoPlaceholder}>
                  <FontAwesome5 name="building" size={32} color={C.gray400} />
                </View>
              )}
              <View style={s.logoEditBadge}>
                <FontAwesome5 name="camera" size={10} color={C.white} />
              </View>
            </TouchableOpacity>
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={s.mdBold}>{branding?.display_name || firmProfile?.name || 'Cabinet'}</Text>
              <Text style={[s.xs, { color: C.primary, marginTop: 2 }]}>Tap logo to change</Text>
            </View>
          </View>

        </View>

        {/* ── Statistiques ────────────────────────────────────────────── */}
        <SectionHeader icon="chart-bar" title="Firm Statistics" color={C.blue600} />
        <View style={s.statsRow}>
          <StatCard icon="briefcase"    label="Active Cases" value={stats?.active_cases}    color={C.primary} />
          <StatCard icon="users"        label="Members"      value={stats?.total_members ?? team.length} color={C.secondary} />
          <StatCard icon="address-book" label="Clients"      value={stats?.total_clients}   color={C.green600} />
          <StatCard icon="file-alt"     label="Documents"    value={stats?.total_documents} color={C.amber600} />
        </View>

        {/* ── Profil du cabinet ────────────────────────────────────────── */}
        <SectionHeader icon="building" title="Firm Profile" color={C.indigo600} />
        <View style={s.card}>
          {editingProfile ? (
            <>
              {[
                { key: 'name',                label: 'Firm Name',              placeholder: 'e.g. Benali Law Firm'    },
                { key: 'legal_entity_type',   label: 'Legal Entity Type',      placeholder: 'LLC, Partnership…'       },
                { key: 'registration_number', label: 'Registration Number',    placeholder: 'RC 12345'                 },
                { key: 'tax_id',              label: 'Tax ID',                 placeholder: '000000000000000'          },
                { key: 'email',               label: 'Email',                  placeholder: 'contact@firm.com'         },
                { key: 'phone',               label: 'Phone',                  placeholder: '+213 ...'                 },
                { key: 'address',             label: 'Address',                placeholder: 'Street, district…'        },
                { key: 'city',                label: 'City',                   placeholder: 'Algiers'                  },
                { key: 'country',             label: 'Country',                placeholder: 'DZ'                       },
                { key: 'practice_areas',      label: 'Practice Areas (comma-separated)', placeholder: 'Civil, Criminal…' },
                { key: 'description',         label: 'Description',            placeholder: 'Firm overview…', multiline: true },
              ].map(f => (
                <View key={f.key} style={s.inputGroup}>
                  <Text style={s.inputLabel}>{f.label}</Text>
                  <TextInput
                    style={[s.input, f.multiline && { height: 80, textAlignVertical: 'top' }]}
                    value={profileForm[f.key]}
                    onChangeText={v => setProfileForm(p => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={C.gray400}
                    multiline={f.multiline}
                  />
                </View>
              ))}
              <View style={s.rowBtns}>
                <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setEditingProfile(false)}>
                  <Text style={s.btnOutlineText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? <ActivityIndicator size="small" color={C.white} /> : <Text style={s.btnPrimaryText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {[
                { icon: 'building',         iconBg: C.indigo50,  iconColor: C.indigo600, label: 'Name',                value: firmProfile?.name                },
                { icon: 'balance-scale',    iconBg: C.purple50,  iconColor: C.purple600, label: 'Legal Entity Type',  value: firmProfile?.legal_entity_type   },
                { icon: 'id-card',          iconBg: C.blue50,    iconColor: C.blue600,   label: 'Registration No.',   value: firmProfile?.registration_number },
                { icon: 'file-invoice',     iconBg: C.amber50,   iconColor: C.amber600,  label: 'Tax ID',             value: firmProfile?.tax_id              },
                { icon: 'envelope',         iconBg: C.purple50,  iconColor: C.purple600, label: 'Firm Email',        value: firmProfile?.email               },
                { icon: 'phone',            iconBg: C.green50,   iconColor: C.green600,  label: 'Firm Phone',        value: firmProfile?.phone               },
                { icon: 'map-marker-alt',   iconBg: C.red50,     iconColor: C.red600,    label: 'Address',            value: firmProfile?.address             },
                { icon: 'city',             iconBg: C.indigo50,  iconColor: C.indigo600, label: 'City',               value: firmProfile?.city                },
                { icon: 'globe',            iconBg: C.teal50,    iconColor: C.teal600,   label: 'Country',            value: firmProfile?.country             },
              ].map(item => (
                <View key={item.label} style={s.infoRow}>
                  <View style={[s.infoIcon, { backgroundColor: item.iconBg }]}>
                    <FontAwesome5 name={item.icon} size={13} color={item.iconColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.xs}>{item.label}</Text>
                    <Text style={s.smBold}>{item.value || '—'}</Text>
                  </View>
                </View>
              ))}

              {/* Domaines d'activité — tags */}
              {firmProfile?.practice_areas?.length > 0 && (
                <View style={[s.infoRow, { alignItems: 'flex-start', marginTop: 4 }]}>
                  <View style={[s.infoIcon, { backgroundColor: C.blue50, marginTop: 2 }]}>
                    <FontAwesome5 name="gavel" size={13} color={C.blue600} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.xs}>Practice Areas</Text>
                    <View style={[s.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
                      {firmProfile.practice_areas.map((area, i) => (
                        <View key={i} style={s.areaTag}>
                          <Text style={s.areaTagText}>{area}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Description */}
              {firmProfile?.description ? (
                <View style={[s.infoRow, { alignItems: 'flex-start', marginTop: 4 }]}>
                  <View style={[s.infoIcon, { backgroundColor: C.gray100, marginTop: 2 }]}>
                    <FontAwesome5 name="align-left" size={13} color={C.gray600} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.xs}>Description</Text>
                    <Text style={[s.sm, { marginTop: 2, lineHeight: 18 }]}>{firmProfile.description}</Text>
                  </View>
                </View>
              ) : null}

              <TouchableOpacity style={[s.btn, s.btnPrimary, { marginTop: 14 }]} onPress={() => setEditingProfile(true)}>
                <FontAwesome5 name="edit" size={13} color={C.white} style={{ marginRight: 8 }} />
                <Text style={s.btnPrimaryText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Code du cabinet ─────────────────────────────────────────── */}
        <SectionHeader icon="qrcode" title="Firm Office Code" color={C.green600} />
        <View style={s.card}>
          <Text style={s.xs}>Share this code to invite lawyers to join your firm.</Text>
          <View style={s.codeBox}>
            <Text style={s.codeText}>{officeCode || '—'}</Text>
            <TouchableOpacity onPress={handleCopyCode} style={s.copyBtn}>
              <FontAwesome5 name="copy" size={14} color={C.primary} />
              <Text style={[s.xs, { color: C.primary, marginLeft: 4 }]}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Membres de l'équipe ──────────────────────────────────────── */}
        <SectionHeader icon="users" title="Team Members" color={C.secondary} />
        <View style={s.card}>
          <TouchableOpacity style={[s.btn, s.btnSuccess, { marginBottom: 16 }]} onPress={() => setInviteModal(true)} activeOpacity={0.8}>
            <FontAwesome5 name="user-plus" size={13} color={C.white} style={{ marginRight: 8 }} />
            <Text style={s.btnPrimaryText}>Invite a Lawyer</Text>
          </TouchableOpacity>

          {activeMembers.length === 0 ? (
            <Text style={[s.sm, { color: C.gray500, textAlign: 'center', paddingVertical: 16 }]}>
              No active members
            </Text>
          ) : (
            activeMembers.map(member => (
              <MemberCard
                key={member.id}
                member={member}
                currentUserId={user?.id}
                onPress={() => setDetailMember(member)}
                onChangeRole={() => openRoleModal(member)}
                onDeactivate={() => handleDeactivate(member)}
              />
            ))
          )}

          {inactiveMembers.length > 0 && (
            <>
              <Text style={[s.xs, { color: C.gray500, marginTop: 12, marginBottom: 8 }]}>
                Deactivated members ({inactiveMembers.length})
              </Text>
              {inactiveMembers.map(member => (
                <MemberCard key={member.id} member={member} inactive onPress={() => setDetailMember(member)} />
              ))}
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal: Inviter un avocat ──────────────────────────────────── */}
      <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Invite a Lawyer</Text>
                <TouchableOpacity onPress={() => { setInviteModal(false); setInviteEmail(''); setInviteFullName(''); }}>
                  <Ionicons name="close" size={22} color={C.gray600} />
                </TouchableOpacity>
              </View>

              <Text style={s.inputLabel}>Full Name</Text>
              <TextInput
                style={s.input}
                value={inviteFullName}
                onChangeText={setInviteFullName}
                placeholder="First Last"
                placeholderTextColor={C.gray400}
                autoCorrect={false}
                returnKeyType="next"
              />

              <Text style={[s.inputLabel, { marginTop: 12 }]}>Email Address</Text>
              <TextInput
                style={s.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="avocat@email.com"
                placeholderTextColor={C.gray400}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleInvite}
              />

              <TouchableOpacity style={[s.btn, s.modalBtn, { marginTop: 20 }]} onPress={handleInvite} disabled={inviting}>
                {inviting
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <Text style={s.btnPrimaryText}>Send Invitation</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Member Detail ─────────────────────────────────────── */}
      <Modal visible={!!detailMember} animationType="slide" transparent onRequestClose={() => setDetailMember(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { paddingBottom: 32 }]}>
            {detailMember && (() => {
              const lp = detailMember.lawyer || {};
              const initials = (detailMember.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <Text style={s.modalTitle}>Member Profile</Text>
                    <TouchableOpacity onPress={() => setDetailMember(null)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={18} color={C.gray600} />
                    </TouchableOpacity>
                  </View>

                  {/* Avatar + name */}
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      {detailMember.avatar_url
                        ? <Image source={{ uri: detailMember.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                        : <Text style={{ color: C.white, fontSize: 24, fontWeight: '700' }}>{initials}</Text>
                      }
                    </View>
                    <Text style={[s.smBold, { fontSize: 17 }]}>{detailMember.full_name}</Text>
                    {lp.title && <Text style={[s.xs, { color: C.primary, marginTop: 2, fontWeight: '600' }]}>{lp.title}</Text>}
                    <RoleBadge role={detailMember.role} />
                  </View>

                  {/* Info rows */}
                  {[
                    { icon: 'envelope',         color: C.purple600, bg: C.purple50, label: 'Email',               value: detailMember.email },
                    { icon: 'phone',             color: C.green600,  bg: C.green50,  label: 'Phone',               value: detailMember.phone },
                    { icon: 'id-badge',          color: C.indigo600, bg: C.indigo50, label: 'Bar License Number',  value: lp.bar_license_number },
                    { icon: 'map-marker-alt',    color: C.red600,    bg: C.red50,    label: 'Bar License State',   value: lp.bar_license_state },
                    { icon: 'star',              color: C.amber600,  bg: C.amber50,  label: 'Years of Experience', value: lp.years_experience != null ? `${lp.years_experience} years` : null },
                    { icon: 'building',          color: C.teal600,   bg: C.teal50,   label: 'Office Location',     value: lp.office_location },
                    { icon: 'clock',             color: C.gray600,   bg: C.gray100,  label: 'Member Since',        value: detailMember.created_at ? new Date(detailMember.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null },
                  ].filter(f => f.value).map((f, i) => (
                    <View key={i} style={[s.infoRow, { marginBottom: 10 }]}>
                      <View style={[s.infoIcon, { backgroundColor: f.bg }]}>
                        <FontAwesome5 name={f.icon} size={13} color={f.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.xs}>{f.label}</Text>
                        <Text style={s.smBold}>{f.value}</Text>
                      </View>
                    </View>
                  ))}

                  {/* Specializations */}
                  {lp.specializations?.length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={[s.xs, { marginBottom: 8 }]}>Specializations</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {lp.specializations.map((sp, i) => (
                          <View key={i} style={{ backgroundColor: C.blue100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                            <Text style={{ fontSize: 11, color: C.primary, fontWeight: '600' }}>{sp.replace(/_/g, ' ')}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Changer le rôle ────────────────────────────────────── */}
      <Modal visible={roleModal} animationType="slide" transparent onRequestClose={() => setRoleModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Change Role</Text>
              <TouchableOpacity onPress={() => setRoleModal(false)}>
                <Ionicons name="close" size={22} color={C.gray600} />
              </TouchableOpacity>
            </View>

            {selectedMember && (
              <Text style={[s.sm, { marginBottom: 16, color: C.gray600 }]}>
                Change role for {selectedMember.full_name}
              </Text>
            )}

            {ROLES.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.roleOption, newRole === r && s.roleOptionActive]}
                onPress={() => setNewRole(r)}
              >
                <View style={[s.radioCircle, newRole === r && s.radioCircleActive]}>
                  {newRole === r && <View style={s.radioDot} />}
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={s.smBold}>{ROLE_LABELS[r] || r}</Text>
                  <Text style={s.xs}>{roleDescription(r)}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[s.btn, s.modalBtn, { marginTop: 20 }]} onPress={handleSaveRole} disabled={savingRole}>
              {savingRole
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={s.btnPrimaryText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────
function MemberCard({ member, currentUserId, onPress, onChangeRole, onDeactivate, inactive }) {
  const isMe = member.id === currentUserId;
  return (
    <TouchableOpacity style={[s.memberCard, inactive && s.memberCardInactive]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.avatar, inactive && { opacity: 0.5 }]}>
        {member.avatar_url
          ? <Image source={{ uri: member.avatar_url }} style={s.avatarImg} />
          : <FontAwesome5 name="user" size={20} color={C.white} />
        }
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={s.row}>
          <Text style={[s.smBold, inactive && { color: C.gray400 }]}>{member.full_name}</Text>
          {isMe && <View style={s.meBadge}><Text style={s.meBadgeText}>Me</Text></View>}
        </View>
        <Text style={s.xs}>{member.email}</Text>
        <RoleBadge role={member.role} />
      </View>
      {!inactive && !isMe && (
        <View style={s.memberActions}>
          <TouchableOpacity style={s.memberActionBtn} onPress={onChangeRole}>
            <FontAwesome5 name="user-edit" size={13} color={C.blue600} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.memberActionBtn, { backgroundColor: C.red50 }]} onPress={onDeactivate}>
            <FontAwesome5 name="user-slash" size={13} color={C.red500} />
          </TouchableOpacity>
        </View>
      )}
      {inactive && (
        <View style={s.inactiveBadge}>
          <Text style={s.inactiveBadgeText}>Deactivated</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}


function roleDescription(role) {
  switch (role) {
    case 'FIRM_ADMIN': return 'Full access, firm management';
    case 'LAWYER':     return 'Manage cases and clients';
    default:           return '';
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.primary },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  scroll:     { flex: 1, backgroundColor: C.bg },
  content:    { paddingHorizontal: 16, paddingBottom: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.white },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 20, marginBottom: 10,
  },
  sectionIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  sectionTitle:    { fontSize: 14, fontWeight: '700', color: C.dark },

  card: {
    backgroundColor: C.white, borderRadius: 14,
    padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Logo
  logoRow:        { flexDirection: 'row', alignItems: 'center' },
  logoWrap:       { position: 'relative', width: 72, height: 72 },
  logoImg:        { width: 72, height: 72, borderRadius: 16, borderWidth: 2, borderColor: C.gray200 },
  logoPlaceholder:{ width: 72, height: 72, borderRadius: 16, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.gray200, borderStyle: 'dashed' },
  logoEditBadge:  { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },

  // Stats
  statsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: C.white, borderRadius: 12,
    padding: 14, alignItems: 'center', borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: C.dark, marginTop: 6 },
  statLabel: { fontSize: 11, color: C.gray500, marginTop: 2, textAlign: 'center' },

  // Form
  inputGroup:  { marginBottom: 12 },
  inputLabel:  { fontSize: 12, fontWeight: '600', color: C.gray600, marginBottom: 4 },
  input:       { backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark, borderWidth: 1, borderColor: C.gray200 },

  // Info rows
  infoRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 16, height: 16, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: C.gray200 },
  areaTag:  { backgroundColor: C.blue50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.blue100 },
  areaTagText: { fontSize: 11, color: C.blue600, fontWeight: '600' },

  // Code box
  codeBox:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.blue50, borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: C.blue100 },
  codeText: { fontSize: 22, fontWeight: '800', color: C.primary, letterSpacing: 3 },
  copyBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.white, borderRadius: 8, borderWidth: 1, borderColor: C.blue100 },

  // Members
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  memberCardInactive: { opacity: 0.6 },
  avatar:    { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  memberActions: { flexDirection: 'row', gap: 6 },
  memberActionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  meBadge:    { backgroundColor: C.blue50, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  meBadgeText:{ fontSize: 10, fontWeight: '700', color: C.blue600 },
  inactiveBadge:    { backgroundColor: C.red50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  inactiveBadgeText:{ fontSize: 10, fontWeight: '600', color: C.red500 },

  // Badge
  badge:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // Subscription
  subCard:   { alignItems: 'flex-start' },
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },

  // Buttons
  rowBtns:     { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  btnPrimary:  { backgroundColor: C.primary, flex: 1 },
  modalBtn:    { backgroundColor: C.primary, width: '100%', paddingVertical: 14 },
  btnOutline:  { borderWidth: 1.5, borderColor: C.gray200, flex: 1 },
  btnSuccess:  { backgroundColor: C.green600 },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: C.white },
  btnOutlineText: { fontSize: 14, fontWeight: '600', color: C.gray700 },

  // Role pills
  rolePickerRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  rolePill:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  rolePillActive:   { borderColor: C.primary, backgroundColor: C.blue50 },
  rolePillText:     { fontSize: 13, color: C.gray600, fontWeight: '600' },
  rolePillTextActive:{ color: C.primary },

  // Role option rows (modal)
  roleOption:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  roleOptionActive: { backgroundColor: C.blue50, marginHorizontal: -20, paddingHorizontal: 20, borderRadius: 10 },
  radioCircle:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.gray300, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive:{ borderColor: C.primary },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: C.dark },

  // Typography helpers
  row:    { flexDirection: 'row', alignItems: 'center' },
  xs:     { fontSize: 12, color: C.gray500 },
  sm:     { fontSize: 13, color: C.gray600 },
  smBold: { fontSize: 13, fontWeight: '600', color: C.dark },
  mdBold: { fontSize: 15, fontWeight: '700', color: C.dark },
});
