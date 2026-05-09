import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { billingAPI, clientsAPI, casesAPI } from '../../services/api';

const COLORS = {
  teal: '#0F766E', tealLight: '#14B8A6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray300: '#D1D5DB', gray400: '#9CA3AF',
  gray500: '#6B7280', gray600: '#4B5563',
};

const SERVICE_TEMPLATES = [
  { label: 'Court Representation', rate: '350' },
  { label: 'Legal Consultation',   rate: '150' },
  { label: 'Document Drafting',    rate: '200' },
  { label: 'Research & Analysis',  rate: '180' },
];

const TAX_RATES = [
  { label: '0%',  value: 0  },
  { label: '5%',  value: 5  },
  { label: '10%', value: 10 },
  { label: '15%', value: 15 },
  { label: '20%', value: 20 },
];

// ─── Mini Calendar Picker (teal theme) ────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const buildCalendarGrid = (year, month) => {
  const first       = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = first - 1; i >= 0; i--) cells.push({ d: String(daysInPrev - i), prev: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d: String(d), cur: true });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ d: String(next++), next: true });
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

const fmtDate = (d) => `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}`;

function MiniCalPicker({ selectedDate, onSelect, onClose }) {
  const [viewYear,  setViewYear]  = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const grid  = buildCalendarGrid(viewYear, viewMonth);
  const today = new Date();
  const prevM = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextM = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  return (
    <View style={cp.picker}>
      <View style={cp.header}>
        <TouchableOpacity onPress={prevM} style={cp.navBtn}><FontAwesome5 name="chevron-left"  size={13} color={COLORS.white} /></TouchableOpacity>
        <Text style={cp.title}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextM} style={cp.navBtn}><FontAwesome5 name="chevron-right" size={13} color={COLORS.white} /></TouchableOpacity>
      </View>
      <View style={{ padding: 8 }}>
        <View style={cp.row}>
          {DAY_NAMES.map(d => <Text key={d} style={cp.dayLabel}>{d}</Text>)}
        </View>
        {grid.map((row, ri) => (
          <View key={ri} style={cp.row}>
            {row.map((cell, ci) => {
              const isSelected = cell.cur &&
                Number(cell.d) === selectedDate.getDate() &&
                viewMonth === selectedDate.getMonth() &&
                viewYear  === selectedDate.getFullYear();
              const isToday = cell.cur &&
                Number(cell.d) === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear  === today.getFullYear();
              return (
                <TouchableOpacity
                  key={ci}
                  style={[cp.cell,
                    isSelected && { backgroundColor: COLORS.teal },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: COLORS.teal },
                  ]}
                  disabled={!cell.cur}
                  onPress={() => { onSelect(new Date(viewYear, viewMonth, Number(cell.d))); onClose(); }}
                >
                  <Text style={[cp.cellText,
                    (cell.prev || cell.next) && { color: COLORS.gray300 },
                    isSelected && { color: COLORS.white, fontWeight: '700' },
                  ]}>
                    {cell.d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const cp = StyleSheet.create({
  picker:   { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.teal, paddingHorizontal: 12, paddingVertical: 10 },
  navBtn:   { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  title:    { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  row:      { flexDirection: 'row' },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: COLORS.gray500, paddingVertical: 4 },
  cell:     { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, margin: 1 },
  cellText: { fontSize: 12, color: COLORS.dark },
});

// ─── Main Screen ──────────────────────────────────────────────────────────
export default function InvoiceScreen({ navigation }) {
  const [form, setForm] = useState({
    client_id: null,
    case_id:   null,
    taxRate:   0,
    notes:     '',
    currency:  'USD',
  });
  const [items, setItems] = useState([
    { id: 1, desc: '', quantity: '1', rate: '', amount: 0 },
  ]);
  const [dueDate,     setDueDate]     = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; });
  const [showDueCal,  setShowDueCal]  = useState(false);

  const [clients,  setClients]  = useState([]);
  const [cases,    setCases]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  // After first save, keep invoice id for the Send action
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Load clients and cases from API
  useEffect(() => {
    clientsAPI.list().then(data => setClients(Array.isArray(data) ? data : [])).catch(() => {});
    casesAPI.list().then(data => setCases(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // ── Item helpers ────────────────────────────────────────────────────────
  const updateItem = (id, key, val) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [key]: val };
      updated.amount = parseFloat(updated.quantity || 0) * parseFloat(updated.rate || 0);
      return updated;
    }));
  };

  const addItem = (template = null) => {
    setItems(prev => [...prev, {
      id:       Date.now(),
      desc:     template ? template.label : '',
      quantity: '1',
      rate:     template ? template.rate  : '',
      amount:   template ? parseFloat(template.rate) : 0,
    }]);
  };

  const removeItem = (id) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── Totals ───────────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const taxAmt   = subtotal * (form.taxRate / 100);
  const total    = subtotal + taxAmt;
  const fmt      = (n) => `$${n.toFixed(2)}`;

  // ── Build API payload ────────────────────────────────────────────────────
  const buildPayload = () => {
    if (!form.client_id) throw new Error('Please select a client.');
    const validItems = items.filter(i => i.desc.trim());
    if (!validItems.length) throw new Error('Add at least one service item with a description.');

    return {
      client_id: form.client_id,
      case_id:   form.case_id || undefined,
      items:     validItems.map(i => ({
        description: i.desc.trim(),
        quantity:    parseFloat(i.quantity) || 1,
        unit_price:  parseFloat(i.rate)     || 0,
      })),
      tax_rate: form.taxRate,
      due_date: dueDate.toISOString().split('T')[0],
      currency: form.currency,
      notes:    form.notes.trim() || undefined,
    };
  };

  // ── Save (DRAFT) ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    let payload;
    try { payload = buildPayload(); } catch (e) { Alert.alert('Validation', e.message); return; }

    setLoading(true);
    try {
      const inv = await billingAPI.createInvoice(payload);
      setSavedInvoiceId(inv.id);
      Alert.alert('Saved', `Invoice ${inv.invoice_number} saved as draft.`, [
        { text: 'OK', onPress: () => navigation?.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save invoice.');
    } finally {
      setLoading(false);
    }
  };

  // ── Send (creates if needed, then sends) ─────────────────────────────────
  const handleSend = async () => {
    setLoading(true);
    try {
      let invId = savedInvoiceId;
      if (!invId) {
        let payload;
        try { payload = buildPayload(); } catch (e) { Alert.alert('Validation', e.message); setLoading(false); return; }
        const inv = await billingAPI.createInvoice(payload);
        invId = inv.id;
        setSavedInvoiceId(invId);
      }
      await billingAPI.sendInvoice(invId);
      Alert.alert('Sent', 'Invoice sent to the client.', [
        { text: 'OK', onPress: () => navigation?.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not send invoice.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const selectedClient = clients.find(c => c.id === form.client_id);
  const filteredCases  = cases.filter(c =>
    !form.client_id || c.client_id === form.client_id
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.teal} />

      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
            <FontAwesome5 name="arrow-left" size={16} color={COLORS.white} />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle}>Create Invoice</Text>
            <Text style={s.headerSub}>Track payments & billing</Text>
          </View>
          <View style={s.backBtn} />
        </View>
      </View>

      {/* Summary Banner */}
      <View style={s.summaryBanner}>
        <View>
          <Text style={s.invNumLabel}>Total Amount</Text>
          <Text style={s.totalAmount}>{fmt(total)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.invNumLabel}>Due Date</Text>
          <Text style={s.invNum}>{fmtDate(dueDate)}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Bill To ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Bill To</Text>
          <Text style={s.label}>Client *</Text>

          {clients.length === 0 ? (
            <Text style={{ color: COLORS.gray400, fontSize: 13, marginBottom: 8 }}>Loading clients…</Text>
          ) : (
            <View style={s.clientList}>
              {clients.map(c => {
                const name     = `${c.first_name} ${c.last_name}`;
                const initials = `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`;
                const active   = form.client_id === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.clientChip, active && s.clientChipActive]}
                    onPress={() => { update('client_id', c.id); update('case_id', null); }}
                  >
                    <View style={[s.clientAvatar, active && { backgroundColor: COLORS.teal }]}>
                      <Text style={[s.clientAvatarText, active && { color: COLORS.white }]}>{initials}</Text>
                    </View>
                    <Text style={[s.clientChipText, active && s.clientChipTextActive]}>{name}</Text>
                    {active && <FontAwesome5 name="check" size={11} color={COLORS.teal} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Related Case — only shown if cases exist for this client */}
          {filteredCases.length > 0 && (
            <>
              <Text style={[s.label, { marginTop: 12 }]}>Related Case</Text>
              {filteredCases.map(c => {
                const active = form.case_id === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.caseRow, active && s.caseRowActive]}
                    onPress={() => update('case_id', active ? null : c.id)}
                  >
                    <View style={[s.radio, active && s.radioActive]}>
                      {active && <View style={s.radioDot} />}
                    </View>
                    <Text style={[s.caseText, active && s.caseTextActive]}>
                      {c.case_number} — {c.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        {/* ── Due Date ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Invoice Dates</Text>
          <View style={s.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Issue Date</Text>
              <View style={s.dateInput}>
                <FontAwesome5 name="calendar" size={13} color={COLORS.teal} />
                <Text style={s.dateInputText}>{fmtDate(new Date())}</Text>
              </View>
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Due Date *</Text>
              <TouchableOpacity style={s.dateInput} onPress={() => setShowDueCal(v => !v)}>
                <FontAwesome5 name="calendar-alt" size={13} color={COLORS.teal} />
                <Text style={s.dateInputText}>{fmtDate(dueDate)}</Text>
                <FontAwesome5
                  name={showDueCal ? 'chevron-up' : 'chevron-down'}
                  size={10} color={COLORS.gray400}
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>
            </View>
          </View>
          {showDueCal && (
            <MiniCalPicker
              selectedDate={dueDate}
              onSelect={setDueDate}
              onClose={() => setShowDueCal(false)}
            />
          )}
        </View>

        {/* ── Line Items ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Services / Line Items</Text>

          {/* Templates */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {SERVICE_TEMPLATES.map(t => (
              <TouchableOpacity key={t.label} style={s.templateChip} onPress={() => addItem(t)}>
                <FontAwesome5 name="plus" size={10} color={COLORS.teal} />
                <Text style={s.templateText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {items.map((item, idx) => (
            <View key={item.id} style={s.lineItem}>
              <View style={s.lineItemHeader}>
                <Text style={s.lineItemNum}>Item {idx + 1}</Text>
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <FontAwesome5 name="trash" size={12} color="#DC2626" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.input, { marginBottom: 8 }]}
                placeholder="Service description"
                placeholderTextColor={COLORS.gray400}
                value={item.desc}
                onChangeText={v => updateItem(item.id, 'desc', v)}
              />
              <View style={s.lineItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Qty</Text>
                  <TextInput
                    style={s.miniInput}
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={v => updateItem(item.id, 'quantity', v)}
                  />
                </View>
                <View style={{ flex: 2, marginHorizontal: 8 }}>
                  <Text style={s.miniLabel}>Rate ($)</Text>
                  <TextInput
                    style={s.miniInput}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={COLORS.gray400}
                    value={item.rate}
                    onChangeText={v => updateItem(item.id, 'rate', v)}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={s.miniLabel}>Amount</Text>
                  <View style={s.amountBox}>
                    <Text style={s.amountText}>{fmt(item.amount)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addItemBtn} onPress={() => addItem()}>
            <FontAwesome5 name="plus" size={13} color={COLORS.teal} />
            <Text style={s.addItemText}>Add Another Item</Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Summary</Text>

          <View style={s.totalRow}>
            <Text style={s.totalKey}>Subtotal</Text>
            <Text style={s.totalVal}>{fmt(subtotal)}</Text>
          </View>

          <Text style={[s.label, { marginTop: 14 }]}>Tax Rate</Text>
          <View style={s.taxRow}>
            {TAX_RATES.map(t => (
              <TouchableOpacity
                key={t.value}
                style={[s.taxBtn, form.taxRate === t.value && s.taxBtnActive]}
                onPress={() => update('taxRate', t.value)}
              >
                <Text style={[s.taxText, form.taxRate === t.value && s.taxTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.divider} />
          {taxAmt > 0 && (
            <View style={[s.totalRow, { marginTop: 4 }]}>
              <Text style={s.totalKey}>Tax ({form.taxRate}%)</Text>
              <Text style={s.totalVal}>{fmt(taxAmt)}</Text>
            </View>
          )}
          <View style={[s.totalRow, { marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: COLORS.teal }]}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.dark }}>Total Due</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.teal }}>{fmt(total)}</Text>
          </View>
        </View>

        {/* ── Notes ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Payment Notes</Text>
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
            placeholder="Payment terms, bank details, notes..."
            placeholderTextColor={COLORS.gray400}
            value={form.notes}
            onChangeText={v => update('notes', v)}
            multiline
          />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btnOutline, loading && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={COLORS.teal} />
            : <>
                <FontAwesome5 name="paper-plane" size={14} color={COLORS.teal} />
                <Text style={s.btnOutlineText}>Send</Text>
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnPrimary, { flex: 1 }, loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <>
                <FontAwesome5 name="save" size={14} color={COLORS.white} />
                <Text style={[s.btnPrimaryText, { marginLeft: 8 }]}>Save Invoice</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: COLORS.teal },
  scroll:            { flex: 1, backgroundColor: COLORS.gray50 },
  header:            { backgroundColor: COLORS.teal, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:           { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:       { fontSize: 17, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  headerSub:         { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  summaryBanner:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.teal, paddingHorizontal: 20, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  invNumLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  invNum:            { fontSize: 14, fontWeight: '700', color: COLORS.white },
  totalAmount:       { fontSize: 26, fontWeight: '800', color: COLORS.white },
  section:           { margin: 16, backgroundColor: COLORS.white, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle:      { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 14 },
  label:             { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  input:             { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.dark, backgroundColor: COLORS.white },
  clientList:        { gap: 8, marginBottom: 8 },
  clientChip:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.gray200 },
  clientChipActive:  { borderColor: COLORS.teal, backgroundColor: '#F0FDFA' },
  clientAvatar:      { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText:  { fontSize: 12, fontWeight: '800', color: COLORS.gray600 },
  clientChipText:    { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  clientChipTextActive: { color: COLORS.teal },
  caseRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1.5, borderColor: COLORS.gray200 },
  caseRowActive:     { borderColor: COLORS.teal, backgroundColor: '#F0FDFA' },
  radio:             { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.gray300, alignItems: 'center', justifyContent: 'center' },
  radioActive:       { borderColor: COLORS.teal },
  radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.teal },
  caseText:          { fontSize: 13, color: COLORS.gray600, flex: 1 },
  caseTextActive:    { color: COLORS.teal, fontWeight: '600' },
  dateRow:           { flexDirection: 'row' },
  dateInput:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  dateInputText:     { fontSize: 13, color: COLORS.dark, fontWeight: '500', flex: 1 },
  templateChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.teal, backgroundColor: '#F0FDFA' },
  templateText:      { fontSize: 11, fontWeight: '600', color: COLORS.teal },
  lineItem:          { backgroundColor: COLORS.gray50, borderRadius: 14, padding: 12, marginBottom: 10 },
  lineItemHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineItemNum:       { fontSize: 12, fontWeight: '700', color: COLORS.gray500 },
  lineItemRow:       { flexDirection: 'row', alignItems: 'flex-end' },
  miniLabel:         { fontSize: 11, fontWeight: '600', color: COLORS.gray500, marginBottom: 4 },
  miniInput:         { borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: COLORS.dark, backgroundColor: COLORS.white },
  amountBox:         { borderRadius: 10, backgroundColor: '#F0FDFA', paddingHorizontal: 10, paddingVertical: 9, alignItems: 'flex-end' },
  amountText:        { fontSize: 13, fontWeight: '700', color: COLORS.teal },
  addItemBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.teal, marginTop: 4 },
  addItemText:       { fontSize: 13, fontWeight: '700', color: COLORS.teal },
  totalRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalKey:          { fontSize: 14, color: COLORS.gray600 },
  totalVal:          { fontSize: 14, fontWeight: '700', color: COLORS.dark },
  taxRow:            { flexDirection: 'row', gap: 8, marginBottom: 8 },
  taxBtn:            { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, alignItems: 'center' },
  taxBtnActive:      { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  taxText:           { fontSize: 12, fontWeight: '700', color: COLORS.gray600 },
  taxTextActive:     { color: COLORS.white },
  divider:           { height: 1, backgroundColor: COLORS.gray100, marginVertical: 12 },
  footer:            { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 16, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  btnPrimary:        { flexDirection: 'row', backgroundColor: COLORS.teal, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:    { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnOutline:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.teal },
  btnOutlineText:    { fontSize: 13, fontWeight: '700', color: COLORS.teal },
});
