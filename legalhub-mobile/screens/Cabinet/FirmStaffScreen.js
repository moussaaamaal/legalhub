import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  TextInput, Alert, Modal, ActivityIndicator,
  Image, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { firmAPI, authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ─── Colors ────────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6',
  white: '#FFFFFF', bg: '#F3F4F6',
  dark: '#1E293B',
  gray50: '#F9FAFB', gray100: '#F3F4F6', gray200: '#E5E7EB',
  gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563', gray700: '#374151',
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

function roleDescription(role) {
  switch (role) {
    case 'FIRM_ADMIN': return 'Full access, firm management';
    case 'LAWYER':     return 'Manage cases and clients';
    default:           return '';
  }
}

// ─── MemberCard ─────────────────────────────────────────────────────────────
function MemberCard({ member, currentUserId, isAdmin, onPress, onChangeRole, onDeactivate, inactive }) {
  const isMe = member.id === currentUserId;
  const initials = (member.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <TouchableOpacity
      style={[s.memberCard, inactive && s.memberCardInactive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[s.avatar, inactive && { opacity: 0.5 }]}>
        {member.avatar_url
          ? <Image source={{ uri: member.avatar_url }} style={s.avatarImg} />
          : <Text style={s.avatarInitials}>{initials}</Text>
        }
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={s.row}>
          <Text style={[s.smBold, inactive && { color: C.gray400 }]}>{member.full_name}</Text>
          {isMe && (
            <View style={s.meBadge}>
              <Text style={s.meBadgeText}>Me</Text>
            </View>
          )}
        </View>
        <Text style={s.xs}>{member.email}</Text>
        <RoleBadge role={member.role} />
      </View>
      {isAdmin && !inactive && !isMe ? (
        <View style={s.memberActions}>
          <TouchableOpacity style={s.memberActionBtn} onPress={onChangeRole}>
            <FontAwesome5 name="user-edit" size={13} color={C.blue600} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.memberActionBtn, { backgroundColor: C.red50 }]} onPress={onDeactivate}>
            <FontAwesome5 name="user-slash" size={13} color={C.red500} />
          </TouchableOpacity>
        </View>
      ) : inactive ? (
        <View style={s.inactiveBadge}>
          <Text style={s.inactiveBadgeText}>Deactivated</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────
export default function FirmStaffScreen({ navigation }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'FIRM_ADMIN';

  const [team,        setTeam]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // Detail modal
  const [detailMember, setDetailMember] = useState(null);

  // Role modal
  const [roleModal,         setRoleModal]         = useState(false);
  const [selectedMember,    setSelectedMember]    = useState(null);
  const [newRole,           setNewRole]           = useState('');
  const [savingRole,        setSavingRole]        = useState(false);

  // Invite modal
  const [inviteModal,    setInviteModal]    = useState(false);
  const [inviteEmail,    setInviteEmail]    = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviting,       setInviting]       = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const data = await firmAPI.getTeam();
      setTeam(Array.isArray(data) ? data : []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not load team.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  // ── Role change ───────────────────────────────────────────────────────────
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
      if (detailMember?.id === selectedMember.id) {
        setDetailMember(prev => ({ ...prev, role: newRole }));
      }
      setRoleModal(false);
      Alert.alert('Success', `${selectedMember.full_name}'s role updated.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingRole(false);
    }
  };

  // ── Deactivate ────────────────────────────────────────────────────────────
  const handleDeactivate = (member) => {
    Alert.alert(
      'Deactivate member',
      `Deactivate ${member.full_name}? They will no longer have access to the firm.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive',
          onPress: async () => {
            try {
              await firmAPI.deactivateMember(member.id);
              setTeam(prev => prev.map(m => m.id === member.id ? { ...m, is_active: false } : m));
              setDetailMember(null);
              Alert.alert('Success', `${member.full_name} has been deactivated.`);
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  // ── Invite ────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  const activeMembers   = team.filter(m => m.is_active !== false);
  const inactiveMembers = team.filter(m => m.is_active === false);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Firm Staff</Text>
          <View style={s.backBtn} />
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[s.xs, { marginTop: 12, color: C.gray500 }]}>Loading team…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Firm Staff</Text>
        <TouchableOpacity onPress={handleRefresh} style={s.backBtn}>
          <Ionicons name="refresh" size={20} color={C.white} />
        </TouchableOpacity>
      </View>

      {/* Stats banner */}
      <View style={s.statsBanner}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{activeMembers.length}</Text>
          <Text style={s.statLabel}>Active</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statValue, { color: C.red500 }]}>{inactiveMembers.length}</Text>
          <Text style={s.statLabel}>Inactive</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{team.length}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
      >
        {/* Invite button (admin only) */}
        {isAdmin && (
          <TouchableOpacity style={s.inviteBtn} onPress={() => setInviteModal(true)} activeOpacity={0.85}>
            <FontAwesome5 name="user-plus" size={14} color={C.white} style={{ marginRight: 8 }} />
            <Text style={s.inviteBtnText}>Invite a Lawyer</Text>
          </TouchableOpacity>
        )}

        {/* Active members */}
        <View style={s.sectionLabel}>
          <View style={[s.dot, { backgroundColor: C.green600 }]} />
          <Text style={s.sectionLabelText}>Active members ({activeMembers.length})</Text>
        </View>

        <View style={s.card}>
          {activeMembers.length === 0 ? (
            <View style={s.emptyWrap}>
              <FontAwesome5 name="users" size={32} color={C.gray200} />
              <Text style={[s.xs, { marginTop: 10, color: C.gray400 }]}>No active members</Text>
            </View>
          ) : (
            activeMembers.map(member => (
              <MemberCard
                key={member.id}
                member={member}
                currentUserId={user?.id}
                isAdmin={isAdmin}
                onPress={() => setDetailMember(member)}
                onChangeRole={() => openRoleModal(member)}
                onDeactivate={() => handleDeactivate(member)}
              />
            ))
          )}
        </View>

        {/* Inactive members */}
        {inactiveMembers.length > 0 && (
          <>
            <View style={s.sectionLabel}>
              <View style={[s.dot, { backgroundColor: C.red500 }]} />
              <Text style={s.sectionLabelText}>Deactivated ({inactiveMembers.length})</Text>
            </View>
            <View style={s.card}>
              {inactiveMembers.map(member => (
                <MemberCard
                  key={member.id}
                  member={member}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  inactive
                  onPress={() => setDetailMember(member)}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal: Member Detail ─────────────────────────────────────── */}
      <Modal visible={!!detailMember} animationType="slide" transparent onRequestClose={() => setDetailMember(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { paddingBottom: 32 }]}>
            {detailMember && (() => {
              const lp = detailMember.lawyer || {};
              const initials = (detailMember.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              const inactive = detailMember.is_active === false;
              return (
                <>
                  <View style={s.modalHeader}>
                    <Text style={s.modalTitle}>Member Profile</Text>
                    <TouchableOpacity onPress={() => setDetailMember(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={18} color={C.gray600} />
                    </TouchableOpacity>
                  </View>

                  {/* Avatar + name */}
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    <View style={s.detailAvatar}>
                      {detailMember.avatar_url
                        ? <Image source={{ uri: detailMember.avatar_url }} style={s.detailAvatarImg} />
                        : <Text style={s.detailAvatarInitials}>{initials}</Text>
                      }
                    </View>
                    <Text style={[s.smBold, { fontSize: 17, marginTop: 10 }]}>{detailMember.full_name}</Text>
                    {lp.title && <Text style={[s.xs, { color: C.primary, marginTop: 2, fontWeight: '600' }]}>{lp.title}</Text>}
                    <RoleBadge role={detailMember.role} />
                    {inactive && (
                      <View style={[s.inactiveBadge, { marginTop: 6 }]}>
                        <Text style={s.inactiveBadgeText}>Deactivated</Text>
                      </View>
                    )}
                  </View>

                  {/* Info rows */}
                  {[
                    { icon: 'envelope',      color: C.purple600, bg: C.purple50, label: 'Email',               value: detailMember.email },
                    { icon: 'phone',         color: C.green600,  bg: C.green50,  label: 'Phone',               value: detailMember.phone },
                    { icon: 'id-badge',      color: C.indigo600, bg: C.indigo50, label: 'Bar License',         value: lp.bar_license_number },
                    { icon: 'map-marker-alt',color: C.red600,    bg: C.red50,    label: 'Bar License State',   value: lp.bar_license_state },
                    { icon: 'star',          color: C.amber600,  bg: C.amber50,  label: 'Years of Experience', value: lp.years_experience != null ? `${lp.years_experience} years` : null },
                    { icon: 'building',      color: C.teal600,   bg: C.teal50,   label: 'Office Location',     value: lp.office_location },
                    { icon: 'clock',         color: C.gray600,   bg: C.gray100,  label: 'Member Since',        value: detailMember.created_at ? new Date(detailMember.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null },
                  ].filter(f => f.value).map((f, i) => (
                    <View key={i} style={s.infoRow}>
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
                    <View style={{ marginTop: 8 }}>
                      <Text style={[s.xs, { marginBottom: 8, color: C.gray500 }]}>Specializations</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {lp.specializations.map((sp, i) => (
                          <View key={i} style={{ backgroundColor: C.blue100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                            <Text style={{ fontSize: 11, color: C.primary, fontWeight: '600' }}>{sp.replace(/_/g, ' ')}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Admin actions */}
                  {isAdmin && !inactive && detailMember.id !== user?.id && (
                    <View style={[s.row, { gap: 10, marginTop: 20 }]}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: C.blue50, flex: 1 }]}
                        onPress={() => { setDetailMember(null); openRoleModal(detailMember); }}
                      >
                        <FontAwesome5 name="user-edit" size={13} color={C.blue600} style={{ marginRight: 6 }} />
                        <Text style={[s.smBold, { color: C.blue600 }]}>Change Role</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: C.red50, flex: 1 }]}
                        onPress={() => { const m = detailMember; setDetailMember(null); handleDeactivate(m); }}
                      >
                        <FontAwesome5 name="user-slash" size={13} color={C.red500} style={{ marginRight: 6 }} />
                        <Text style={[s.smBold, { color: C.red500 }]}>Deactivate</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Change Role ────────────────────────────────────────── */}
      <Modal visible={roleModal} animationType="slide" transparent onRequestClose={() => setRoleModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Change Role</Text>
                <TouchableOpacity onPress={() => setRoleModal(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={18} color={C.gray600} />
                </TouchableOpacity>
              </View>

              {selectedMember && (
                <Text style={[s.sm, { marginBottom: 16, color: C.gray600 }]}>
                  Change role for{' '}
                  <Text style={{ fontWeight: '700', color: C.dark }}>{selectedMember.full_name}</Text>
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
                    <Text style={s.smBold}>{ROLE_LABELS[r]}</Text>
                    <Text style={s.xs}>{roleDescription(r)}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[s.primaryBtn, { marginTop: 20 }]}
                onPress={handleSaveRole}
                disabled={savingRole}
              >
                {savingRole
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <Text style={s.primaryBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Invite Lawyer ──────────────────────────────────────── */}
      <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Invite a Lawyer</Text>
                <TouchableOpacity onPress={() => { setInviteModal(false); setInviteEmail(''); setInviteFullName(''); }} style={s.closeBtn}>
                  <Ionicons name="close" size={18} color={C.gray600} />
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

              <Text style={[s.inputLabel, { marginTop: 14 }]}>Email Address</Text>
              <TextInput
                style={s.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="lawyer@email.com"
                placeholderTextColor={C.gray400}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleInvite}
              />

              <TouchableOpacity
                style={[s.primaryBtn, { marginTop: 20 }]}
                onPress={handleInvite}
                disabled={inviting}
              >
                {inviting
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <Text style={s.primaryBtnText}>Send Invitation</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.primary },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  scroll:  { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.white },

  // Stats banner
  statsBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: C.primary, paddingBottom: 16, paddingHorizontal: 16,
  },
  statItem:   { alignItems: 'center', flex: 1 },
  statValue:  { fontSize: 24, fontWeight: '800', color: C.white },
  statLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statDivider:{ width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Section label
  sectionLabel:     { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  dot:              { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  sectionLabelText: { fontSize: 13, fontWeight: '700', color: C.gray700 },

  card: {
    backgroundColor: C.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  emptyWrap: { alignItems: 'center', paddingVertical: 32 },

  // Member card
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  memberCardInactive: { opacity: 0.55 },
  avatar:    { width: 46, height: 46, borderRadius: 23, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarInitials: { color: C.white, fontSize: 16, fontWeight: '700' },
  memberActions:   { flexDirection: 'row', gap: 6 },
  memberActionBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  meBadge:    { backgroundColor: C.blue50, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  meBadgeText:{ fontSize: 10, fontWeight: '700', color: C.blue600 },
  inactiveBadge:    { backgroundColor: C.red50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  inactiveBadgeText:{ fontSize: 10, fontWeight: '600', color: C.red500 },

  // Invite button
  inviteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green600, borderRadius: 12, paddingVertical: 12, marginTop: 16 },
  inviteBtnText: { fontSize: 14, fontWeight: '700', color: C.white },

  // Detail modal
  detailAvatar:        { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  detailAvatarImg:     { width: 72, height: 72, borderRadius: 36 },
  detailAvatarInitials:{ color: C.white, fontSize: 24, fontWeight: '700' },

  infoRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  // Role option rows
  roleOption:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  roleOptionActive: { backgroundColor: C.blue50, marginHorizontal: -24, paddingHorizontal: 24, borderRadius: 10 },
  radioCircle:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.gray300, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive:{ borderColor: C.primary },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },

  // Inputs
  inputLabel: { fontSize: 12, fontWeight: '600', color: C.gray600, marginBottom: 4 },
  input:      { backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark, borderWidth: 1, borderColor: C.gray200 },

  // Action buttons
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  primaryBtn:     { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, width: '100%' },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: C.white },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: C.dark },
  closeBtn:     { width: 30, height: 30, borderRadius: 8, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },

  // Badge
  badge:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // Typography
  row:    { flexDirection: 'row', alignItems: 'center' },
  xs:     { fontSize: 12, color: C.gray500 },
  sm:     { fontSize: 13, color: C.gray600 },
  smBold: { fontSize: 13, fontWeight: '700', color: C.dark },
});
