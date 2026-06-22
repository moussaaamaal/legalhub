import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, Image, Modal, TextInput, Linking, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { clientsAPI } from '../../services/api';
import CaseDetailsScreen from '../Cases/CaseDetailsScreen';
import InvoiceDetailsScreen from '../Invoices/InvoiceDetailsScreen';

const toCaseDetails = (raw) => ({
  _id:         raw.id,
  id:          raw.case_number || raw.id,
  title:       raw.title || 'Case',
  subtitle:    `${raw.case_type || ''} — ${(raw.status || '').replace(/_/g, ' ')}`,
  type:        raw.case_type || '',
  phase:       (raw.status || '').replace(/_/g, ' '),
  priority:    (raw.priority || 'NORMAL').toLowerCase(),
  status:      raw.status || '',
  filingDate:  raw.filing_date || '',
  court:       raw.court_name || '',
  judge:       raw.judge_name || '',
  prosecutor:  raw.opposing_counsel || '',
  attorney:    '',
  caseValue:   raw.estimated_value ? `$${Number(raw.estimated_value).toLocaleString()}` : '',
  description: raw.description || '',
  tags:        [raw.case_type, (raw.status || '').replace(/_/g, ' ')].filter(Boolean),
  nextHearing: raw.first_hearing_date
    ? { label: new Date(raw.first_hearing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), time: '—', room: '—', countdown: '—' }
    : null,
  stats:        { docs: 0, tasks: 0, events: 0, notes: 0 },
  timeTracking: { billable: 0, nonBillable: 0 },
  client:       { name: '', id: raw.client_id || '—', avatar: null, since: '', phone: '—', email: '—', address: '—', status: 'Active', tier: 'Standard' },
});

const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B', white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber600: '#D97706',
  green50: '#F0FDF4', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple600: '#9333EA',
  gold: '#F59E0B',
};

const TAG_META = {
  ACTIVE:   { label: 'Active',   color: C.green600,  bg: C.green50  },
  PENDING:  { label: 'Pending',  color: C.amber600,  bg: C.amber50  },
  PREMIUM:  { label: 'Premium',  color: C.purple600, bg: C.purple50 },
  VIP:      { label: 'VIP',      color: C.primary,   bg: C.blue50   },
  INACTIVE: { label: 'Inactive', color: C.g500,      bg: C.g100     },
};

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>
        <FontAwesome5 name={icon} size={13} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const STATUS_COLORS = {
  NEW:          { bg: C.blue50,   color: C.blue600   },
  INVESTIGATION:{ bg: C.amber50,  color: C.amber600  },
  PRE_TRIAL:    { bg: '#FFF7ED',  color: '#C2410C'   },
  TRIAL:        { bg: C.purple50, color: C.purple600 },
  APPEAL:       { bg: '#F0FDF4',  color: '#15803D'   },
  SETTLED:      { bg: C.green50,  color: C.green600  },
  CLOSED:       { bg: C.g100,     color: C.g500      },
  OPEN:         { bg: C.blue50,   color: C.blue600   },
  IN_PROGRESS:  { bg: C.amber50,  color: C.amber600  },
  WON:          { bg: C.green50,  color: C.green600  },
  LOST:         { bg: C.red50,    color: C.red600    },
};

const PRIORITY_COLORS = {
  URGENT: { bg: C.red50,    color: C.red600    },
  HIGH:   { bg: '#FFF7ED',  color: '#C2410C'   },
  MEDIUM: { bg: C.amber50,  color: C.amber600  },
  NORMAL: { bg: C.blue50,   color: C.blue600   },
  LOW:    { bg: C.g100,     color: C.g500      },
};

