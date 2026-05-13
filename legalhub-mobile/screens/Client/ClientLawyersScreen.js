import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Linking, Alert,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { clientPortalAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB',
  g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber600: '#D97706',
};

const AVATAR_COLORS = [C.secondary, '#9333EA', C.green600, C.amber600, '#E11D48'];

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}
function avatarBg(name) {
  if (!name) return C.secondary;
  return AVATAR_COLORS[Math.abs((name.charCodeAt(0) || 65) - 65) % AVATAR_COLORS.length];
}

function contact(value, scheme) {
  if (!value) return;
  Linking.openURL(`${scheme}${value}`).catch(() =>
    Alert.alert('Error', 'Could not open this link.')
  );
}

function LawyerCard({ lawyer }) {
  const bg = avatarBg(lawyer.full_name);
  const specs = Array.isArray(lawyer.specializations) ? lawyer.specializations : [];

  return (
    <View style={s.card}>
      {/* Avatar + name */}
      <View style={s.cardTop}>
        {lawyer.avatar_url ? (
          <Image source={{ uri: lawyer.avatar_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatarFallback, { backgroundColor: bg }]}>
            <Text style={s.avatarInitials}>{getInitials(lawyer.full_name)}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.lawyerName}>{lawyer.full_name || 'Attorney'}</Text>
          {!!lawyer.title && (
            <View style={s.titlePill}>
              <FontAwesome5 name="certificate" size={9} color={C.primary} />
              <Text style={s.titleTxt}>{lawyer.title}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Specializations */}
      {specs.length > 0 && (
        <View style={s.specsWrap}>
          {specs.map((sp, i) => (
            <View key={i} style={s.specChip}>
              <Text style={s.specTxt}>{sp}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Contact buttons */}
      <View style={s.contactRow}>
        {!!lawyer.email && (
          <TouchableOpacity
            style={s.contactBtn}
            onPress={() => contact(lawyer.email, 'mailto:')}
            activeOpacity={0.8}
          >
            <FontAwesome5 name="envelope" size={12} color={C.primary} />
            <Text style={s.contactBtnTxt} numberOfLines={1}>{lawyer.email}</Text>
          </TouchableOpacity>
        )}
        {!!lawyer.phone && (
          <TouchableOpacity
            style={[s.contactBtn, s.contactBtnPhone]}
            onPress={() => contact(lawyer.phone, 'tel:')}
            activeOpacity={0.8}
          >
            <FontAwesome5 name="phone" size={12} color={C.green600} />
            <Text style={[s.contactBtnTxt, { color: C.green600 }]}>{lawyer.phone}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cases this lawyer handles */}
      {lawyer.cases?.length > 0 && (
        <View style={s.casesSection}>
          <Text style={s.casesSectionLabel}>
            <FontAwesome5 name="briefcase" size={10} color={C.g500} />
            {'  '}Handles {lawyer.cases.length} case{lawyer.cases.length !== 1 ? 's' : ''}
          </Text>
          {lawyer.cases.map((c, i) => (
            <View key={c.id} style={[s.caseRow, i < lawyer.cases.length - 1 && s.caseRowBorder]}>
              <View style={s.caseDot} />
              <Text style={s.caseTxt} numberOfLines={1}>
                {c.title || c.case_number || `Case ${i + 1}`}
              </Text>
              {!!c.case_number && !!c.title && (
                <Text style={s.caseNum}>{c.case_number}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ClientLawyersScreen({ navigation }) {
  const [lawyers, setLawyers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await clientPortalAPI.lawyers();
      setLawyers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>My Legal Team</Text>
          {!loading && (
            <Text style={s.headerSub}>
              {lawyers.length} lawyer{lawyers.length !== 1 ? 's' : ''} assigned to your cases
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : lawyers.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <FontAwesome5 name="user-tie" size={32} color={C.g400} />
          </View>
          <Text style={s.emptyTitle}>No lawyers assigned yet</Text>
          <Text style={s.emptyTxt}>Your legal team will appear here once a lawyer is assigned to your case.</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
        >
          {lawyers.map((l) => (
            <LawyerCard key={l.lawyer_id} lawyer={l} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50, padding: 24 },

  header:      { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
  backBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 8 },
  emptyTxt:      { fontSize: 13, color: C.g400, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: C.white, borderRadius: 20, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: C.g100,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },

  cardTop:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar:         { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: C.blue100 },
  avatarFallback: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: C.white, fontSize: 22, fontWeight: '800' },
  lawyerName:     { fontSize: 17, fontWeight: '800', color: C.dark, marginBottom: 6 },
  titlePill:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: C.blue50, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  titleTxt:       { fontSize: 11, fontWeight: '700', color: C.primary },

  specsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  specChip:  { backgroundColor: C.g100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  specTxt:   { fontSize: 11, fontWeight: '600', color: C.g600 },

  contactRow:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  contactBtn:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.blue50, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, flex: 1, minWidth: 0 },
  contactBtnPhone:  { backgroundColor: C.green50 },
  contactBtnTxt:    { fontSize: 12, fontWeight: '600', color: C.primary, flex: 1 },

  casesSection:      { backgroundColor: C.g50, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.g100 },
  casesSectionLabel: { fontSize: 11, fontWeight: '700', color: C.g500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  caseRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  caseRowBorder:     { borderBottomWidth: 1, borderBottomColor: C.g100 },
  caseDot:           { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary, flexShrink: 0 },
  caseTxt:           { flex: 1, fontSize: 13, fontWeight: '600', color: C.dark },
  caseNum:           { fontSize: 11, color: C.g400, flexShrink: 0 },
});
