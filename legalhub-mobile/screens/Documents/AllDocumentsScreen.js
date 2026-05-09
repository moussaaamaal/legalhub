import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, RefreshControl, Linking, Modal, FlatList,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { documentsAPI, casesAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red100: '#FEE2E2', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
};

const FILTER_TABS = ['All', 'PDF', 'Word', 'Image', 'Other'];

const getFileStyle = (fileType) => {
  const t = (fileType || '').toUpperCase();
  if (t === 'PDF')   return { icon: 'file-pdf',   color: C.red600,    bg: C.red100    };
  if (t === 'WORD')  return { icon: 'file-word',  color: C.blue600,   bg: C.blue100   };
  if (t === 'EXCEL') return { icon: 'file-excel', color: C.green600,  bg: C.green100  };
  if (t === 'IMAGE') return { icon: 'file-image', color: C.purple600, bg: C.purple100 };
  return               { icon: 'file-alt',   color: C.g500,      bg: C.g100      };
};

const CATEGORY_LABEL = {
  CONTRACT: 'Contract', COURT_DOC: 'Court Doc', EVIDENCE: 'Evidence',
  FINANCIAL: 'Financial', CLIENT_DOC: 'Client Doc',
  VOICE_TRANSCRIPT: 'Transcript',
};

const groupByDate = (docs) => {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'This Week': [], Older: [] };
  docs.forEach(d => {
    const dt = new Date(d.created_at);
    dt.setHours(0, 0, 0, 0);
    if (dt >= today)          groups['Today'].push(d);
    else if (dt >= yesterday) groups['Yesterday'].push(d);
    else if (dt >= weekAgo)   groups['This Week'].push(d);
    else                      groups['Older'].push(d);
  });
  return Object.entries(groups).filter(([, items]) => items.length > 0);
};