function CaseRow({ item }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.OPEN;
  const pc = item.priority ? (PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.NORMAL) : null;
  const progress = typeof item.progress_percent === 'number' ? item.progress_percent : null;

  return (
    <View style={s.caseCard}>
      {/* Row 1 : title + status */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.caseName} numberOfLines={2}>{item.title || 'Case'}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusPillTxt, { color: sc.color }]}>{item.status || 'OPEN'}</Text>
        </View>
      </View>

      {/* Row 2 : type + priority */}
      {(!!item.case_type || !!item.priority) && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {!!item.case_type && (
            <View style={s.metaChip}>
              <FontAwesome5 name="balance-scale" size={9} color={C.g500} style={{ marginRight: 4 }} />
              <Text style={s.metaChipTxt}>{item.case_type.replace(/_/g, ' ')}</Text>
            </View>
          )}
          {!!item.practice_area && (
            <View style={s.metaChip}>
              <FontAwesome5 name="tag" size={9} color={C.g500} style={{ marginRight: 4 }} />
              <Text style={s.metaChipTxt}>{item.practice_area}</Text>
            </View>
          )}
          {pc && (
            <View style={[s.metaChip, { backgroundColor: pc.bg }]}>
              <FontAwesome5 name="flag" size={9} color={pc.color} style={{ marginRight: 4 }} />
              <Text style={[s.metaChipTxt, { color: pc.color }]}>{item.priority}</Text>
            </View>
          )}
        </View>
      )}

      {/* Row 3 : progress bar */}
      {progress !== null && (
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={[s.caseSub, { fontSize: 10 }]}>Progress</Text>
            <Text style={[s.caseSub, { fontSize: 10, fontWeight: '700', color: C.primary }]}>{progress}%</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function InvoiceRow({ item, showCreator }) {
  const paid = item.status === 'PAID';
  const creatorName = item.creator?.full_name;
  return (
    <View style={s.caseRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.caseName} numberOfLines={1}>{item.invoice_number || 'Invoice'}</Text>
        <Text style={s.caseSub}>{item.due_date ? `Due: ${item.due_date.slice(0, 10)}` : ''}</Text>
        {showCreator && !!creatorName && (
          <Text style={[s.caseSub, { color: C.purple600, marginTop: 1 }]}>{creatorName}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[s.invoiceAmt, { color: paid ? C.green600 : C.amber600 }]}>
          {item.currency || 'SAR'} {Number(item.total_amount || 0).toFixed(2)}
        </Text>
        <View style={[s.statusPill, { backgroundColor: paid ? C.green50 : C.amber50 }]}>
          <Text style={[s.statusPillTxt, { color: paid ? C.green600 : C.amber600 }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );
}

function groupByCase(invoices) {
  const map = {};
  const order = [];
  for (const inv of invoices) {
    const key = inv.case_id || '__none__';
    if (!map[key]) {
      const cf = inv.case_file;
      map[key] = { caseTitle: cf?.title || cf?.case_number || null, items: [] };
      order.push(key);
    }
    map[key].items.push(inv);
  }
  return order.map(k => map[k]);
}

function InvoiceSubSection({ title, invoices, showCreator, onPressInvoice }) {
  if (invoices.length === 0) return null;
  const groups = groupByCase(invoices);
  return (
    <View style={s.subSection}>
      <View style={s.subSectionHeader}>
        <FontAwesome5
          name={showCreator ? 'users' : 'user-tie'}
          size={11}
          color={showCreator ? C.purple600 : C.primary}
        />
        <Text style={[s.subSectionTitle, { color: showCreator ? C.purple600 : C.primary }]}>{title}</Text>
        <View style={[s.countBadge, { backgroundColor: showCreator ? C.purple50 : C.blue100 }]}>
          <Text style={[s.countBadgeTxt, { color: showCreator ? C.purple600 : C.primary }]}>{invoices.length}</Text>
        </View>
      </View>
      {groups.map((g, gi) => (
        <View key={gi}>
          {!!g.caseTitle && (
            <View style={s.caseGroupLabel}>
              <FontAwesome5 name="folder-open" size={10} color={C.g500} />
              <Text style={s.caseGroupLabelTxt} numberOfLines={1}>{g.caseTitle}</Text>
            </View>
          )}
          {g.items.map(inv => (
            <TouchableOpacity key={inv.id} onPress={() => onPressInvoice(inv)} activeOpacity={0.75}>
              <InvoiceRow item={inv} showCreator={showCreator} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function ClientDetailsScreen({ navigation, route }) {
  const clientId = route?.params?.clientId;

  const [client,       setClient]       = useState(null);
  const [cases,        setCases]        = useState([]);
  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedCase,    setSelectedCase]    = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [updatingVip, setUpdatingVip] = useState(false);
  const [emailModal,   setEmailModal]   = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody,    setEmailBody]    = useState('');
  const [editModal,  setEditModal]  = useState(false);
  const [editForm,   setEditForm]   = useState({});
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [cl, cs, inv] = await Promise.all([
        clientsAPI.getById(clientId),
        clientsAPI.getCases(clientId),
        clientsAPI.getInvoices(clientId),
      ]);
      setClient(cl);
      setCases(cs || []);
      setInvoices(inv || []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleSetVip = useCallback(async () => {
    if (!client) return;
    const isVip = client.tag === 'VIP';
    const newTag = isVip ? 'ACTIVE' : 'VIP';
    const confirmMsg = isVip
      ? `Remove VIP status from ${client.first_name} ${client.last_name}?`
      : `Mark ${client.first_name} ${client.last_name} as VIP client?`;

    Alert.alert(
      isVip ? 'Remove VIP' : 'Mark as VIP',
      confirmMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isVip ? 'Remove VIP' : 'Make VIP',
          style: isVip ? 'destructive' : 'default',
          onPress: async () => {
            setUpdatingVip(true);
            try {
              const updated = await clientsAPI.update(clientId, { tag: newTag });
              setClient(updated);
              Alert.alert(
                'Success',
                isVip ? 'VIP status removed.' : `${client.first_name} is now a VIP client!`
              );
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to update client');
            } finally {
              setUpdatingVip(false);
            }
          },
        },
      ]
    );
  }, [client, clientId]);

  const openEdit = useCallback(() => {
    if (!client) return;
    setEditForm({
      first_name:      client.first_name || '',
      last_name:       client.last_name  || '',
      email:           client.email      || '',
      phone:           client.phone      || '',
      whatsapp_number: client.whatsapp_number || '',
      address:         client.address    || '',
      occupation:      client.occupation || '',
      company_name:    client.company_name || '',
      national_id:     client.national_id || '',
      nationality:     client.nationality || '',
      date_of_birth:   client.date_of_birth || '',
      gender:          client.gender     || '',
      notes:           client.notes      || '',
    });
    setEditModal(true);
  }, [client]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {};
      Object.entries(editForm).forEach(([k, v]) => {
        if (v !== (client[k] || '')) payload[k] = v || null;
      });
      if (Object.keys(payload).length === 0) { setEditModal(false); return; }
      const updated = await clientsAPI.update(clientId, payload);
      setClient(updated);
      setEditModal(false);
      Alert.alert('Saved', 'Client updated successfully.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }, [client, clientId, editForm]);

  const openEmailCompose = useCallback(() => {
    if (!client?.email) return;
    setEmailSubject('');
    setEmailBody('');
    setEmailModal(true);
  }, [client]);

  const sendEmail = useCallback(async () => {
    const to      = encodeURIComponent(client.email);
    const subject = encodeURIComponent(emailSubject.trim());
    const body    = encodeURIComponent(emailBody.trim());
    const url     = `mailto:${to}?subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Error', 'No email app found on this device.');
      return;
    }
    setEmailModal(false);
    await Linking.openURL(url);
  }, [client, emailSubject, emailBody]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.g50 }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Client Details</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.g500, fontSize: 15 }}>Client not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedInvoice) {
    return (
      <InvoiceDetailsScreen
        navigation={{ goBack: () => setSelectedInvoice(null), navigate: () => {} }}
        route={{ params: { invoice: selectedInvoice } }}
      />
    );
  }

  if (selectedCase) {
    return (
      <CaseDetailsScreen
        navigation={{ goBack: () => setSelectedCase(null), navigate: () => {} }}
        route={{ params: { caseData: selectedCase } }}
      />
    );
  }

  const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const tag      = (client.tag || 'ACTIVE').toUpperCase();
  const tagMeta  = TAG_META[tag] || TAG_META.ACTIVE;
  const isVip    = tag === 'VIP';
  const colors   = [C.primary, C.purple600, C.green600, C.amber600, C.red600];
  const avatarBg = colors[Math.abs((fullName.charCodeAt(0) || 65) - 65) % colors.length];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={16} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Client Details</Text>
          <TouchableOpacity style={s.backBtn} onPress={openEdit}>
            <FontAwesome5 name="pen" size={14} color={C.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* PROFILE CARD */}
        <View style={s.profileCard}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View style={{ position: 'relative' }}>
              {client.avatar_url ? (
                <Image source={{ uri: client.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={s.avatarTxt}>{getInitials(fullName)}</Text>
                </View>
              )}
              {isVip && (
                <View style={s.vipBadgeAbsolute}>
                  <FontAwesome5 name="crown" size={9} color={C.gold} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clientName}>{fullName}</Text>
              {!!client.occupation && <Text style={s.clientSub}>{client.occupation}</Text>}
              {!!client.company_name && <Text style={s.clientSub}>{client.company_name}</Text>}
              <View style={[s.tagPill, { backgroundColor: tagMeta.bg, marginTop: 6 }]}>
                {isVip && <FontAwesome5 name="crown" size={10} color={tagMeta.color} style={{ marginRight: 4 }} />}
                <Text style={[s.tagPillTxt, { color: tagMeta.color }]}>{tagMeta.label}</Text>
              </View>
            </View>
          </View>

          {/* VIP BUTTON */}
          <TouchableOpacity
            style={[s.vipBtn, isVip && s.vipBtnActive]}
            onPress={handleSetVip}
            disabled={updatingVip}
          >
            {updatingVip ? (
              <ActivityIndicator size="small" color={isVip ? C.amber600 : C.white} />
            ) : (
              <>
                <FontAwesome5 name="crown" size={14} color={isVip ? C.amber600 : C.white} style={{ marginRight: 8 }} />
                <Text style={[s.vipBtnTxt, isVip && s.vipBtnTxtActive]}>
                  {isVip ? 'Remove VIP Status' : 'Mark as VIP'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* SEND EMAIL BUTTON */}
          <TouchableOpacity style={s.inviteBtn} onPress={openEmailCompose} disabled={!client?.email}>
            <FontAwesome5 name="envelope" size={13} color={C.primary} style={{ marginRight: 8 }} />
            <Text style={s.inviteBtnTxt}>Send Email</Text>
          </TouchableOpacity>
        </View>

        {/* CONTACT INFO */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Contact Information</Text>
          <InfoRow icon="envelope"    label="Email"       value={client.email} />
          <InfoRow icon="phone"       label="Phone"       value={client.phone} />
          <InfoRow icon="whatsapp"    label="WhatsApp"    value={client.whatsapp_number} />
          <InfoRow icon="map-marker-alt" label="Address"  value={client.address} />
        </View>

        {/* PERSONAL INFO */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Personal Information</Text>
          <InfoRow icon="id-card"     label="National ID"  value={client.national_id} />
          <InfoRow icon="globe"       label="Nationality"  value={client.nationality} />
          <InfoRow icon="birthday-cake" label="Date of Birth" value={client.date_of_birth} />
          <InfoRow icon="venus-mars"  label="Gender"       value={client.gender} />
          <InfoRow icon="building"    label="Client Type"  value={client.client_type} />
        </View>

        {/* NOTES */}
        {!!client.notes && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Notes</Text>
            <Text style={s.notesText}>{client.notes}</Text>
          </View>
        )}

        {/* CASES */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Cases</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeTxt}>{cases.length}</Text>
            </View>
          </View>
          {cases.length === 0 ? (
            <Text style={s.emptyTxt}>No cases found</Text>
          ) : (
            cases.map((c) => (
              <TouchableOpacity key={c.id} onPress={() => setSelectedCase(toCaseDetails(c))} activeOpacity={0.75}>
                <CaseRow item={c} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* INVOICES */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Invoices</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeTxt}>{invoices.length}</Text>
            </View>
          </View>
          {invoices.length === 0 ? (
            <Text style={s.emptyTxt}>No invoices found</Text>
          ) : (
            <>
              <InvoiceSubSection
                title="My Invoices"
                invoices={invoices.filter(i => i.is_mine)}
                showCreator={false}
                onPressInvoice={(inv) => setSelectedInvoice({ ...inv, client })}
              />
              <InvoiceSubSection
                title="Colleagues"
                invoices={invoices.filter(i => !i.is_mine)}
                showCreator={true}
                onPressInvoice={(inv) => setSelectedInvoice({ ...inv, client })}
              />
            </>
          )}
        </View>

      </ScrollView>

      {/* EDIT MODAL */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView style={ed.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={ed.sheet}>
            {/* Header */}
            <View style={ed.sheetHeader}>
              <TouchableOpacity onPress={() => setEditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <FontAwesome5 name="times" size={16} color={C.g500} />
              </TouchableOpacity>
              <Text style={ed.sheetTitle}>Edit Client</Text>
              <TouchableOpacity onPress={saveEdit} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Text style={ed.saveBtn}>Save</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {[
                { key: 'first_name',      label: 'First Name',    icon: 'user'            },
                { key: 'last_name',       label: 'Last Name',     icon: 'user'            },
                { key: 'email',           label: 'Email',         icon: 'envelope',  keyboardType: 'email-address' },
                { key: 'phone',           label: 'Phone',         icon: 'phone',     keyboardType: 'phone-pad'     },
                { key: 'whatsapp_number', label: 'WhatsApp',      icon: 'whatsapp',  keyboardType: 'phone-pad'     },
                { key: 'address',         label: 'Address',       icon: 'map-marker-alt'  },
                { key: 'occupation',      label: 'Occupation',    icon: 'briefcase'       },
                { key: 'company_name',    label: 'Company',       icon: 'building'        },
                { key: 'national_id',     label: 'National ID',   icon: 'id-card'         },
                { key: 'nationality',     label: 'Nationality',   icon: 'flag'            },
                { key: 'date_of_birth',   label: 'Date of Birth', icon: 'birthday-cake', placeholder: 'YYYY-MM-DD' },
              ].map(({ key, label, icon, keyboardType, placeholder }) => (
                <View key={key} style={ed.field}>
                  <View style={ed.fieldIconWrap}>
                    <FontAwesome5 name={icon} size={13} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ed.fieldLabel}>{label}</Text>
                    <TextInput
                      style={ed.fieldInput}
                      value={editForm[key] || ''}
                      onChangeText={v => setEditForm(f => ({ ...f, [key]: v }))}
                      placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                      placeholderTextColor={C.g400}
                      keyboardType={keyboardType || 'default'}
                      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
                    />
                  </View>
                </View>
              ))}

              {/* Gender */}
              <View style={ed.field}>
                <View style={ed.fieldIconWrap}>
                  <FontAwesome5 name="venus-mars" size={13} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ed.fieldLabel}>Gender</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    {[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }].map(g => (
                      <TouchableOpacity
                        key={g.value}
                        style={[ed.chip, editForm.gender === g.value && ed.chipActive]}
                        onPress={() => setEditForm(f => ({ ...f, gender: f.gender === g.value ? '' : g.value }))}
                      >
                        <Text style={[ed.chipTxt, editForm.gender === g.value && ed.chipTxtActive]}>{g.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Notes */}
              <View style={[ed.field, { alignItems: 'flex-start' }]}>
                <View style={[ed.fieldIconWrap, { marginTop: 2 }]}>
                  <FontAwesome5 name="sticky-note" size={13} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ed.fieldLabel}>Notes</Text>
                  <TextInput
                    style={[ed.fieldInput, { minHeight: 80, textAlignVertical: 'top', marginTop: 4 }]}
                    value={editForm.notes || ''}
                    onChangeText={v => setEditForm(f => ({ ...f, notes: v }))}
                    placeholder="Internal notes…"
                    placeholderTextColor={C.g400}
                    multiline
                  />
                </View>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EMAIL COMPOSE MODAL */}
      <Modal visible={emailModal} transparent animationType="slide" onRequestClose={() => setEmailModal(false)}>
        <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={em.sheet}>
            <View style={em.sheetHeader}>
              <Text style={em.sheetTitle}>New Email</Text>
              <TouchableOpacity onPress={() => setEmailModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <FontAwesome5 name="times" size={16} color={C.g500} />
              </TouchableOpacity>
            </View>

            <View style={em.field}>
              <Text style={em.fieldLabel}>To</Text>
              <Text style={em.fieldValueStatic}>{client?.email}</Text>
            </View>

            <View style={em.divider} />

            <View style={em.field}>
              <Text style={em.fieldLabel}>Subject</Text>
              <TextInput
                style={em.fieldInput}
                placeholder="Enter subject"
                placeholderTextColor={C.g400}
                value={emailSubject}
                onChangeText={setEmailSubject}
                returnKeyType="next"
              />
            </View>

            <View style={em.divider} />

            <TextInput
              style={em.bodyInput}
              placeholder="Write your message…"
              placeholderTextColor={C.g400}
              value={emailBody}
              onChangeText={setEmailBody}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[em.sendBtn, !emailSubject.trim() && em.sendBtnDisabled]}
              onPress={sendEmail}
              disabled={!emailSubject.trim()}
            >
              <FontAwesome5 name="paper-plane" size={14} color={C.white} style={{ marginRight: 8 }} />
              <Text style={em.sendBtnTxt}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.primary },
  scroll:     { flex: 1, backgroundColor: C.g50 },
  header:     { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '800', color: C.white },

  profileCard:{ backgroundColor: C.white, margin: 16, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  avatar:     { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:  { color: C.white, fontWeight: '800', fontSize: 22 },
  vipBadgeAbsolute: { position: 'absolute', top: -4, right: -4, backgroundColor: C.white, borderRadius: 8, padding: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  clientName: { fontSize: 18, fontWeight: '800', color: C.dark },
  clientSub:  { fontSize: 13, color: C.g500, marginTop: 1 },
  tagPill:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagPillTxt: { fontSize: 12, fontWeight: '700' },

  vipBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, marginTop: 16 },
  vipBtnActive:{ backgroundColor: C.amber50, borderWidth: 1.5, borderColor: C.amber600 },
  vipBtnTxt:  { color: C.white, fontWeight: '700', fontSize: 14 },
  vipBtnTxtActive: { color: C.amber600 },
  inviteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue50, borderRadius: 14, paddingVertical: 12, marginTop: 10 },
  inviteBtnTxt:{ color: C.primary, fontWeight: '600', fontSize: 14 },

  card:       { backgroundColor: C.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: C.dark, marginBottom: 14 },
  countBadge: { backgroundColor: C.blue100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeTxt: { fontSize: 12, fontWeight: '700', color: C.primary },

  infoRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  infoIconWrap:{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  infoLabel:  { fontSize: 11, color: C.g400, marginBottom: 2 },
  infoValue:  { fontSize: 14, fontWeight: '600', color: C.dark },

  notesText:  { fontSize: 14, color: C.g600, lineHeight: 20 },

  caseRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.g100 },
  caseCard:   { paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: C.g100 },
  caseName:   { fontSize: 13, fontWeight: '700', color: C.dark },
  caseSub:    { fontSize: 11, color: C.g400, marginTop: 2 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g100, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metaChipTxt:{ fontSize: 10, fontWeight: '600', color: C.g500 },
  caseDetail: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  caseDetailTxt: { fontSize: 11, color: C.g500, flex: 1 },
  progressTrack: { height: 5, backgroundColor: C.g100, borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 5, backgroundColor: C.primary, borderRadius: 4 },
  invoiceAmt: { fontSize: 13, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillTxt: { fontSize: 11, fontWeight: '600' },

  emptyTxt:   { fontSize: 13, color: C.g400, textAlign: 'center', paddingVertical: 12 },

  subSection:      { marginTop: 4, marginBottom: 4 },
  subSectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 8 },
  subSectionTitle: { fontSize: 12, fontWeight: '700', flex: 1 },
  caseGroupLabel:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 4, backgroundColor: C.g50, borderRadius: 6, marginBottom: 2, marginTop: 4 },
  caseGroupLabelTxt: { fontSize: 11, color: C.g500, fontWeight: '600', flex: 1 },
});

const ed = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '92%' },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle:   { fontSize: 17, fontWeight: '800', color: C.dark },
  saveBtn:      { fontSize: 15, fontWeight: '700', color: C.primary },
  field:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.g100 },
  fieldIconWrap:{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fieldLabel:   { fontSize: 11, color: C.g400, marginBottom: 2 },
  fieldInput:   { fontSize: 14, color: C.dark, paddingVertical: 2 },
  chip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.g100, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive:   { backgroundColor: C.blue50, borderColor: C.primary },
  chipTxt:      { fontSize: 13, fontWeight: '600', color: C.g600 },
  chipTxtActive:{ color: C.primary, fontWeight: '700' },
});

const em = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 12, maxHeight: '85%' },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle:      { fontSize: 17, fontWeight: '800', color: C.dark },
  field:           { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  fieldLabel:      { fontSize: 13, color: C.g500, width: 56 },
  fieldValueStatic:{ fontSize: 14, color: C.dark, flex: 1 },
  fieldInput:      { fontSize: 14, color: C.dark, flex: 1, paddingVertical: 4 },
  divider:         { height: 1, backgroundColor: C.g100 },
  bodyInput:       { fontSize: 14, color: C.dark, minHeight: 140, paddingTop: 4 },
  sendBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnTxt:      { color: C.white, fontWeight: '700', fontSize: 15 },
});
