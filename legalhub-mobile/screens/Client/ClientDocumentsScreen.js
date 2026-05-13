import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert, Linking,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { clientPortalAPI, documentsAPI } from '../../services/api';

const C = {
  primary: '#1E40AF', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  green50: '#F0FDF4', green600: '#16A34A',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  red50: '#FEF2F2', red600: '#DC2626',
  purple50: '#FAF5FF', purple600: '#9333EA',
};

// Backend stores file_type as 'PDF', 'WORD', 'IMAGE', 'OTHER'
function getFileIcon(fileType) {
  switch ((fileType || '').toUpperCase()) {
    case 'PDF':   return { icon: 'file-pdf',   color: C.red600   };
    case 'WORD':  return { icon: 'file-word',  color: C.primary  };
    case 'IMAGE': return { icon: 'file-image', color: C.amber600 };
    default:      return { icon: 'file-alt',   color: C.g500     };
  }
}

function RequestCard({ req, onUpload, uploading }) {
  const date = req.created_at
    ? new Date(req.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : '';
  const isFulfilled = req.status === 'FULFILLED';
  return (
    <View style={[s.reqCard, isFulfilled && s.reqCardDone]}>
      <View style={[s.reqIconWrap, { backgroundColor: isFulfilled ? C.green50 : C.amber50 }]}>
        <FontAwesome5
          name={isFulfilled ? 'check-circle' : 'inbox'}
          size={18}
          color={isFulfilled ? C.green600 : C.amber600}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.reqDesc} numberOfLines={2}>{req.description}</Text>
        <Text style={s.reqCase} numberOfLines={1}>
          {req.case_file?.title || req.case_file?.case_number || ''}
        </Text>
        {!!date && <Text style={s.reqDate}>{date}</Text>}
      </View>
      {isFulfilled ? (
        <View style={s.reqDoneBadge}><Text style={s.reqDoneTxt}>Done</Text></View>
      ) : (
        <TouchableOpacity
          style={[s.reqUploadBtn, uploading && { opacity: 0.5 }]}
          onPress={onUpload}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {uploading
            ? <ActivityIndicator size="small" color={C.white} />
            : <>
                <FontAwesome5 name="cloud-upload-alt" size={12} color={C.white} />
                <Text style={s.reqUploadTxt}>Upload</Text>
              </>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

function DocCard({ doc }) {
  const { icon, color } = getFileIcon(doc.file_type);
  const sizeMB = doc.file_size_mb ? `${parseFloat(doc.file_size_mb).toFixed(1)} MB` : '';
  const date   = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const isNew = doc.status === 'PENDING_REVIEW';

  const openDoc = () => {
    if (!doc.storage_url) {
      Alert.alert('Unavailable', 'This document has no URL yet.');
      return;
    }
    Linking.openURL(doc.storage_url).catch(() =>
      Alert.alert('Error', 'Could not open the document.')
    );
  };

  return (
    <TouchableOpacity
      style={[s.docCard, isNew && s.docCardNew]}
      onPress={openDoc}
      activeOpacity={0.75}
    >
      <View style={[s.docIconWrap, { backgroundColor: color + '18' }]}>
        <FontAwesome5 name={icon} size={26} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text style={s.docName} numberOfLines={2}>{doc.file_name}</Text>
          {isNew && <View style={s.newBadge}><Text style={s.newBadgeTxt}>New</Text></View>}
        </View>
        <View style={s.docMeta}>
          {doc.category ? (
            <View style={s.categoryChip}>
              <Text style={s.docCategory}>{doc.category?.replace(/_/g, ' ')}</Text>
            </View>
          ) : null}
          {sizeMB ? <Text style={s.docSize}>{sizeMB}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <FontAwesome5 name="calendar" size={10} color={C.g400} />
          <Text style={s.docDate}>{date}</Text>
        </View>
        {doc.storage_url ? (
          <TouchableOpacity style={s.viewBtn} onPress={openDoc}>
            <FontAwesome5 name="external-link-alt" size={10} color={C.white} />
            <Text style={s.viewBtnTxt}>Open</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function UploadModal({ visible, cases, preselectedCaseId, onClose, onUploaded }) {
  const [selectedFile, setSelectedFile]   = useState(null);
  const [uploadCaseId, setUploadCaseId]   = useState(preselectedCaseId || null);
  const [uploading, setUploading]         = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedFile(null);
      setUploadCaseId(preselectedCaseId || null);
    }
  }, [visible, preselectedCaseId]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setSelectedFile(result.assets[0]);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open file picker');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No file selected', 'Please select a file to upload.');
      return;
    }
    if (!uploadCaseId) {
      Alert.alert('Select a case', 'Please select the case this document belongs to.');
      return;
    }
    setUploading(true);
    try {
      await documentsAPI.upload(selectedFile, uploadCaseId);
      onUploaded();
      Alert.alert('Uploaded', 'Your document has been uploaded successfully.');
    } catch (e) {
      Alert.alert('Upload Failed', e.message || 'Could not upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const { icon: fileIcon, color: fileColor } = selectedFile
    ? getFileIcon(selectedFile.mimeType)
    : { icon: 'file-alt', color: C.g400 };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <View style={s.modalHandle} />

          {/* Header */}
          <View style={s.modalHeader}>
            <View style={s.modalIconWrap}>
              <FontAwesome5 name="cloud-upload-alt" size={22} color={C.primary} />
            </View>
            <Text style={s.modalTitle}>Upload Document</Text>
            <Text style={s.modalSub}>Add a document to your case file</Text>
          </View>

          {/* File picker */}
          <TouchableOpacity style={s.filePicker} onPress={pickFile} activeOpacity={0.75}>
            {selectedFile ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={[s.fileIconWrap, { backgroundColor: fileColor + '18' }]}>
                  <FontAwesome5 name={fileIcon} size={22} color={fileColor} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.fileName} numberOfLines={2}>{selectedFile.name}</Text>
                  {selectedFile.size ? (
                    <Text style={s.fileSize}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => setSelectedFile(null)} style={{ padding: 4 }}>
                  <FontAwesome5 name="times" size={14} color={C.g400} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <FontAwesome5 name="cloud-upload-alt" size={28} color={C.g400} style={{ marginBottom: 8 }} />
                <Text style={s.filePickerTxt}>Tap to select a file</Text>
                <Text style={s.filePickerSub}>PDF, Word, Images supported</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Case selector */}
          <Text style={s.sectionLabel}>Select Case *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            style={{ maxHeight: 44, marginBottom: 20 }}
          >
            {cases.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[s.caseChip, uploadCaseId === c.id && s.caseChipActive]}
                onPress={() => setUploadCaseId(c.id)}
              >
                <FontAwesome5
                  name="briefcase"
                  size={10}
                  color={uploadCaseId === c.id ? C.white : C.g600}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[s.caseChipTxt, uploadCaseId === c.id && s.caseChipTxtActive]}
                  numberOfLines={1}
                >
                  {c.title || c.case_number || `Case ${c.id}`}
                </Text>
              </TouchableOpacity>
            ))}
            {cases.length === 0 && (
              <Text style={{ fontSize: 13, color: C.g400, paddingVertical: 10 }}>No cases available</Text>
            )}
          </ScrollView>

          {/* Upload button */}
          <TouchableOpacity
            style={[s.uploadBtn, (!selectedFile || !uploadCaseId || uploading) && s.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={!selectedFile || !uploadCaseId || uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <FontAwesome5 name="cloud-upload-alt" size={15} color={C.white} />
                <Text style={s.uploadBtnTxt}>Upload Document</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={uploading}>
            <Text style={s.cancelBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ClientDocumentsScreen({ navigation, route }) {
  const [cases, setCases]               = useState([]);
  const [docs, setDocs]                 = useState([]);
  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(route.params?.caseId || null);
  const [showUpload, setShowUpload]     = useState(false);
  const [fulfillingId, setFulfillingId] = useState(null);

  useEffect(() => {
    clientPortalAPI.cases()
      .then(data => setCases(data || []))
      .catch(console.error);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [docsRes, reqRes] = await Promise.allSettled([
        clientPortalAPI.documents(selectedCaseId),
        clientPortalAPI.documentRequests(),
      ]);
      if (docsRes.status === 'fulfilled') setDocs(docsRes.value || []);
      if (reqRes.status === 'fulfilled')  setRequests(reqRes.value || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCaseId]);

  const handleFulfillRequest = async (requestId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setFulfillingId(requestId);
      await clientPortalAPI.fulfillRequest(requestId, asset);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'FULFILLED' } : r));
      Alert.alert('Uploaded', 'Your document has been submitted successfully.');
      load();
    } catch (e) {
      Alert.alert('Upload Failed', e.message || 'Could not upload document.');
    } finally {
      setFulfillingId(null);
    }
  };

  useEffect(() => { load(); }, [load]);

  const newCount     = docs.filter(d => d.status === 'PENDING_REVIEW').length;
  const selectedCase = cases.find(c => c.id === selectedCaseId);

  const handleUploaded = () => {
    setShowUpload(false);
    load();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>My Documents</Text>
          <Text style={s.headerSub}>
            {selectedCase
              ? selectedCase.title || selectedCase.case_number
              : `${docs.length} document${docs.length !== 1 ? 's' : ''} shared`}
          </Text>
        </View>
        {newCount > 0 && (
          <View style={s.headerBadge}>
            <FontAwesome5 name="bell" size={10} color={C.white} />
            <Text style={s.headerBadgeTxt}>{newCount} new</Text>
          </View>
        )}
      </View>

      {/* Case filter chips */}
      {cases.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.caseFilter}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
        >
          <TouchableOpacity
            style={[s.caseChip, selectedCaseId === null && s.caseChipActive]}
            onPress={() => setSelectedCaseId(null)}
          >
            <FontAwesome5 name="layer-group" size={11} color={selectedCaseId === null ? C.white : C.g600} style={{ marginRight: 5 }} />
            <Text style={[s.caseChipTxt, selectedCaseId === null && s.caseChipTxtActive]}>All Cases</Text>
          </TouchableOpacity>
          {cases.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.caseChip, selectedCaseId === c.id && s.caseChipActive]}
              onPress={() => setSelectedCaseId(c.id)}
            >
              <FontAwesome5 name="briefcase" size={11} color={selectedCaseId === c.id ? C.white : C.g600} style={{ marginRight: 5 }} />
              <Text style={[s.caseChipTxt, selectedCaseId === c.id && s.caseChipTxtActive]} numberOfLines={1}>
                {c.title || c.case_number || `Case ${c.id}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* New docs banner */}
      {newCount > 0 && (
        <View style={s.newBanner}>
          <FontAwesome5 name="file-alt" size={13} color={C.primary} />
          <Text style={s.newBannerTxt}>
            {' '}{newCount} new document{newCount > 1 ? 's' : ''} available for review
          </Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
        >
          {/* Pending Requests */}
          {requests.filter(r => r.status === 'PENDING').length > 0 && (
            <View style={s.reqSection}>
              <View style={s.reqSectionHeader}>
                <FontAwesome5 name="exclamation-circle" size={13} color={C.amber600} />
                <Text style={s.reqSectionTitle}>
                  Documents Requested by Your Attorney
                </Text>
              </View>
              {requests.filter(r => r.status === 'PENDING').map(req => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onUpload={() => handleFulfillRequest(req.id)}
                  uploading={fulfillingId === req.id}
                />
              ))}
            </View>
          )}

          {docs.length === 0 ? (
            <View style={s.emptyBox}>
              <View style={s.emptyIconWrap}>
                <FontAwesome5 name="folder-open" size={32} color={C.g400} />
              </View>
              <Text style={s.emptyTitle}>No documents yet</Text>
              <Text style={s.emptyTxt}>
                {selectedCaseId
                  ? 'No documents found for this case'
                  : 'Documents shared by your attorney will appear here'}
              </Text>
              <TouchableOpacity style={s.emptyUploadBtn} onPress={() => setShowUpload(true)}>
                <FontAwesome5 name="cloud-upload-alt" size={13} color={C.primary} style={{ marginRight: 6 }} />
                <Text style={s.emptyUploadBtnTxt}>Upload a Document</Text>
              </TouchableOpacity>
            </View>
          ) : (
            docs.map((doc) => <DocCard key={doc.id} doc={doc} />)
          )}
        </ScrollView>
      )}

      {/* FAB — Upload */}
      <TouchableOpacity style={s.fab} onPress={() => setShowUpload(true)}>
        <FontAwesome5 name="cloud-upload-alt" size={20} color={C.white} />
      </TouchableOpacity>

      <UploadModal
        visible={showUpload}
        cases={cases}
        preselectedCaseId={selectedCaseId}
        onClose={() => setShowUpload(false)}
        onUploaded={handleUploaded}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.g50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 },

  header:         { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 18, fontWeight: '800', color: C.white },
  headerSub:      { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1, maxWidth: 200 },
  headerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amber600, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  headerBadgeTxt: { fontSize: 11, fontWeight: '700', color: C.white },

  caseFilter:        { maxHeight: 56, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.g100, flexGrow: 0 },
  caseChip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: C.g100, maxWidth: 180 },
  caseChipActive:    { backgroundColor: C.primary },
  caseChipTxt:       { fontSize: 12, fontWeight: '600', color: C.g600 },
  caseChipTxtActive: { color: C.white },

  newBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blue50, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.blue100 },
  newBannerTxt: { fontSize: 13, color: C.primary, fontWeight: '600', flex: 1 },

  docCard: {
    backgroundColor: C.white, borderRadius: 18, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.g100,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  docCardNew:  { borderColor: C.blue100, borderLeftWidth: 4, borderLeftColor: C.primary },
  docIconWrap: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  docName:     { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 6, flex: 1 },
  docMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  categoryChip:{ backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  docCategory: { fontSize: 11, color: C.primary, fontWeight: '600' },
  docSize:     { fontSize: 11, color: C.g400 },
  docDate:     { fontSize: 11, color: C.g400 },
  newBadge:    { backgroundColor: C.amber100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  newBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.amber600 },
  viewBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 8 },
  viewBtnTxt:  { fontSize: 11, fontWeight: '700', color: C.white },

  reqSection:       { backgroundColor: C.amber50, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.amber100 },
  reqSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reqSectionTitle:  { fontSize: 13, fontWeight: '800', color: C.amber600, flex: 1 },
  reqCard:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.amber100 },
  reqCardDone:      { borderColor: C.g200, opacity: 0.7 },
  reqIconWrap:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reqDesc:          { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 2 },
  reqCase:          { fontSize: 11, color: C.g500 },
  reqDate:          { fontSize: 10, color: C.g400, marginTop: 2 },
  reqUploadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 10 },
  reqUploadTxt:     { fontSize: 12, fontWeight: '700', color: C.white },
  reqDoneBadge:     { backgroundColor: C.green50, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginLeft: 10 },
  reqDoneTxt:       { fontSize: 11, fontWeight: '700', color: C.green600 },

  emptyBox:         { alignItems: 'center', paddingVertical: 64 },
  emptyIconWrap:    { width: 88, height: 88, borderRadius: 44, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle:       { fontSize: 17, fontWeight: '700', color: C.dark, marginBottom: 8 },
  emptyTxt:         { fontSize: 13, color: C.g400, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20, marginBottom: 20 },
  emptyUploadBtn:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.blue50, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: C.blue100 },
  emptyUploadBtnTxt:{ fontSize: 14, fontWeight: '700', color: C.primary },

  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.primary, shadowOpacity: 0.45, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  modalHandle:  { width: 40, height: 4, backgroundColor: C.g200, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { alignItems: 'center', marginBottom: 20 },
  modalIconWrap:{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 4 },
  modalSub:     { fontSize: 13, color: C.g400 },

  filePicker: {
    borderWidth: 2, borderColor: C.g200, borderStyle: 'dashed',
    borderRadius: 18, padding: 18, marginBottom: 20,
    backgroundColor: C.g50, alignItems: 'center',
  },
  fileIconWrap:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fileName:       { fontSize: 14, fontWeight: '700', color: C.dark, flex: 1 },
  fileSize:       { fontSize: 12, color: C.g400, marginTop: 2 },
  filePickerTxt:  { fontSize: 14, fontWeight: '700', color: C.g500, marginBottom: 4 },
  filePickerSub:  { fontSize: 12, color: C.g400 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.g600, marginBottom: 10 },

  uploadBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 15, marginBottom: 4 },
  uploadBtnDisabled: { backgroundColor: C.g200 },
  uploadBtnTxt:      { fontSize: 15, fontWeight: '700', color: C.white },

  cancelBtn:    { alignItems: 'center', paddingVertical: 12 },
  cancelBtnTxt: { fontSize: 14, fontWeight: '600', color: C.g500 },
});