export default function AllDocumentsScreen({ navigation }) {
  const [docs,          setDocs]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeFilter,  setActiveFilter]  = useState(0);
  const [search,        setSearch]        = useState('');

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadModal,   setUploadModal]   = useState(false);
  const [cases,         setCases]         = useState([]);
  const [caseSearch,    setCaseSearch]    = useState('');
  const [selectedCase,  setSelectedCase]  = useState(null);
  const [uploading,     setUploading]     = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await documentsAPI.list();
      setDocs(data || []);
    } catch {
      Alert.alert('Error', 'Could not load documents.');
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openUploadModal = async () => {
    setSelectedCase(null);
    setCaseSearch('');
    setUploadModal(true);
    try {
      const data = await casesAPI.list();
      setCases(data || []);
    } catch {
      Alert.alert('Error', 'Could not load cases.');
    }
  };

  const handlePickAndUpload = async () => {
    if (!selectedCase) { Alert.alert('Select a case', 'Please select a case before uploading.'); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file  = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType };
      setUploading(true);
      await documentsAPI.upload(file, selectedCase.id);
      Alert.alert('Success', `"${asset.name}" uploaded successfully.`);
      setUploadModal(false);
      await load();
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Could not upload the file.');
    } finally {
      setUploading(false);
    }
  };

  const handleView = (doc) => {
    if (!doc.storage_url) { Alert.alert('Unavailable', 'No file URL for this document.'); return; }
    Linking.openURL(doc.storage_url).catch(() => Alert.alert('Error', 'Could not open the document.'));
  };

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || d.file_name?.toLowerCase().includes(q)
      || d.case_file?.title?.toLowerCase().includes(q)
      || d.case_file?.case_number?.toLowerCase().includes(q)
      || CATEGORY_LABEL[d.category]?.toLowerCase().includes(q);

    if (activeFilter === 1) return matchSearch && (d.file_type || '').toUpperCase() === 'PDF';
    if (activeFilter === 2) return matchSearch && (d.file_type || '').toUpperCase() === 'WORD';
    if (activeFilter === 3) return matchSearch && (d.file_type || '').toUpperCase() === 'IMAGE';
    if (activeFilter === 4) return matchSearch && !['PDF','WORD','IMAGE'].includes((d.file_type||'').toUpperCase());
    return matchSearch;
  });

  const groups      = groupByDate(filtered);
  const totalCount  = docs.length;
  const thisWeekCount = docs.filter(d => {
    const dt = new Date(d.created_at);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return dt >= weekAgo;
  }).length;
  const totalSizeMb = docs.reduce((acc, d) => acc + (Number(d.file_size_mb) || 0), 0);
  const sizeLabel   = totalSizeMb >= 1024
    ? `${(totalSizeMb / 1024).toFixed(1)} GB`
    : `${totalSizeMb.toFixed(0)} MB`;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>All Documents</Text>
            <Text style={s.headerSub}>{totalCount} files across all cases</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { val: totalCount,    label: 'Total',     icon: 'file-alt',     iconBg: C.blue100,   iconColor: C.blue600   },
            { val: thisWeekCount, label: 'This Week', icon: 'calendar-week',iconBg: C.green100,  iconColor: C.green600  },
            { val: sizeLabel,     label: 'Storage',   icon: 'hdd',          iconBg: C.purple100, iconColor: C.purple600 },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <View style={[s.statIconWrap, { backgroundColor: st.iconBg }]}>
                <FontAwesome5 name={st.icon} size={13} color={st.iconColor} />
              </View>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search documents, cases..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FILTER TABS */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10, flexDirection: 'row' }}
      >
        {FILTER_TABS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[s.filterTab, activeFilter === i && s.filterTabActive]}
            onPress={() => setActiveFilter(i)}
          >
            <Text style={[s.filterTabTxt, activeFilter === i && s.filterTabTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* CONTENT */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
        >
          {groups.length === 0 && (
            <View style={s.empty}>
              <FontAwesome5 name="folder-open" size={36} color={C.g200} />
              <Text style={s.emptyTxt}>No documents found</Text>
            </View>
          )}

          {groups.map(([groupLabel, items]) => (
            <View key={groupLabel} style={{ marginBottom: 8 }}>
              <View style={s.groupHeader}>
                <View style={s.groupDot} />
                <Text style={s.groupTitle}>{groupLabel}</Text>
                <Text style={s.groupCount}>{items.length} file{items.length > 1 ? 's' : ''}</Text>
              </View>

              {items.map(doc => (
                <DocCard key={doc.id} doc={doc} onView={() => handleView(doc)} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openUploadModal} activeOpacity={0.85}>
        <FontAwesome5 name="cloud-upload-alt" size={18} color={C.white} />
      </TouchableOpacity>

      {/* Upload Modal */}
      <Modal visible={uploadModal} animationType="slide" transparent onRequestClose={() => setUploadModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Upload Document</Text>
              <TouchableOpacity onPress={() => setUploadModal(false)}>
                <Ionicons name="close" size={22} color={C.g500} />
              </TouchableOpacity>
            </View>

            {/* Step 1 — select case */}
            <Text style={s.modalStep}>1. Select a case</Text>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={14} color={C.g400} />
              <TextInput
                style={s.modalSearchInput}
                placeholder="Search cases..."
                placeholderTextColor={C.g400}
                value={caseSearch}
                onChangeText={setCaseSearch}
              />
            </View>

            <FlatList
              data={cases.filter(c =>
                !caseSearch ||
                c.title?.toLowerCase().includes(caseSearch.toLowerCase()) ||
                c.case_number?.toLowerCase().includes(caseSearch.toLowerCase())
              )}
              keyExtractor={c => c.id}
              style={s.caseList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.caseItem, selectedCase?.id === item.id && s.caseItemActive]}
                  onPress={() => setSelectedCase(item)}
                  activeOpacity={0.7}
                >
                  <View style={[s.caseItemDot, { backgroundColor: selectedCase?.id === item.id ? C.primary : C.g200 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.caseItemTitle, selectedCase?.id === item.id && { color: C.primary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.case_number ? (
                      <Text style={s.caseItemNum}>{item.case_number}</Text>
                    ) : null}
                  </View>
                  {selectedCase?.id === item.id && (
                    <FontAwesome5 name="check-circle" size={14} color={C.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={s.caseListEmpty}>No cases found</Text>}
            />

            {/* Step 2 — pick file */}
            <Text style={s.modalStep}>2. Choose a file</Text>
            <TouchableOpacity
              style={[s.uploadBtn, (!selectedCase || uploading) && { opacity: 0.5 }]}
              onPress={handlePickAndUpload}
              disabled={!selectedCase || uploading}
              activeOpacity={0.8}
            >
              {uploading
                ? <ActivityIndicator size="small" color={C.white} />
                : <FontAwesome5 name="cloud-upload-alt" size={15} color={C.white} />}
              <Text style={s.uploadBtnTxt}>{uploading ? 'Uploading…' : 'Pick & Upload File'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DocCard({ doc, onView }) {
  const fs        = getFileStyle(doc.file_type);
  const caseName  = doc.case_file?.title || doc.case_file?.case_number || null;
  const category  = CATEGORY_LABEL[doc.category] || doc.category || null;
  const size      = doc.file_size_mb ? `${Number(doc.file_size_mb).toFixed(1)} MB` : null;
  const dateLabel = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={s.card}>
      {/* Top */}
      <View style={s.cardTop}>
        <View style={[s.docIconWrap, { backgroundColor: fs.bg }]}>
          <FontAwesome5 name={fs.icon} size={22} color={fs.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.docName} numberOfLines={1}>{doc.file_name}</Text>
          {caseName ? (
            <View style={s.caseRow}>
              <FontAwesome5 name="briefcase" size={9} color={C.g400} />
              <Text style={s.docCase} numberOfLines={1}>{caseName}</Text>
            </View>
          ) : null}
          <View style={s.metaRow}>
            {size ? <Text style={s.metaTxt}>{size}</Text> : null}
            {size && dateLabel ? <Text style={s.metaDot}>·</Text> : null}
            {dateLabel ? <Text style={s.metaTxt}>{dateLabel}</Text> : null}
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={s.cardFooter}>
        <View style={[s.typePill, { backgroundColor: fs.bg }]}>
          <FontAwesome5 name={fs.icon} size={9} color={fs.color} />
          <Text style={[s.typePillTxt, { color: fs.color }]}>{(doc.file_type || 'File').toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={s.viewBtn} onPress={onView} activeOpacity={0.7}>
          <FontAwesome5 name="eye" size={11} color={C.purple600} />
          <Text style={s.viewBtnTxt}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: C.primary },
  scroll:            { flex: 1, backgroundColor: C.g50 },
  header:            { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:       { fontSize: 17, fontWeight: '800', color: C.white },
  headerSub:         { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  statsRow:          { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statItem:          { alignItems: 'center', gap: 3 },
  statIconWrap:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statVal:           { fontSize: 15, fontWeight: '800', color: C.white },
  statLabel:         { fontSize: 10, color: 'rgba(255,255,255,0.72)' },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInput:       { flex: 1, color: C.white, fontSize: 13 },
  filterBar:         { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g200, maxHeight: 52, flexGrow: 0 },
  filterTab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: C.g100 },
  filterTabActive:   { backgroundColor: C.primary },
  filterTabTxt:      { fontSize: 12, fontWeight: '600', color: C.g600 },
  filterTabTxtActive:{ color: C.white },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.g50 },
  empty:             { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTxt:          { fontSize: 14, color: C.g400, fontWeight: '600' },
  groupHeader:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  groupDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  groupTitle:        { fontSize: 13, fontWeight: '700', color: C.dark, flex: 1 },
  groupCount:        { fontSize: 11, color: C.g400 },
  card:              { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.g100, marginBottom: 10 },
  cardTop:           { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  docIconWrap:       { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  docName:           { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 4 },
  caseRow:           { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  docCase:           { fontSize: 11, color: C.g500, flex: 1 },
  metaRow:           { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaTxt:           { fontSize: 11, color: C.g400 },
  metaDot:           { fontSize: 11, color: C.g400 },
  catTag:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  catTagTxt:         { fontSize: 10, fontWeight: '700' },
  cardFooter:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  typePill:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  typePillTxt:       { fontSize: 10, fontWeight: '700' },
  viewBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.purple50, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  viewBtnTxt:        { fontSize: 12, fontWeight: '700', color: C.purple600 },
  fab:               { position: 'absolute', bottom: 28, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:        { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:        { fontSize: 17, fontWeight: '800', color: C.dark },
  modalStep:         { fontSize: 13, fontWeight: '700', color: C.g600, marginBottom: 10 },
  modalSearch:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: C.g200, gap: 8, marginBottom: 10 },
  modalSearchInput:  { flex: 1, fontSize: 13, color: C.dark },
  caseList:          { maxHeight: 220, marginBottom: 20 },
  caseItem:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4, backgroundColor: C.g50, borderWidth: 1, borderColor: 'transparent' },
  caseItemActive:    { backgroundColor: C.blue50, borderColor: C.primary },
  caseItemDot:       { width: 10, height: 10, borderRadius: 5 },
  caseItemTitle:     { fontSize: 13, fontWeight: '600', color: C.dark },
  caseItemNum:       { fontSize: 11, color: C.g400, marginTop: 1 },
  caseListEmpty:     { textAlign: 'center', color: C.g400, paddingVertical: 20, fontSize: 13 },
  uploadBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14 },
  uploadBtnTxt:      { fontSize: 14, fontWeight: '700', color: C.white },
});
