import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  StyleSheet, SafeAreaView, StatusBar, Image, Dimensions, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { casesAPI, tasksAPI, documentsAPI, notesAPI, calendarAPI, billingAPI, firmAPI } from '../../services/api';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

const { width: W } = Dimensions.get('window');

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const C = {
  primary:     '#1E40AF',
  secondary:   '#3B82F6',
  dark:        '#1E293B',
  white:       '#FFFFFF',
  bg:          '#EEF2F7',

  slate900:    '#0F172A',
  slate800:    '#1E293B',
  slate700:    '#334155',

  g50:         '#F9FAFB',
  g100:        '#F3F4F6',
  g200:        '#E5E7EB',
  g300:        '#D1D5DB',
  g400:        '#9CA3AF',
  g500:        '#6B7280',
  g600:        '#4B5563',

  red50:       '#FEF2F2',
  red100:      '#FEE2E2',
  red500:      '#EF4444',
  red600:      '#DC2626',

  amber50:     '#FFFBEB',
  amber100:    '#FEF3C7',
  amber600:    '#D97706',

  green50:     '#F0FDF4',
  green100:    '#DCFCE7',
  green600:    '#16A34A',

  blue50:      '#EFF6FF',
  blue100:     '#DBEAFE',

  purple50:    '#FAF5FF',
  purple100:   '#F3E8FF',
  purple500:   '#A855F7',
  purple600:   '#9333EA',

  indigo600:   '#4F46E5',
  teal600:     '#0D9488',

  onDark:      '#FFFFFF',
  onDarkSub:   'rgba(255,255,255,0.62)',
  onDarkMuted: 'rgba(255,255,255,0.32)',
  glass:       'rgba(255,255,255,0.10)',
  glassB:      'rgba(255,255,255,0.18)',
};

// ─── MOCK DATA ─────────────────────────────────────────────────────────────────
const CASE = {
  id:          'CR-2024-1247',
  title:       'State vs. Johnson',
  subtitle:    'Criminal Defense — Assault Charges',
  type:        'Criminal Law',
  phase:       'Trial Phase',
  priority:    'urgent',
  status:      'Active',
  filingDate:  '2024-01-15',
  court:       'Manhattan Criminal Court',
  judge:       'Hon. Patricia Williams',
  prosecutor:  'DA Robert Chen',
  attorney:    'Sarah Williams - Lead Attorney',
  caseValue:   '$45,000',
  description: 'Client is charged with assault in the second degree following an altercation at a local establishment. The prosecution alleges intentional harm, while the defense maintains self-defense. Key evidence includes surveillance footage and witness testimonies.',
  tags:        ['Criminal Law', 'Self Defense', 'Trial'],
  nextHearing: { label: 'Today', time: '09:30 AM', room: 'Room 305', countdown: '2h 47m' },
  stats:       { docs: 23, tasks: 5, events: 8, notes: 12 },
  timeTracking:{ billable: 47.5, nonBillable: 12.3 },
  client: {
    name:    'Marcus Johnson',
    id:      'CL-2024-089',
    avatar:  'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-8.jpg',
    since:   'January 15, 2024',
    phone:   '+1 (555) 234-5678',
    email:   'm.johnson@email.com',
    address: '742 Evergreen Terrace, Springfield',
    status:  'Active',
    tier:    'Verified',
  },
};

const PRIORITY = {
  urgent: { label: 'Urgent', color: C.red600,   bg: C.red50,    icon: 'fire',                dot: '#EF4444' },
  high:   { label: 'High',   color: C.red600,   bg: C.red50,    icon: 'exclamation-triangle', dot: '#EF4444' },
  medium: { label: 'Medium', color: C.amber600, bg: C.amber50,  icon: 'minus-circle',         dot: '#F59E0B' },
  normal: { label: 'Normal', color: C.green600, bg: C.green50,  icon: 'check-circle',         dot: '#22C55E' },
  low:    { label: 'Low',    color: C.green600, bg: C.green50,  icon: 'check-circle',         dot: '#22C55E' },
};

const TABS = [
  { key: 'overview',  icon: 'layer-group',  label: 'Overview'  },
  { key: 'documents', icon: 'file-alt',     label: 'Documents' },
  { key: 'tasks',     icon: 'check-square', label: 'Tasks'     },
  { key: 'invoices',  icon: 'file-invoice-dollar', label: 'Invoices' },
  { key: 'notes',     icon: 'sticky-note',  label: 'Notes'     },
  { key: 'team',      icon: 'users',        label: 'Team'      },
  { key: 'timeline',  icon: 'stream',       label: 'Timeline'  },
];

// ─── RICH TEXT (markdown inline renderer) ─────────────────────────────────────
const NOTE_COLORS = [
  { id: 'yellow', bg: '#FEF9C3', border: '#FDE047', dot: '#EAB308' },
  { id: 'blue',   bg: '#DBEAFE', border: '#93C5FD', dot: '#3B82F6' },
  { id: 'green',  bg: '#DCFCE7', border: '#86EFAC', dot: '#22C55E' },
  { id: 'pink',   bg: '#FCE7F3', border: '#F9A8D4', dot: '#EC4899' },
  { id: 'purple', bg: '#F3E8FF', border: '#D8B4FE', dot: '#A855F7' },
  { id: 'orange', bg: '#FFEDD5', border: '#FED7AA', dot: '#F97316' },
];
const NOTE_TAGS = ['Client Meeting', 'Research', 'Court Prep', 'Strategy', 'Reminder', 'Important', 'Follow-up', 'Confidential'];

const parseInline = (text, inherited = {}) => {
  if (!text) return [];
  const patterns = [
    { re: /^\*\*\*(.+?)\*\*\*/, bold: true, italic: true },
    { re: /^\*\*(.+?)\*\*/,     bold: true               },
    { re: /^__(.+?)__/,                      underline: true },
    { re: /^\*(.+?)\*/,         italic: true              },
  ];
  const parts = [];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const p of patterns) {
      const m = p.re.exec(text.slice(i));
      if (m) {
        if (m.index > 0) parts.push({ text: text.slice(i, i + m.index), ...inherited });
        const formats = { ...inherited, ...(p.bold && { bold: true }), ...(p.italic && { italic: true }), ...(p.underline && { underline: true }) };
        parts.push(...parseInline(m[1], formats));
        i += m.index + m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const nextSpecial = text.slice(i).search(/\*\*\*|\*\*|__|(?<!\*)\*(?!\*)/);
      const take = nextSpecial === -1 ? text.length - i : nextSpecial || 1;
      parts.push({ text: text.slice(i, i + take), ...inherited });
      i += take;
    }
  }
  return parts;
};

const getCanonicalSelection = (fullContent, start, end) => {
  const PAIRS = [['***__','__***'],['***','***'],['**__','__**'],['*__','__*'],['__','__'],['**','**'],['*','*']];
  for (const [pre, suf] of PAIRS) {
    const ps = start - pre.length, pe = end + suf.length;
    if (ps >= 0 && pe <= fullContent.length && fullContent.substring(ps, start) === pre && fullContent.substring(end, pe) === suf)
      return { start: ps, end: pe };
  }
  return { start, end };
};

const parseFlags = (text) => {
  const f = { bold: false, italic: false, underline: false };
  let t = text;
  if (t.startsWith('***') && t.endsWith('***') && t.length > 6)      { f.bold = true; f.italic = true; t = t.slice(3,-3); }
  else if (t.startsWith('**') && t.endsWith('**') && t.length > 4)   { f.bold = true; t = t.slice(2,-2); }
  else if (t.startsWith('*') && t.endsWith('*') && t.length > 2)     { f.italic = true; t = t.slice(1,-1); }
  if (t.startsWith('__') && t.endsWith('__') && t.length > 4)        f.underline = true;
  return f;
};

const getInner = (text, flags) => {
  let t = text;
  if      (flags.bold && flags.italic && t.startsWith('***')) t = t.slice(3,-3);
  else if (flags.bold  && t.startsWith('**'))                  t = t.slice(2,-2);
  else if (flags.italic && t.startsWith('*'))                  t = t.slice(1,-1);
  if (flags.underline && t.startsWith('__'))                   t = t.slice(2,-2);
  return t;
};

const buildFormatted = (inner, flags) => {
  let t = inner;
  if (flags.underline)                 t = `__${t}__`;
  if      (flags.bold && flags.italic) t = `***${t}***`;
  else if (flags.bold)                 t = `**${t}**`;
  else if (flags.italic)               t = `*${t}*`;
  return t;
};

const RichText = ({ text, style, numberOfLines }) => {
  const parts = parseInline(text || '');
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, idx) => (
        <Text key={idx} style={{ fontWeight: p.bold ? '700' : undefined, fontStyle: p.italic ? 'italic' : undefined, textDecorationLine: p.underline ? 'underline' : undefined }}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
};

// ─── TINY HELPERS ─────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg, size = 11 }) => (
  <View style={[util.badge, { backgroundColor: bg }]}>
    <Text style={[util.badgeTxt, { color, fontSize: size }]}>{label}</Text>
  </View>
);

const SectionHead = ({ icon, iconColor, title, action, onAction }) => (
  <View style={util.sHead}>
    <View style={[util.sHeadIcon, { backgroundColor: iconColor + '18' }]}>
      <FontAwesome5 name={icon} size={13} color={iconColor} />
    </View>
    <Text style={util.sHeadTitle}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={onAction} style={util.sHeadAction}>
        <Text style={util.sHeadActionTxt}>{action}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const util = StyleSheet.create({
  badge:        { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  badgeTxt:     { fontWeight: '700' },
  sHead:        { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sHeadIcon:    { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  sHeadTitle:   { fontSize: 15, fontWeight: '800', color: C.dark, flex: 1 },
  sHeadAction:  { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: C.blue50, borderRadius: 20 },
  sHeadActionTxt: { fontSize: 12, fontWeight: '700', color: C.primary },
});

// ─── SHARED CARD ──────────────────────────────────────────────────────────────
const Card = ({ children, accent, style }) => (
  <View style={[cd.wrap, accent && { borderLeftColor: accent, borderLeftWidth: 4 }, style]}>
    {children}
  </View>
);

const cd = StyleSheet.create({
  wrap: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: C.g100,
  },
});

// ─── DOCUMENT ADAPTER ─────────────────────────────────────────────────────────
const toDocDisplay = (doc) => {
  const name = doc.file_name || doc.filename || 'Document';
  const ext  = name.split('.').pop().toLowerCase();
  const iconMap = {
    pdf:  { icon: 'file-pdf',   bg: '#DC2626' },
    docx: { icon: 'file-word',  bg: '#1E40AF' },
    doc:  { icon: 'file-word',  bg: '#1E40AF' },
    xlsx: { icon: 'file-excel', bg: '#16A34A' },
    xls:  { icon: 'file-excel', bg: '#16A34A' },
    png:  { icon: 'file-image', bg: '#0D9488' },
    jpg:  { icon: 'file-image', bg: '#0D9488' },
    jpeg: { icon: 'file-image', bg: '#0D9488' },
  };
  const { icon, bg } = iconMap[ext] || { icon: 'file-alt', bg: '#9333EA' };
  // Backend stores file_size_mb (float) or file_size (bytes)
  let sizeLabel = '';
  if (doc.file_size_mb != null) {
    sizeLabel = doc.file_size_mb < 1
      ? `${Math.round(doc.file_size_mb * 1024)} KB`
      : `${doc.file_size_mb.toFixed(1)} MB`;
  } else if (doc.file_size != null) {
    sizeLabel = doc.file_size > 1024 * 1024
      ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(doc.file_size / 1024)} KB`;
  }
  const dateLabel = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  return { id: doc.id, icon, iconBg: bg, name, size: sizeLabel, date: dateLabel, url: doc.storage_url || null };
};

// ─── TASK ADAPTER ─────────────────────────────────────────────────────────────
const TASK_PRI_MAP = { URGENT: 'urgent', HIGH: 'high', MEDIUM: 'medium', NORMAL: 'normal', LOW: 'normal' };
const toTaskDisplay = (task) => {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate  = task.due_date ? new Date(task.due_date) : null;
  const isDone   = ['DONE', 'COMPLETED'].includes((task.status || '').toUpperCase());
  let dueLabel, dueColor;
  if (isDone)               { dueLabel = 'Completed';    dueColor = C.green600; }
  else if (!dueDate)        { dueLabel = 'No due date';  dueColor = C.g400;     }
  else if (dueDate <= today){ dueLabel = 'Due Today';    dueColor = C.red600;   }
  else if (dueDate <= tomorrow){ dueLabel = 'Due Tomorrow'; dueColor = C.amber600; }
  else {
    dueLabel = `Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    dueColor = C.primary;
  }
  return {
    id:          task.id,
    title:       task.title || 'Task',
    description: task.description || '',
    due:         dueLabel,
    dueColor,
    priority:    TASK_PRI_MAP[(task.priority || '').toUpperCase()] || 'normal',
    assignee:    task.app_user?.full_name || task.assigned_to_name || '',
    createdBy:   task.created_user?.full_name || '',
    done:        isDone,
  };
};

// ─── NOTE ADAPTER ─────────────────────────────────────────────────────────────
const NOTE_STYLES = [
  { bg: C.amber50,  border: C.amber600 },
  { bg: C.blue50,   border: C.primary  },
  { bg: C.purple50, border: C.purple600 },
];
const toNoteDisplay = (note, idx) => {
  const raw         = note.content || '';
  const colorMatch  = raw.match(/^\[color:(\w+)\]\n?/);
  const colorId     = colorMatch ? colorMatch[1] : null;
  const theme       = NOTE_COLORS.find(c => c.id === colorId);
  const fallbacks   = [
    { bg: C.amber50,  border: C.amber600  },
    { bg: C.blue50,   border: C.primary   },
    { bg: C.purple50, border: C.purple600 },
  ];
  const style       = theme
    ? { bg: theme.bg, border: theme.border }
    : fallbacks[idx % fallbacks.length];
  const content     = colorMatch ? raw.slice(colorMatch[0].length) : raw;
  const dateLabel   = note.created_at
    ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  return {
    id: note.id, author: note.app_user?.full_name || note.author_name || 'Team Member',
    avatar: note.author_avatar || null,
    content,
    time: dateLabel, borderColor: style.border, bg: style.bg,
  };
};

// ─── TIMELINE ACTION CLEANER ──────────────────────────────────────────────────
const STATUS_LABELS = {
  NEW: 'Case Restored', ACTIVE: 'Case Activated', OPEN: 'Case Opened',
  CLOSED: 'Case Closed', PENDING: 'Case set to Pending',
  ARCHIVED: 'Case Archived', IN_PROGRESS: 'Case In Progress', ON_HOLD: 'Case On Hold',
};
const EVENT_TYPE_LABELS = {
  HEARING: 'Hearing', MEETING: 'Meeting', DEADLINE: 'Deadline',
  CONSULTATION: 'Consultation', COURT_DATE: 'Court Date', OTHER: 'Event',
};
const EVENT_TYPE_META = {
  HEARING:      { icon: 'gavel',          color: C.red600,    bg: C.red50    },
  COURT_DATE:   { icon: 'landmark',       color: C.purple600, bg: C.purple50 },
  MEETING:      { icon: 'handshake',      color: C.amber600,  bg: C.amber50  },
  DEADLINE:     { icon: 'clock',          color: C.blue600,   bg: C.blue50   },
  CONSULTATION: { icon: 'comments',       color: C.green600,  bg: C.green50  },
  FILING:       { icon: 'file-signature', color: C.amber600,  bg: C.amber50  },
  DEPOSITION:   { icon: 'microphone',     color: C.red600,    bg: C.red50    },
  MEDIATION:    { icon: 'balance-scale',  color: C.green600,  bg: C.green50  },
  ARBITRATION:  { icon: 'balance-scale',  color: C.purple600, bg: C.purple50 },
};
const EV_DEFAULT_META = { icon: 'calendar-check', color: C.primary, bg: C.blue50 };
const RECUR_LABELS = { daily: '· Daily', weekly: '· Weekly', monthly: '· Monthly', yearly: '· Yearly' };

const cleanAction = (raw = '') => {
  const s = raw.trim();

  // "status changed to casestatus.NEW"
  const statusM = s.match(/status changed to (?:\w+\.)?(\w+)/i);
  if (statusM) {
    const key = statusM[1].toUpperCase();
    return STATUS_LABELS[key] || `Status → ${key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')}`;
  }

  // "event created : My Event (eventtype.HEARING) (repeats weekly)"
  const eventM = s.match(/event (\w+)\s*[:\-]\s*(.+?)\s*\((?:\w+\.)?(\w+)\)(.*)/i);
  if (eventM) {
    const verb     = eventM[1].charAt(0).toUpperCase() + eventM[1].slice(1).toLowerCase();
    const name     = eventM[2].trim();
    const typeKey  = eventM[3].toUpperCase();
    const typeLabel = EVENT_TYPE_LABELS[typeKey] || eventM[3];
    const rest     = eventM[4].toLowerCase();
    const recur    = Object.entries(RECUR_LABELS).find(([k]) => rest.includes(k));
    return `${typeLabel} ${verb}: ${name}${recur ? ' ' + recur[1] : ''}`;
  }

  // Generic: strip enum patterns like "casestatus.ACTIVE", "eventtype.HEARING"
  return s
    .replace(/\b\w+type\.\w+\b/gi, m => { const v = m.split('.')[1]; return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); })
    .replace(/\b\w+status\.\w+\b/gi, m => { const v = m.split('.')[1]; return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' '); })
    .replace(/\(repeats \w+\)/gi, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^./, c => c.toUpperCase());
};

// ─── TIMELINE ADAPTER ─────────────────────────────────────────────────────────
const TL_META = (action = '') => {
  const a = action.toLowerCase();
  if (a.includes('document') || a.includes('file') || a.includes('upload'))
    return { icon: 'file-alt',          color: '#DC2626', bg: '#FEE2E2', accent: '#DC2626' };
  if (a.includes('note'))
    return { icon: 'sticky-note',       color: '#7C3AED', bg: '#EDE9FE', accent: '#7C3AED' };
  if (a.includes('task'))
    return { icon: 'check-square',      color: '#D97706', bg: '#FEF3C7', accent: '#D97706' };
  if (a.includes('hearing') || a.includes('court'))
    return { icon: 'gavel',             color: '#1D4ED8', bg: '#DBEAFE', accent: '#1D4ED8' };
  if (a.includes('meeting') || a.includes('consultation'))
    return { icon: 'user-friends',      color: '#0891B2', bg: '#CFFAFE', accent: '#0891B2' };
  if (a.includes('invoice') || a.includes('payment') || a.includes('billing'))
    return { icon: 'file-invoice-dollar', color: '#059669', bg: '#D1FAE5', accent: '#059669' };
  if (a.includes('status') || a.includes('update') || a.includes('edit'))
    return { icon: 'pen',               color: '#0F766E', bg: '#CCFBF1', accent: '#0F766E' };
  if (a.includes('create') || a.includes('open') || a.includes('added'))
    return { icon: 'plus-circle',       color: '#16A34A', bg: '#DCFCE7', accent: '#16A34A' };
  if (a.includes('close') || a.includes('archive'))
    return { icon: 'archive',           color: '#6B7280', bg: '#F3F4F6', accent: '#6B7280' };
  return   { icon: 'history',           color: '#1E40AF', bg: '#EFF6FF', accent: '#1E40AF' };
};

const relativeTime = (dateStr) => {
  if (!dateStr) return '—';
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)          return 'Just now';
  if (diff < 3600)        return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800)      return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const dayKey = (dateStr) => {
  if (!dateStr) return 'Unknown';
  const now  = new Date(); now.setHours(0,0,0,0);
  const date = new Date(dateStr); date.setHours(0,0,0,0);
  const diff = Math.round((now - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const toTimelineDisplay = (item) => {
  const meta = TL_META(item.action || '');
  return {
    id:     item.id,
    action: cleanAction(item.action),
    actor:  item.performed_by_name || 'System',
    time:   relativeTime(item.created_at),
    day:    dayKey(item.created_at),
    ...meta,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
//  TEAM MANAGE MODAL
// ═════════════════════════════════════════════════════════════════════════════
function TeamManageModal({ visible, onClose, caseId, team, onTeamChange, assignedLawyerId }) {
  const [firmMembers, setFirmMembers] = useState([]);
  const [actionId, setActionId]       = useState(null);

  useEffect(() => {
    if (visible) {
      firmAPI.getTeam().then(data => setFirmMembers(Array.isArray(data) ? data : [])).catch(() => {});
    }
  }, [visible]);

  const teamIds = new Set((team || []).map(m => m.user_id || m.app_user?.id));
  // Hide the assigned lawyer only if they're already in the team; otherwise keep them visible so they can be added
  const visibleMembers = firmMembers.filter(m => {
    const uid = m.user_id || m.id;
    return !(uid === assignedLawyerId && teamIds.has(uid));
  });

  const handleAdd = async (userId) => {
    setActionId(userId);
    try {
      await casesAPI.addTeamMember(caseId, userId);
      onTeamChange();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add member.');
    } finally {
      setActionId(null);
    }
  };

  const handleRemove = async (userId) => {
    Alert.alert('Remove Member', 'Remove this member from the case?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setActionId(userId);
        try {
          await casesAPI.removeTeamMember(caseId, userId);
          onTeamChange();
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not remove member.');
        } finally {
          setActionId(null);
        }
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={tm.overlay}>
        <View style={tm.sheet}>
          <View style={tm.header}>
            <Text style={tm.title}>Manage Team</Text>
            <TouchableOpacity onPress={onClose}>
              <FontAwesome5 name="times" size={18} color={C.g600} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {visibleMembers.length === 0 ? (
              <View style={tm.empty}>
                <FontAwesome5 name="users" size={30} color={C.g300} />
                <Text style={tm.emptyTxt}>No team members found</Text>
              </View>
            ) : visibleMembers.map(member => {
              const uid      = member.user_id || member.id;
              const name     = member.app_user?.full_name || member.full_name || 'Unknown';
              const role     = member.app_user?.role || member.role || '';
              const avatar   = member.app_user?.avatar_url || member.avatar_url || null;
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const isOnTeam = teamIds.has(uid);
              const isLead   = uid === assignedLawyerId;
              const busy     = actionId === uid;
              return (
                <View key={uid} style={tm.memberRow}>
                  {avatar
                    ? <Image source={{ uri: avatar }} style={tm.avatar} />
                    : <View style={[tm.avatar, tm.avatarFallback]}>
                        <Text style={tm.avatarInitials}>{initials}</Text>
                      </View>
                  }
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={tm.memberName}>{name}</Text>
                    {role ? <Text style={tm.memberRole}>{role}</Text> : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : isLead && isOnTeam ? (
                    <View style={tm.leadBadge}>
                      <FontAwesome5 name="star" size={9} color={C.amber600} />
                      <Text style={tm.leadTxt}>Lead</Text>
                    </View>
                  ) : isOnTeam ? (
                    <TouchableOpacity style={tm.removBtn} onPress={() => handleRemove(uid)}>
                      <FontAwesome5 name="user-minus" size={13} color={C.red600} />
                      <Text style={tm.removTxt}>Remove</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={tm.addBtn} onPress={() => handleAdd(uid)}>
                      <FontAwesome5 name="user-plus" size={13} color={C.white} />
                      <Text style={tm.addTxt}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const tm = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:          { fontSize: 18, fontWeight: '700', color: C.dark },
  empty:          { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTxt:       { fontSize: 14, color: C.g500 },
  memberRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.g100 },
  avatar:         { width: 44, height: 44, borderRadius: 12 },
  avatarFallback: { backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 15, fontWeight: '800', color: C.primary },
  memberName:     { fontSize: 14, fontWeight: '700', color: C.dark },
  memberRole:     { fontSize: 12, color: C.g500, marginTop: 2 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  addTxt:         { fontSize: 12, fontWeight: '700', color: C.white },
  removBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.red50, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  removTxt:       { fontSize: 12, fontWeight: '700', color: C.red600 },
  leadBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amber50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  leadTxt:        { fontSize: 11, fontWeight: '700', color: C.amber600 },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════
const OverviewTab = ({ caseData, events = [], stats = {}, editMode, setEditMode, form, setForm }) => {
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <View style={{ paddingTop: 4 }}>

      {/* Hearing alert */}
      {caseData.nextHearing && (
        <View style={ov.hearingAlert}>
          <View style={ov.hearingPulse} />
          <FontAwesome5 name="gavel" size={13} color={C.red600} />
          <Text style={ov.hearingAlertTxt}>
            Hearing {caseData.nextHearing.label} · {caseData.nextHearing.time} · {caseData.nextHearing.room}
          </Text>
          <View style={ov.countdownPill}>
            <FontAwesome5 name="clock" size={10} color={C.white} />
            <Text style={ov.countdownTxt}>{caseData.nextHearing.countdown}</Text>
          </View>
        </View>
      )}

      {/* Description */}
      <Card accent={C.primary}>
        <SectionHead
          icon="align-left"
          iconColor={C.primary}
          title="About This Case"
          action={editMode ? 'Done' : 'Edit'}
          onAction={() => setEditMode(e => !e)}
        />
        {editMode ? (
          <TextInput
            style={ov.editInput}
            value={form.description}
            onChangeText={v => upd('description', v)}
            placeholder="Enter case description..."
            placeholderTextColor={C.g400}
            multiline
          />
        ) : (
          <Text style={ov.descText}>{form.description}</Text>
        )}
        {(() => {
          const items = [
            { k: 'Court',      v: caseData.court,      icon: 'landmark',      c: C.primary   },
            { k: 'Judge',      v: caseData.judge,      icon: 'user-tie',      c: C.indigo600 },
            { k: 'Prosecutor', v: caseData.prosecutor, icon: 'balance-scale', c: C.red600    },
            { k: 'Case Value', v: caseData.caseValue,  icon: 'dollar-sign',   c: C.green600  },
          ].filter(({ v }) => v && String(v).trim() !== '');
          if (items.length === 0) return null;
          return (
            <View style={ov.keyGrid}>
              {items.map(({ k, v, icon, c }) => (
                <View key={k} style={ov.keyItem}>
                  <View style={[ov.keyIcon, { backgroundColor: c + '18' }]}>
                    <FontAwesome5 name={icon} size={11} color={c} />
                  </View>
                  <View>
                    <Text style={ov.keyLabel}>{k}</Text>
                    <Text style={ov.keyVal} numberOfLines={1}>{v}</Text>
                  </View>
                </View>
              ))}
            </View>
          );
        })()}
      </Card>

      {/* Case Fields */}
      <Card accent={C.indigo600}>
        <SectionHead icon="sliders-h" iconColor={C.indigo600} title="Case Details" />

        {editMode ? (
          /* ── EDIT MODE : champs de saisie ── */
          <>
            <View style={ov.field}>
              <Text style={ov.fieldLabel}>Case Title</Text>
              <TextInput style={ov.fieldInput} value={form.title} onChangeText={v => upd('title', v)} placeholder="Case title" placeholderTextColor={C.g400} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[ov.field, { flex: 1 }]}>
                <Text style={ov.fieldLabel}>Type</Text>
                <View style={[ov.fieldInput, ov.rowBetween]}>
                  <Text style={ov.fieldTxt}>{form.caseType}</Text>
                  <FontAwesome5 name="chevron-down" size={10} color={C.g400} />
                </View>
              </View>
              <View style={[ov.field, { flex: 1 }]}>
                <Text style={ov.fieldLabel}>Phase</Text>
                <View style={[ov.fieldInput, ov.rowBetween]}>
                  <Text style={ov.fieldTxt}>{form.phase}</Text>
                  <FontAwesome5 name="chevron-down" size={10} color={C.g400} />
                </View>
              </View>
            </View>

            <View style={ov.field}>
              <Text style={ov.fieldLabel}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['urgent', 'high', 'medium', 'normal'].map(p => {
                  const pr = PRIORITY[p]; const active = form.priority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[ov.priBtn, { backgroundColor: active ? pr.color : C.g50, borderColor: active ? pr.color : C.g200 }]}
                      onPress={() => upd('priority', p)}
                    >
                      <View style={[ov.priDot, { backgroundColor: active ? C.white : pr.dot }]} />
                      <Text style={[ov.priTxt, { color: active ? C.white : C.g500 }]}>{pr.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[ov.field, { flex: 1 }]}>
                <Text style={ov.fieldLabel}>Filing Date</Text>
                <TextInput style={ov.fieldInput} value={form.filingDate} onChangeText={v => upd('filingDate', v)} placeholder="YYYY-MM-DD" placeholderTextColor={C.g400} />
              </View>
              <View style={[ov.field, { flex: 1 }]}>
                <Text style={ov.fieldLabel}>Next Hearing</Text>
                <TextInput style={ov.fieldInput} value={form.nextHearing} onChangeText={v => upd('nextHearing', v)} placeholder="YYYY-MM-DD" placeholderTextColor={C.g400} />
              </View>
            </View>

            <View style={ov.field}>
              <Text style={ov.fieldLabel}>Assigned Attorney</Text>
              <View style={[ov.fieldInput, ov.rowBetween]}>
                <Text style={ov.fieldTxt}>{form.attorney}</Text>
                <FontAwesome5 name="chevron-down" size={10} color={C.g400} />
              </View>
            </View>

            <View style={ov.field}>
              <Text style={ov.fieldLabel}>Court Location</Text>
              <TextInput style={ov.fieldInput} value={form.court} onChangeText={v => upd('court', v)} placeholder="e.g. Civil Court, City Hall" placeholderTextColor={C.g400} />
            </View>

            <View style={ov.field}>
              <Text style={ov.fieldLabel}>Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {form.tags.map(tag => (
                  <View key={tag} style={ov.tagChip}>
                    <FontAwesome5 name="tag" size={9} color={C.primary} />
                    <Text style={ov.tagTxt}>{tag}</Text>
                    <TouchableOpacity onPress={() => upd('tags', form.tags.filter(t => t !== tag))}>
                      <FontAwesome5 name="times" size={9} color={C.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[ov.tagChip, { backgroundColor: C.g100, borderWidth: 1, borderColor: C.g300 }]}>
                  <FontAwesome5 name="plus" size={9} color={C.g500} />
                  <Text style={[ov.tagTxt, { color: C.g500 }]}>Add tag</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          /* ── READ MODE : affichage propre des informations ── */
          <>
            {[
              { icon: 'heading',      color: C.primary,   label: 'Case Title',       value: form.title       },
              { icon: 'briefcase',    color: C.indigo600, label: 'Type',             value: form.caseType    },
              { icon: 'layer-group',  color: C.purple600, label: 'Phase',            value: form.phase       },
              { icon: 'calendar',     color: C.teal600,   label: 'Filing Date',      value: form.filingDate  },
              { icon: 'calendar-alt', color: C.red600,    label: 'Next Hearing',     value: form.nextHearing },
              { icon: 'user-tie',     color: C.amber600,  label: 'Attorney',         value: form.attorney    },
              { icon: 'landmark',     color: C.primary,   label: 'Court Location',   value: form.court       },
            ].filter(({ value }) => value && String(value).trim() !== '' && value !== '—').map(({ icon, color, label, value }) => (
              <View key={label} style={ov.infoRow}>
                <View style={[ov.infoIcon, { backgroundColor: color + '18' }]}>
                  <FontAwesome5 name={icon} size={13} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ov.infoLabel}>{label}</Text>
                  <Text style={ov.infoValue}>{value}</Text>
                </View>
              </View>
            ))}

            {/* Priority badge */}
            {PRIORITY[form.priority] && (
            <View style={ov.infoRow}>
              <View style={[ov.infoIcon, { backgroundColor: PRIORITY[form.priority]?.color + '18' }]}>
                <FontAwesome5 name={PRIORITY[form.priority]?.icon} size={13} color={PRIORITY[form.priority]?.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ov.infoLabel}>Priority</Text>
                <View style={[ov.priBadge, { backgroundColor: PRIORITY[form.priority]?.bg }]}>
                  <Text style={[ov.priBadgeTxt, { color: PRIORITY[form.priority]?.color }]}>
                    {PRIORITY[form.priority]?.label}
                  </Text>
                </View>
              </View>
            </View>
            )}

            {/* Tags */}
            {form.tags.length > 0 && (
              <View style={ov.infoRow}>
                <View style={[ov.infoIcon, { backgroundColor: C.blue50 }]}>
                  <FontAwesome5 name="tags" size={13} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ov.infoLabel}>Tags</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {form.tags.map(tag => (
                      <View key={tag} style={ov.tagChip}>
                        <Text style={ov.tagTxt}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </Card>

      <Card accent={C.red600}>
        <SectionHead icon="calendar-alt" iconColor={C.red600} title="Upcoming Events" />
        {events.length === 0 ? (
          <View style={ov.emptyBox}>
            <FontAwesome5 name="calendar-times" size={28} color={C.g300} />
            <Text style={ov.emptyTxt}>No upcoming events</Text>
          </View>
        ) : events.map((ev, idx) => {
          const evMeta  = EVENT_TYPE_META[(ev.event_type || '').toUpperCase()] ?? EV_DEFAULT_META;
          const evColor = evMeta.color;
          const evBg    = evMeta.bg;
          const evIcon  = evMeta.icon;
          const dateLabel = ev.start_datetime
            ? new Date(ev.start_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          const timeLabel = ev.start_datetime
            ? new Date(ev.start_datetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : '';
          return (
            <View key={ev.id ?? idx} style={ov.evRow}>
              <View style={[ov.evIconBox, { backgroundColor: evBg }]}>
                <FontAwesome5 name={evIcon} size={16} color={evColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={ov.evTitle}>{ev.title}</Text>
                {ev.location ? <Text style={ov.evDesc}>{ev.location}</Text> : null}
              </View>
              <View style={[ov.evDateBadge, { backgroundColor: evBg }]}>
                <Text style={[ov.evDateTxt, { color: evColor }]}>{dateLabel}</Text>
                <Text style={[ov.evTimeTxt, { color: evColor }]}>{timeLabel}</Text>
              </View>
            </View>
          );
        })}
      </Card>


      {/* AI Card */}
      <View style={ov.aiCard}>
        <View style={ov.aiHeader}>
          <View style={ov.aiIconBox}>
            <FontAwesome5 name="robot" size={22} color={C.white} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={ov.aiTitle}>AI Case Assistant</Text>
            <Text style={ov.aiSub}>Advanced Legal AI · Ready to help</Text>
          </View>
          <View style={ov.aiOnlinePill}>
            <View style={ov.aiOnlineDot} />
            <Text style={ov.aiOnlineTxt}>Live</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: 'file-alt',            label: 'Summarize Case'    },
            { icon: 'exclamation-triangle', label: 'Legal Risks'      },
            { icon: 'calendar-check',      label: 'Key Deadlines'     },
            { icon: 'search',              label: 'Case Law Research' },
          ].map(a => (
            <TouchableOpacity key={a.label} style={ov.aiAction}>
              <FontAwesome5 name={a.icon} size={12} color={C.white} />
              <Text style={ov.aiActionTxt}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

    </View>
  );
};

const ov = StyleSheet.create({
  // Hearing alert
  hearingAlert:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.red50, borderLeftWidth: 4, borderLeftColor: C.red600, borderRadius: 14, marginHorizontal: 16, marginBottom: 12, marginTop: 4, paddingHorizontal: 14, paddingVertical: 12 },
  hearingPulse:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red500 },
  hearingAlertTxt: { flex: 1, fontSize: 12, fontWeight: '700', color: C.red600 },
  countdownPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.red600, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countdownTxt:    { fontSize: 11, fontWeight: '800', color: C.white },

  // Description
  descText:      { fontSize: 14, color: C.g600, lineHeight: 22, marginBottom: 16 },
  editInput:     { borderWidth: 1.5, borderColor: C.g300, borderRadius: 12, padding: 12, fontSize: 14, color: C.dark, backgroundColor: C.white, height: 100, textAlignVertical: 'top', marginBottom: 16 },
  keyGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: C.g100, paddingTop: 14 },
  keyItem:       { width: (W - 32 - 68 - 10) / 2, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  keyIcon:       { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  keyLabel:      { fontSize: 10, color: C.g400, marginBottom: 2, fontWeight: '600' },
  keyVal:        { fontSize: 12, fontWeight: '800', color: C.dark },

  // Fields
  field:         { marginBottom: 14 },
  fieldLabel:    { fontSize: 11, fontWeight: '700', color: C.g500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput:    { borderWidth: 1.5, borderColor: C.g300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.dark, backgroundColor: C.white },
  fieldReadonly: { backgroundColor: C.g50, borderColor: C.g100 },
  fieldTxt:      { fontSize: 14, color: C.dark },
  rowBetween:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Read-only info rows
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.g100 },
  infoIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2, flexShrink: 0 },
  infoLabel:     { fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 3 },
  infoValue:     { fontSize: 14, fontWeight: '700', color: C.dark },
  priBadge:      { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 2 },
  priBadgeTxt:   { fontSize: 12, fontWeight: '800' },

  // Priority edit buttons
  priBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  priDot:        { width: 7, height: 7, borderRadius: 4 },
  priTxt:        { fontSize: 10, fontWeight: '800' },

  // Tags
  tagChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.blue50, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20 },
  tagTxt:        { fontSize: 12, fontWeight: '700', color: C.primary },

  // Events
  // Team
  teamRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 14, padding: 12 },
  teamAvatar:    { width: 44, height: 44, borderRadius: 12 },
  teamName:      { fontSize: 13, fontWeight: '700', color: C.dark },
  teamRole:      { fontSize: 11, color: C.g500, marginTop: 2 },
  teamRemoveBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.red50, alignItems: 'center', justifyContent: 'center' },
  leadBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amber50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  leadBadgeTxt:  { fontSize: 10, fontWeight: '700', color: C.amber600 },

  emptyBox:      { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyTxt:      { fontSize: 13, color: C.g400, fontWeight: '600' },
  evRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderRadius: 14, padding: 12, marginBottom: 10 },
  evIconBox:     { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  evTitle:       { fontSize: 13, fontWeight: '700', color: C.dark },
  evDesc:        { fontSize: 11, color: C.g500, marginTop: 2 },
  evDateBadge:   { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  evDateTxt:     { fontSize: 12, fontWeight: '800' },
  evTimeTxt:     { fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Time tracking
  timeCard:      { flex: 1, borderRadius: 14, padding: 14 },
  timeCardLabel: { fontSize: 11, fontWeight: '700', color: C.g500, marginBottom: 6 },
  timeCardValue: { fontSize: 24, fontWeight: '900' },
  timeCardUnit:  { fontSize: 12, fontWeight: '500', color: C.g400 },
  timeBarBg:     { height: 6, backgroundColor: C.g200, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  timeBarFill:   { height: 6, borderRadius: 3 },

  // AI
  aiCard:       { backgroundColor: C.slate900, marginHorizontal: 16, marginBottom: 16, borderRadius: 22, padding: 20 },
  aiHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  aiIconBox:    { width: 50, height: 50, borderRadius: 16, backgroundColor: C.glass, alignItems: 'center', justifyContent: 'center' },
  aiTitle:      { fontSize: 15, fontWeight: '800', color: C.white },
  aiSub:        { fontSize: 11, color: C.onDarkSub, marginTop: 2 },
  aiOnlinePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.glassB, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  aiOnlineDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  aiOnlineTxt:  { fontSize: 11, color: C.white, fontWeight: '700' },
  aiAction:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.glass, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  aiActionTxt:  { fontSize: 12, fontWeight: '700', color: C.white },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: DOCUMENTS
// ═════════════════════════════════════════════════════════════════════════════
const DocumentsTab = ({ documents = [], stats = {}, loading = false, caseId, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [localDocs, setLocalDocs] = useState(documents);

  useEffect(() => { setLocalDocs(documents); }, [documents]);

  const handleDeleteDoc = (doc) => {
    Alert.alert('Delete Document', `Delete "${doc.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await documentsAPI.delete(doc.id);
          setLocalDocs(prev => {
            const next = prev.filter(d => d.id !== doc.id);
            onUploaded?.(next.length);
            return next;
          });
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not delete document.');
        }
      }},
    ]);
  };

  const items = localDocs.map(toDocDisplay);
  const count = stats.docs ?? items.length;

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setUploading(true);

      const file = {
        uri:      asset.uri,
        name:     asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      };

      await documentsAPI.upload(file, caseId);
      Alert.alert('Success', `"${asset.name}" uploaded successfully.`);

      // Refresh list
      const updated = await documentsAPI.list({ case_id: caseId }).catch(() => []);
      const arr = Array.isArray(updated) ? updated : [];
      setLocalDocs(arr);
      onUploaded?.(arr.length);
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Could not upload the file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ paddingTop: 4 }}>
      <Card accent={C.red600}>
        <SectionHead
          icon="folder-open"
          iconColor={C.red600}
          title={`Documents (${count})`}
          action={uploading ? null : 'Upload'}
          onAction={handleUpload}
        />

        {uploading && (
          <View style={dc.uploadingRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={dc.uploadingTxt}>Uploading…</Text>
          </View>
        )}

        {loading && !uploading && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}

        {!loading && items.length === 0 && (
          <TouchableOpacity style={dc.emptyUpload} onPress={handleUpload}>
            <View style={dc.emptyUploadIcon}>
              <FontAwesome5 name="cloud-upload-alt" size={28} color={C.primary} />
            </View>
            <Text style={dc.emptyUploadTitle}>No documents yet</Text>
            <Text style={dc.emptyUploadSub}>Tap to upload the first document</Text>
          </TouchableOpacity>
        )}

        {items.map(doc => (
          <View key={doc.id} style={dc.row}>
            <View style={[dc.iconBox, { backgroundColor: doc.iconBg }]}>
              <FontAwesome5 name={doc.icon} size={20} color={C.white} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={dc.name} numberOfLines={1}>{doc.name}</Text>
              <Text style={dc.meta}>{doc.size}{doc.size && ' · '}{doc.date}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={[dc.btn, { backgroundColor: doc.url ? doc.iconBg : C.g300 }]}
                  onPress={() => {
                    if (!doc.url) { Alert.alert('Unavailable', 'No URL for this document.'); return; }
                    WebBrowser.openBrowserAsync(doc.url);
                  }}
                >
                  <FontAwesome5 name="eye" size={10} color={C.white} />
                  <Text style={dc.btnTxt}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dc.btnOutline, { borderColor: doc.url ? doc.iconBg : C.g300 }]}
                  onPress={() => {
                    if (!doc.url) { Alert.alert('Unavailable', 'No URL for this document.'); return; }
                    WebBrowser.openBrowserAsync(doc.url).catch(() =>
                      Alert.alert('Error', 'Could not open the document.')
                    );
                  }}
                >
                  <FontAwesome5 name="download" size={10} color={doc.url ? doc.iconBg : C.g400} />
                  <Text style={[dc.btnTxt, { color: doc.url ? doc.iconBg : C.g400 }]}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={{ padding: 6 }} onPress={() => handleDeleteDoc(doc)}>
              <FontAwesome5 name="trash-alt" size={14} color={C.red500} />
            </TouchableOpacity>
          </View>
        ))}
      </Card>
    </View>
  );
};

const dc = StyleSheet.create({
  row:              { flexDirection: 'row', backgroundColor: C.g50, borderRadius: 16, padding: 14, marginBottom: 10 },
  iconBox:          { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:             { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 2 },
  meta:             { fontSize: 11, color: C.g400 },
  btn:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnOutline:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: C.white },
  uploadingRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.blue50, borderRadius: 12, padding: 12, marginBottom: 12 },
  uploadingTxt:     { fontSize: 13, fontWeight: '600', color: C.primary },
  emptyUpload:      { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyUploadIcon:  { width: 64, height: 64, borderRadius: 20, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyUploadTitle: { fontSize: 14, fontWeight: '700', color: C.dark },
  emptyUploadSub:   { fontSize: 12, color: C.g400 },
  btnTxt:     { fontSize: 11, fontWeight: '700', color: C.white },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: TASKS
// ═════════════════════════════════════════════════════════════════════════════
const TASK_PRIORITIES = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];
const TASK_PRI_COLORS = { NORMAL: C.g500, MEDIUM: C.amber600, HIGH: C.orange600 ?? '#EA580C', URGENT: C.red600 };

const TASK_CATEGORIES = [
  { label: 'Court Filing',    key: 'COURT_FILING'   },
  { label: 'Doc Review',      key: 'DOC_REVIEW'     },
  { label: 'Client Meeting',  key: 'CLIENT_MEETING' },
  { label: 'Research',        key: 'RESEARCH'       },
  { label: 'Correspondence',  key: 'CORRESPONDENCE' },
  { label: 'Discovery',       key: 'DISCOVERY'      },
  { label: 'Billing',         key: 'BILLING'        },
  { label: 'Other',           key: 'OTHER'          },
];

const TASK_TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];

const CAL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toISODate = (d) => d.toISOString().split('T')[0];

const TaskCalendarStrip = ({ selectedDate, onSelect, calendarBase, onPrev, onNext }) => {
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarBase);
    d.setDate(calendarBase.getDate() + i);
    return d;
  });
  const todayISO = toISODate(new Date());
  return (
    <View style={tkCal.strip}>
      <View style={tkCal.monthRow}>
        <TouchableOpacity onPress={onPrev} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <FontAwesome5 name="chevron-left" size={13} color={C.amber600} />
        </TouchableOpacity>
        <Text style={tkCal.monthText}>
          {calendarBase.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <FontAwesome5 name="chevron-right" size={13} color={C.amber600} />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 8, paddingBottom: 4 }}>
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const isSel = selectedDate === iso;
          const isToday = iso === todayISO;
          return (
            <TouchableOpacity
              key={i}
              style={[tkCal.dayBtn, isSel && tkCal.dayBtnSel]}
              onPress={() => onSelect(iso)}
            >
              <Text style={[tkCal.dayName, isSel && tkCal.dayNameSel]}>{CAL_DAYS[d.getDay()]}</Text>
              <Text style={[tkCal.dayNum, isSel && tkCal.dayNumSel]}>{d.getDate()}</Text>
              {isToday && <View style={[tkCal.todayDot, isSel && { backgroundColor: C.white }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={tkCal.selectedText}>{selectedDate || 'No date selected'}</Text>
    </View>
  );
};

const tkCal = StyleSheet.create({
  strip:       { backgroundColor: C.g50, borderRadius: 14, borderWidth: 1.5, borderColor: C.g200, paddingVertical: 10, marginBottom: 16 },
  monthRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 10, paddingHorizontal: 12 },
  monthText:   { fontSize: 13, fontWeight: '700', color: C.dark },
  dayBtn:      { width: 44, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.g200 },
  dayBtnSel:   { backgroundColor: C.amber600, borderColor: C.amber600 },
  dayName:     { fontSize: 10, color: C.g500, fontWeight: '600' },
  dayNameSel:  { color: 'rgba(255,255,255,0.8)' },
  dayNum:      { fontSize: 15, fontWeight: '800', color: C.dark },
  dayNumSel:   { color: C.white },
  todayDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber600 },
  selectedText:{ fontSize: 11, color: C.g500, textAlign: 'center', marginTop: 8, marginBottom: 2, fontWeight: '500' },
});

const TasksTab = ({ tasks: propTasks = [], stats = {}, loading = false, caseId, team = [] }) => {
  const [tasks,          setTasks]          = useState(propTasks.map(toTaskDisplay));
  const [showAdd,        setShowAdd]        = useState(false);
  const [addTitle,       setAddTitle]       = useState('');
  const [addPriority,    setAddPriority]    = useState('NORMAL');
  const [addCategory,    setAddCategory]    = useState('');
  const [addDue,         setAddDue]         = useState('');
  const [addDesc,        setAddDesc]        = useState('');
  const [addAssignedTo,  setAddAssignedTo]  = useState(null);
  const [addReminder,    setAddReminder]    = useState(false);
  const [addReminderDate,setAddReminderDate]= useState('');
  const [addReminderTime,setAddReminderTime]= useState('');
  const [addLoading,     setAddLoading]     = useState(false);
  const [calBase,        setCalBase]        = useState(new Date());
  const [remCalBase,     setRemCalBase]     = useState(new Date());

  const prevWeek    = () => { const d = new Date(calBase);    d.setDate(d.getDate() - 7); setCalBase(d); };
  const nextWeek    = () => { const d = new Date(calBase);    d.setDate(d.getDate() + 7); setCalBase(d); };
  const prevRemWeek = () => { const d = new Date(remCalBase); d.setDate(d.getDate() - 7); setRemCalBase(d); };
  const nextRemWeek = () => { const d = new Date(remCalBase); d.setDate(d.getDate() + 7); setRemCalBase(d); };

  useEffect(() => { setTasks(propTasks.map(toTaskDisplay)); }, [propTasks]);

  const count = stats.tasks ?? tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = tasks.length > 0 ? done / tasks.length : 0;

  const toggle = async (id) => {
    const task    = tasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.done ? 'PENDING' : 'COMPLETED';
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
    try {
      await tasksAPI.updateStatus(id, newStatus);
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: task.done } : t));
      Alert.alert('Error', 'Could not update task status.');
    }
  };

  const handleDeleteTask = (id) => {
    Alert.alert('Delete Task', 'Delete this task permanently?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await tasksAPI.delete(id);
          setTasks(prev => prev.filter(t => t.id !== id));
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not delete task.');
        }
      }},
    ]);
  };

  const handleAdd = async () => {
    if (!addTitle.trim()) { Alert.alert('Required', 'Please enter a task title.'); return; }
    setAddLoading(true);
    try {
      const reminderAt = addReminder && addReminderDate && addReminderTime
        ? `${addReminderDate}T${addReminderTime}:00`
        : null;
      const created = await tasksAPI.create({
        title:       addTitle.trim(),
        priority:    addPriority,
        category:    addCategory || null,
        due_date:    addDue || null,
        description: addDesc.trim() || null,
        assigned_to: addAssignedTo || null,
        reminder_at: reminderAt,
        case_id:     caseId || null,
      });
      setTasks(prev => [...prev, toTaskDisplay(created)]);
      setShowAdd(false);
      setAddTitle(''); setAddPriority('NORMAL'); setAddCategory('');
      setAddDue(''); setAddDesc(''); setAddAssignedTo(null);
      setAddReminder(false); setAddReminderDate(''); setAddReminderTime('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not create task.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <View style={{ paddingTop: 4 }}>
      <Card accent={C.amber600}>
        <SectionHead icon="tasks" iconColor={C.amber600} title={`Tasks (${count})`} action="+ Add Task" onAction={() => setShowAdd(true)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <View style={tk.progCircle}>
            <Text style={tk.progPct}>{Math.round(pct * 100)}%</Text>
            <Text style={tk.progSub}>done</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={tk.progLabel}>{done} of {tasks.length} tasks completed</Text>
            <View style={tk.progBarBg}>
              <View style={[tk.progBarFill, { width: `${pct * 100}%` }]} />
            </View>
          </View>
        </View>
        {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
        {!loading && tasks.length === 0 && (
          <View style={ov.emptyBox}>
            <FontAwesome5 name="check-double" size={28} color={C.g300} />
            <Text style={ov.emptyTxt}>No tasks yet</Text>
          </View>
        )}
        {!loading && tasks.map(task => {
          const pr = PRIORITY[task.priority] || PRIORITY.normal;
          return (
            <View key={task.id} style={[tk.row, task.priority === 'urgent' && !task.done && { borderLeftColor: C.red600, borderLeftWidth: 3 }, task.done && { opacity: 0.5 }]}>
              <TouchableOpacity
                onPress={() => toggle(task.id)}
                style={[tk.check, task.done && { backgroundColor: C.green600, borderColor: C.green600 }]}
              >
                {task.done && <FontAwesome5 name="check" size={11} color={C.white} />}
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[tk.title, task.done && { textDecorationLine: 'line-through', color: C.g400 }]}>{task.title}</Text>
                {!!task.description && (
                  <Text style={tk.taskDesc} numberOfLines={2}>{task.description}</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <View style={[tk.duePill, { backgroundColor: task.dueColor + '18' }]}>
                    <FontAwesome5 name="clock" size={9} color={task.dueColor} />
                    <Text style={[tk.dueTxt, { color: task.dueColor }]}>{task.due}</Text>
                  </View>
                  <Badge label={pr.label} color={pr.color} bg={pr.bg} />
                </View>
                {(task.assignee || task.createdBy) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                    {task.assignee ? (
                      <View style={tk.metaRow}>
                        <FontAwesome5 name="user-check" size={9} color={C.g400} />
                        <Text style={tk.metaTxt}>{task.assignee}</Text>
                      </View>
                    ) : null}
                    {task.createdBy ? (
                      <View style={tk.metaRow}>
                        <FontAwesome5 name="user-edit" size={9} color={C.g400} />
                        <Text style={tk.metaTxt}>by {task.createdBy}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <TouchableOpacity style={{ padding: 6 }} onPress={() => handleDeleteTask(task.id)}>
                <FontAwesome5 name="trash-alt" size={13} color={C.red500} />
              </TouchableOpacity>
            </View>
          );
        })}
      </Card>

      {/* ── Add Task Modal ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={tk.modalOverlay}>
          <View style={tk.modalSheet}>
            {/* Header */}
            <View style={tk.modalHeader}>
              <Text style={tk.modalTitle}>New Task</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <FontAwesome5 name="times" size={16} color={C.g500} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Title */}
              <Text style={tk.fieldLabel}>Title *</Text>
              <TextInput
                style={tk.input}
                placeholder="Task title"
                value={addTitle}
                onChangeText={setAddTitle}
              />

              {/* Description */}
              <Text style={[tk.fieldLabel, { marginTop: 4 }]}>Description</Text>
              <TextInput
                style={[tk.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Optional details or context..."
                placeholderTextColor={C.g400}
                value={addDesc}
                onChangeText={setAddDesc}
                multiline
              />

              {/* Priority */}
              <Text style={tk.fieldLabel}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {TASK_PRIORITIES.map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setAddPriority(p)}
                    style={[tk.priChip, addPriority === p && { backgroundColor: TASK_PRI_COLORS[p], borderColor: TASK_PRI_COLORS[p] }]}
                  >
                    <Text style={[tk.priChipTxt, addPriority === p && { color: C.white }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Category */}
              <Text style={tk.fieldLabel}>Category</Text>
              <View style={tk.catGrid}>
                {TASK_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[tk.catChip, addCategory === cat.key && tk.catChipActive]}
                    onPress={() => setAddCategory(addCategory === cat.key ? '' : cat.key)}
                  >
                    <Text style={[tk.catChipTxt, addCategory === cat.key && tk.catChipTxtActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Due Date */}
              <Text style={[tk.fieldLabel, { marginTop: 4 }]}>Due Date</Text>
              <TaskCalendarStrip
                selectedDate={addDue}
                onSelect={setAddDue}
                calendarBase={calBase}
                onPrev={prevWeek}
                onNext={nextWeek}
              />

              {/* Assigned To */}
              {team.length > 0 && (
                <>
                  <Text style={tk.fieldLabel}>Assigned To</Text>
                  <View style={tk.memberGrid}>
                    {team.map(m => {
                      const uid      = m.user_id;
                      const name     = m.app_user?.full_name || 'Unknown';
                      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                      const isSel    = addAssignedTo === uid;
                      return (
                        <TouchableOpacity
                          key={uid}
                          style={[tk.memberChip, isSel && tk.memberChipActive]}
                          onPress={() => setAddAssignedTo(isSel ? null : uid)}
                        >
                          <View style={[tk.memberAvatar, isSel && { backgroundColor: C.amber600 }]}>
                            <Text style={[tk.memberInitials, isSel && { color: C.white }]}>{initials}</Text>
                          </View>
                          <Text style={[tk.memberName, isSel && { color: C.amber600 }]} numberOfLines={1}>{name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Reminder At */}
              <TouchableOpacity
                style={tk.reminderToggleRow}
                onPress={() => { setAddReminder(v => !v); if (addReminder) { setAddReminderDate(''); setAddReminderTime(''); } }}
              >
                <View style={tk.reminderToggleLeft}>
                  <View style={[tk.reminderIcon, addReminder && { backgroundColor: C.amber600 + '22' }]}>
                    <FontAwesome5 name="bell" size={13} color={addReminder ? C.amber600 : C.g500} />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={tk.reminderTitle}>Set Reminder</Text>
                    <Text style={tk.reminderSub}>
                      {addReminder && addReminderDate ? `${addReminderDate}${addReminderTime ? ' · ' + addReminderTime : ''}` : 'Get notified before due date'}
                    </Text>
                  </View>
                </View>
                <View style={[tk.toggleTrack, addReminder && { backgroundColor: C.amber600 }]}>
                  <View style={[tk.toggleKnob, addReminder && { marginLeft: 22 }]} />
                </View>
              </TouchableOpacity>

              {addReminder && (
                <View style={tk.reminderBox}>
                  <Text style={tk.fieldLabel}>Reminder Date</Text>
                  <TaskCalendarStrip
                    selectedDate={addReminderDate}
                    onSelect={setAddReminderDate}
                    calendarBase={remCalBase}
                    onPrev={prevRemWeek}
                    onNext={nextRemWeek}
                  />
                  <Text style={tk.fieldLabel}>Reminder Time</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                    {TASK_TIMES.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[tk.timeChip, addReminderTime === t && tk.timeChipActive]}
                        onPress={() => setAddReminderTime(t)}
                      >
                        <Text style={[tk.timeChipTxt, addReminderTime === t && { color: C.white }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={{ height: 8 }} />
            </ScrollView>

            <TouchableOpacity
              style={[tk.submitBtn, addLoading && { opacity: 0.6 }]}
              onPress={handleAdd}
              disabled={addLoading}
            >
              {addLoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={tk.submitTxt}>Add Task</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const tk = StyleSheet.create({
  progCircle:   { width: 64, height: 64, borderRadius: 32, backgroundColor: C.amber50, borderWidth: 3, borderColor: C.amber600, alignItems: 'center', justifyContent: 'center' },
  progPct:      { fontSize: 16, fontWeight: '900', color: C.amber600 },
  progSub:      { fontSize: 9, color: C.amber600, fontWeight: '600' },
  progLabel:    { fontSize: 12, color: C.g600, fontWeight: '600', marginBottom: 8 },
  progBarBg:    { height: 8, backgroundColor: C.g200, borderRadius: 4, overflow: 'hidden' },
  progBarFill:  { height: 8, borderRadius: 4, backgroundColor: C.amber600 },
  row:          { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.g50, borderRadius: 16, padding: 14, marginBottom: 10 },
  check:        { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.g300, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  title:        { fontSize: 13, fontWeight: '700', color: C.dark },
  duePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  dueTxt:       { fontSize: 10, fontWeight: '700' },
  taskDesc:     { fontSize: 12, color: C.g500, marginTop: 4, lineHeight: 17 },
  assignee:     { fontSize: 11, color: C.g500, marginTop: 5 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:      { fontSize: 10, color: C.g400, fontWeight: '500' },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontSize: 17, fontWeight: '800', color: C.dark },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: C.g600, marginBottom: 6 },
  input:        { borderWidth: 1, borderColor: C.g200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.dark, marginBottom: 16 },
  priChip:      { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: C.g200, alignItems: 'center' },
  priChipTxt:   { fontSize: 10, fontWeight: '700', color: C.g500 },
  // category
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: C.g200, backgroundColor: C.white },
  catChipActive:{ backgroundColor: C.amber600, borderColor: C.amber600 },
  catChipTxt:   { fontSize: 11, fontWeight: '600', color: C.g600 },
  catChipTxtActive: { color: C.white },
  // assigned to
  memberGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  memberChip:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.g200, maxWidth: '48%' },
  memberChipActive: { borderColor: C.amber600, backgroundColor: C.amber50 },
  memberAvatar: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  memberInitials: { fontSize: 9, fontWeight: '800', color: C.g600 },
  memberName:   { fontSize: 11, fontWeight: '600', color: C.dark, flexShrink: 1 },
  // reminder
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.g50, borderRadius: 12, padding: 12, marginBottom: 12 },
  reminderToggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  reminderIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  reminderTitle: { fontSize: 13, fontWeight: '700', color: C.dark },
  reminderSub:  { fontSize: 11, color: C.g500, marginTop: 1 },
  toggleTrack:  { width: 44, height: 24, borderRadius: 12, backgroundColor: C.g200, paddingHorizontal: 2, justifyContent: 'center' },
  toggleKnob:   { width: 20, height: 20, borderRadius: 10, backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  reminderBox:  { backgroundColor: C.amber50, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.amberBorder ?? '#FDE68A', marginBottom: 4 },
  // time chips
  timeChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.g200, backgroundColor: C.white },
  timeChipActive: { backgroundColor: C.amber600, borderColor: C.amber600 },
  timeChipTxt:  { fontSize: 12, fontWeight: '600', color: C.g600 },
  submitBtn:    { backgroundColor: C.amber600, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitTxt:    { color: C.white, fontWeight: '800', fontSize: 15 },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: NOTES
// ═════════════════════════════════════════════════════════════════════════════
const AMBER = '#D97706';

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: TEAM
// ═════════════════════════════════════════════════════════════════════════════
const TeamTab = ({ team = [], caseId, lawyerId, onTeamChange, loading = false }) => {
  const [teamModal,  setTeamModal]  = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const handleRemoveMember = (userId, name) => {
    Alert.alert('Remove Member', `Remove ${name} from this case?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setRemovingId(userId);
        try {
          await casesAPI.removeTeamMember(caseId, userId);
          onTeamChange?.();
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not remove member.');
        } finally {
          setRemovingId(null);
        }
      }},
    ]);
  };

  return (
    <View style={{ paddingTop: 4 }}>
      <Card accent={C.teal600}>
        <SectionHead
          icon="users"
          iconColor={C.teal600}
          title={`Legal Team (${team.length})`}
          action="Manage"
          onAction={() => setTeamModal(true)}
        />
        {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
        {!loading && team.length === 0 && (
          <View style={ov.emptyBox}>
            <FontAwesome5 name="user-plus" size={26} color={C.g300} />
            <Text style={ov.emptyTxt}>No team members yet</Text>
          </View>
        )}
        {!loading && (
          <View style={{ gap: 10 }}>
            {team.map(m => {
              const uid      = m.user_id;
              const name     = m.app_user?.full_name || 'Unknown';
              const role     = m.app_user?.role || '';
              const avatar   = m.app_user?.avatar_url || null;
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const removing = removingId === uid;
              const isLead   = uid === lawyerId;
              return (
                <View key={m.id ?? uid} style={ov.teamRow}>
                  {avatar
                    ? <Image source={{ uri: avatar }} style={ov.teamAvatar} />
                    : <View style={[ov.teamAvatar, { backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{initials}</Text>
                      </View>
                  }
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={ov.teamName}>{name}</Text>
                    {role ? <Text style={ov.teamRole}>{role}</Text> : null}
                  </View>
                  {isLead ? (
                    <View style={ov.leadBadge}>
                      <FontAwesome5 name="star" size={9} color={C.amber600} />
                      <Text style={ov.leadBadgeTxt}>Lead</Text>
                    </View>
                  ) : removing ? (
                    <ActivityIndicator size="small" color={C.red600} />
                  ) : (
                    <TouchableOpacity style={ov.teamRemoveBtn} onPress={() => handleRemoveMember(uid, name)}>
                      <FontAwesome5 name="user-minus" size={13} color={C.red600} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <TeamManageModal
        visible={teamModal}
        onClose={() => setTeamModal(false)}
        caseId={caseId}
        team={team}
        assignedLawyerId={lawyerId}
        onTeamChange={() => { setTeamModal(false); onTeamChange?.(); }}
      />
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: NOTES
// ═════════════════════════════════════════════════════════════════════════════
const NotesTab = ({ notes: propNotes = [], stats = {}, loading = false, caseId, navigation, caseData }) => {
  const [notes,         setNotes]         = useState(propNotes);
  const [showAdd,       setShowAdd]       = useState(false);
  const [expanded,      setExpanded]      = useState({});

  // form state
  const [title,         setTitle]         = useState('');
  const [content,       setContent]       = useState('');
  const [selectedColor, setSelectedColor] = useState('yellow');
  const [selectedTags,  setSelectedTags]  = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });

  const contentInputRef = useRef(null);
  const selectionRef    = useRef({ start: 0, end: 0 });

  useEffect(() => { setNotes(propNotes); }, [propNotes]);

  const count        = stats.notes ?? notes.length;
  const currentTheme = NOTE_COLORS.find(c => c.id === selectedColor) || NOTE_COLORS[0];

  const toggleTag = (tag) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const toggleFormat = (formatKey) => {
    const { start, end } = selectionRef.current;
    const before   = content.substring(0, start);
    const selected = content.substring(start, end);
    const after    = content.substring(end);
    const flags    = parseFlags(selected);
    const inner    = getInner(selected, flags);
    flags[formatKey] = !flags[formatKey];
    const newSelected = buildFormatted(inner, flags);
    setContent(before + newSelected + after);
    setActiveFormats({ ...flags });
    const newEnd = start + newSelected.length;
    selectionRef.current = { start, end: newEnd };
    setTimeout(() => contentInputRef.current?.setNativeProps({ selection: { start, end: newEnd } }), 30);
  };

  const resetForm = () => {
    setTitle(''); setContent(''); setSelectedColor('yellow');
    setSelectedTags([]); setActiveFormats({ bold: false, italic: false, underline: false });
  };

  const handleDeleteNote = (id) => {
    Alert.alert('Delete Note', 'Delete this note permanently?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await notesAPI.delete(id);
          setNotes(prev => prev.filter(n => n.id !== id));
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not delete note.');
        }
      }},
    ]);
  };

  const handleSave = async () => {
    if (!content.trim()) { Alert.alert('Required', 'Please write some content.'); return; }
    const fullContent = [
      `[color:${selectedColor}]\n`,
      title.trim() ? `**${title.trim()}**\n` : '',
      content.trim(),
      selectedTags.length ? `\n\nTags: ${selectedTags.join(', ')}` : '',
    ].join('');
    setSaving(true);
    try {
      const created = await notesAPI.create({ case_id: caseId, content: fullContent });
      setNotes(prev => [created, ...prev]);
      setShowAdd(false);
      resetForm();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  };

  const items = notes.map(toNoteDisplay);

  return (
    <View style={{ paddingTop: 4 }}>
      <Card accent={C.purple600}>
        <View style={util.sHead}>
          <View style={[util.sHeadIcon, { backgroundColor: C.purple600 + '18' }]}>
            <FontAwesome5 name="sticky-note" size={13} color={C.purple600} />
          </View>
          <Text style={util.sHeadTitle}>{`Notes (${count})`}</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={util.sHeadAction}>
            <Text style={util.sHeadActionTxt}>+ Add Note</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('VoiceNote', {
              lockedCase: { id: caseData?._id, case_number: caseData?.id, title: caseData?.title },
            })}
            style={[util.sHeadAction, { backgroundColor: C.red50, marginLeft: 6, flexDirection: 'row', alignItems: 'center' }]}
          >
            <FontAwesome5 name="microphone" size={11} color={C.red600} style={{ marginRight: 5 }} />
            <Text style={[util.sHeadActionTxt, { color: C.red600 }]}>Voice Note</Text>
          </TouchableOpacity>
        </View>
        {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
        {!loading && items.length === 0 && (
          <View style={ov.emptyBox}>
            <FontAwesome5 name="sticky-note" size={28} color={C.g300} />
            <Text style={ov.emptyTxt}>No notes yet</Text>
          </View>
        )}
        {!loading && items.map(note => {
          const isExpanded = !!expanded[note.id];
          return (
            <View key={note.id} style={[nt.card, { backgroundColor: note.bg, borderLeftColor: note.borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                {note.avatar
                  ? <Image source={{ uri: note.avatar }} style={nt.avatar} />
                  : <View style={[nt.avatar, { backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' }]}>
                      <FontAwesome5 name="user" size={14} color={C.primary} />
                    </View>
                }
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={nt.author}>{note.author}</Text>
                  <Text style={nt.time}>{note.time}</Text>
                </View>
                <TouchableOpacity style={{ padding: 4 }} onPress={() => handleDeleteNote(note.id)}>
                  <FontAwesome5 name="trash-alt" size={13} color={C.red500} />
                </TouchableOpacity>
              </View>
              <RichText
                text={note.content}
                style={{ fontSize: 13, color: C.g600, lineHeight: 20 }}
                numberOfLines={isExpanded ? undefined : 4}
              />
              <TouchableOpacity
                style={[nt.readMore, { borderTopColor: note.borderColor + '40' }]}
                onPress={() => setExpanded(prev => ({ ...prev, [note.id]: !prev[note.id] }))}
              >
                <Text style={[nt.readMoreTxt, { color: note.borderColor }]}>{isExpanded ? 'Show less' : 'Read more'}</Text>
                <FontAwesome5 name={isExpanded ? 'chevron-up' : 'chevron-right'} size={10} color={note.borderColor} />
              </TouchableOpacity>
            </View>
          );
        })}
      </Card>

      {/* ── Add Note Modal ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); resetForm(); }}>
          <View style={nt.modalOverlay}>
            <View style={nt.modalSheet}>
              {/* Header */}
              <View style={nt.modalHeader}>
                <Text style={nt.modalTitle}>New Note</Text>
                <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
                  <FontAwesome5 name="times" size={16} color={C.g500} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Preview */}
                <View style={[nt.preview, { backgroundColor: currentTheme.bg, borderColor: currentTheme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={[nt.colorDot, { backgroundColor: currentTheme.dot }]} />
                    <Text style={{ fontSize: 11, color: C.g500 }}>
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  {title ? <Text style={nt.previewTitle}>{title}</Text> : null}
                  {content
                    ? <RichText text={content} style={{ fontSize: 13, color: C.g600, lineHeight: 20 }} numberOfLines={3} />
                    : <Text style={{ fontSize: 13, color: C.g400, fontStyle: 'italic' }}>Start typing your note…</Text>
                  }
                  {selectedTags.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      {selectedTags.map(t => (
                        <View key={t} style={[nt.previewTag, { backgroundColor: currentTheme.border + '66' }]}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: currentTheme.dot }}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={nt.fieldLabel}>Title</Text>
                <TextInput
                  style={nt.titleInput}
                  placeholder="Note title..."
                  placeholderTextColor={C.g400}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                />

                {/* Content */}
                <Text style={[nt.fieldLabel, { marginTop: 14 }]}>Content *</Text>
                <TextInput
                  ref={contentInputRef}
                  style={nt.contentInput}
                  placeholder="Write your note here..."
                  placeholderTextColor={C.g400}
                  value={content}
                  onChangeText={setContent}
                  onSelectionChange={({ nativeEvent: { selection } }) => {
                    const { start, end } = selection;
                    if (start !== end) {
                      const canonical = getCanonicalSelection(content, start, end);
                      selectionRef.current = canonical;
                      setActiveFormats(parseFlags(content.substring(canonical.start, canonical.end)));
                    } else {
                      selectionRef.current = selection;
                      setActiveFormats({ bold: false, italic: false, underline: false });
                    }
                  }}
                  multiline
                  textAlignVertical="top"
                />

                {/* Formatting toolbar */}
                <View style={nt.toolbar}>
                  {[{ icon: 'bold', key: 'bold' }, { icon: 'italic', key: 'italic' }, { icon: 'underline', key: 'underline' }].map(t => {
                    const active = activeFormats[t.key];
                    return (
                      <TouchableOpacity key={t.key} style={[nt.toolbarBtn, active && { backgroundColor: AMBER }]} onPress={() => toggleFormat(t.key)}>
                        <FontAwesome5 name={t.icon} size={13} color={active ? C.white : C.dark} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Color picker */}
                <Text style={[nt.fieldLabel, { marginTop: 16 }]}>Color</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {NOTE_COLORS.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[nt.colorBtn, { backgroundColor: c.bg, borderColor: c.border }, selectedColor === c.id && { borderWidth: 3 }]}
                      onPress={() => setSelectedColor(c.id)}
                    >
                      <View style={[nt.colorDot, { backgroundColor: c.dot }]} />
                      {selectedColor === c.id && (
                        <View style={nt.colorCheck}>
                          <FontAwesome5 name="check" size={8} color={C.white} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Tags */}
                <Text style={nt.fieldLabel}>Tags</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {NOTE_TAGS.map(tag => {
                    const active = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[nt.tagBtn, active && { backgroundColor: AMBER, borderColor: AMBER }]}
                        onPress={() => toggleTag(tag)}
                      >
                        {active && <FontAwesome5 name="check" size={9} color={C.white} style={{ marginRight: 4 }} />}
                        <Text style={[{ fontSize: 12, fontWeight: '600', color: C.g600 }, active && { color: C.white }]}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={nt.footer}>
                <TouchableOpacity style={nt.cancelBtn} onPress={() => { setShowAdd(false); resetForm(); }} disabled={saving}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.g600 }}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[nt.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={C.white} />
                    : <><FontAwesome5 name="sticky-note" size={13} color={C.white} /><Text style={{ color: C.white, fontWeight: '700', fontSize: 14, marginLeft: 8 }}>Save Note</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
      </Modal>
    </View>
  );
};

const nt = StyleSheet.create({
  card:         { borderLeftWidth: 4, borderRadius: 16, padding: 14, marginBottom: 12 },
  avatar:       { width: 36, height: 36, borderRadius: 10 },
  author:       { fontSize: 13, fontWeight: '700', color: C.dark },
  time:         { fontSize: 10, color: C.g400, marginTop: 1 },
  readMore:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 8, borderTopWidth: 1 },
  readMoreTxt:  { fontSize: 12, fontWeight: '700' },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, maxHeight: '92%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle:   { fontSize: 17, fontWeight: '800', color: C.dark },
  // preview
  preview:      { borderRadius: 16, borderWidth: 2, padding: 14, marginBottom: 16 },
  previewTitle: { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 6 },
  previewTag:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  // fields
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: C.g600, marginBottom: 6 },
  titleInput:   { fontSize: 15, fontWeight: '600', color: C.dark, borderBottomWidth: 1.5, borderBottomColor: C.g200, paddingBottom: 8, marginBottom: 4 },
  contentInput: { fontSize: 14, color: C.dark, minHeight: 110, lineHeight: 22, borderWidth: 1.5, borderColor: C.g200, borderRadius: 12, padding: 12 },
  // toolbar
  toolbar:      { flexDirection: 'row', gap: 6, paddingTop: 8, marginBottom: 4 },
  toolbarBtn:   { width: 36, height: 36, borderRadius: 8, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  // color
  colorBtn:     { width: 40, height: 40, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  colorDot:     { width: 16, height: 16, borderRadius: 8 },
  colorCheck:   { position: 'absolute', bottom: -5, right: -5, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  // tags
  tagBtn:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: C.g200 },
  // footer
  footer:       { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.g100 },
  cancelBtn:    { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.g200, alignItems: 'center', justifyContent: 'center' },
  saveBtn:      { flex: 1, flexDirection: 'row', backgroundColor: AMBER, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: INVOICES
// ═════════════════════════════════════════════════════════════════════════════
const STATUS_META = {
  DRAFT:     { label: 'Draft',     color: C.g500,      bg: C.g100      },
  PENDING:   { label: 'Pending',   color: C.amber600,  bg: C.amber50   },
  PAID:      { label: 'Paid',      color: C.green600,  bg: C.green50   },
  OVERDUE:   { label: 'Overdue',   color: C.red600,    bg: C.red50     },
  CANCELLED: { label: 'Cancelled', color: C.g400,      bg: C.g100      },
};

const InvoicesTab = ({ invoices: propInvoices = [], loading = false }) => {
  const [localInvoices, setLocalInvoices] = useState(propInvoices);
  const [actionLoading, setActionLoading] = useState({});
  const [viewInvoice,   setViewInvoice]   = useState(null);

  useEffect(() => { setLocalInvoices(propInvoices); }, [propInvoices]);

  const invoices = localInvoices;

  const totalAmount  = invoices.reduce((s, inv) => s + (inv.total_amount || 0), 0);
  const paidAmount   = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.total_amount || 0), 0);
  const pendingCount = invoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE').length;

  const handleDeleteInvoice = (inv) => {
    Alert.alert('Delete Invoice', `Delete invoice ${inv.invoice_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await billingAPI.deleteInvoice(inv.id);
          setLocalInvoices(prev => prev.filter(i => i.id !== inv.id));
        } catch (err) {
          Alert.alert('Error', err.message || 'Could not delete invoice.');
        }
      }},
    ]);
  };

  const fmt = (n) => n?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) ?? '$0';

  const setLoading = (id, action, val) =>
    setActionLoading(prev => ({ ...prev, [`${id}_${action}`]: val }));
  const isLoading = (id, action) => !!actionLoading[`${id}_${action}`];

  const handleSend = (inv) => {
    Alert.alert(
      'Send Invoice',
      `Send invoice ${inv.invoice_number} to the client?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send', style: 'default',
          onPress: async () => {
            setLoading(inv.id, 'send', true);
            try {
              await billingAPI.sendInvoice(inv.id);
              Alert.alert('Sent', `Invoice ${inv.invoice_number} has been sent.`);
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not send invoice.');
            } finally {
              setLoading(inv.id, 'send', false);
            }
          },
        },
      ]
    );
  };

  const handleRemind = (inv) => {
    Alert.alert(
      'Send Reminder',
      `Send a payment reminder for ${inv.invoice_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Reminder', style: 'default',
          onPress: async () => {
            setLoading(inv.id, 'remind', true);
            try {
              await billingAPI.sendReminder(inv.id);
              Alert.alert('Reminder Sent', `Reminder for ${inv.invoice_number} has been sent.`);
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not send reminder.');
            } finally {
              setLoading(inv.id, 'remind', false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ paddingTop: 4 }}>

      {/* Summary cards */}
      {!loading && invoices.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 }}>
          {[
            { label: 'Total Billed',  value: fmt(totalAmount), icon: 'file-invoice-dollar', color: C.primary,  bg: C.blue50   },
            { label: 'Collected',     value: fmt(paidAmount),  icon: 'check-circle',        color: C.green600, bg: C.green50  },
            { label: 'Pending',       value: `${pendingCount} inv.`, icon: 'clock',          color: C.amber600, bg: C.amber50  },
          ].map(s => (
            <View key={s.label} style={[inv_s.summaryCard, { backgroundColor: s.bg }]}>
              <View style={[inv_s.summaryIcon, { backgroundColor: s.color + '22' }]}>
                <FontAwesome5 name={s.icon} size={14} color={s.color} />
              </View>
              <Text style={[inv_s.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={inv_s.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <Card accent={C.green600}>
        <SectionHead icon="file-invoice-dollar" iconColor={C.green600} title={`Invoices (${invoices.length})`} />

        {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}

        {!loading && invoices.length === 0 && (
          <View style={ov.emptyBox}>
            <FontAwesome5 name="file-invoice" size={28} color={C.g300} />
            <Text style={ov.emptyTxt}>No invoices for this case</Text>
          </View>
        )}

        {!loading && invoices.map((inv) => {
          const meta     = STATUS_META[inv.status] || STATUS_META.DRAFT;
          const dueDate  = inv.due_date
            ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
          const isOverdue = inv.status === 'OVERDUE';
          const clientName = inv.client
            ? `${inv.client.first_name || ''} ${inv.client.last_name || ''}`.trim()
            : '—';

          return (
            <View key={inv.id} style={[inv_s.card, isOverdue && { borderLeftColor: C.red600, borderLeftWidth: 3 }]}>
              {/* Top row */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                <View style={inv_s.invoiceIcon}>
                  <FontAwesome5 name="file-invoice-dollar" size={18} color={C.green600} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={inv_s.invoiceNum}>{inv.invoice_number}</Text>
                  <Text style={inv_s.clientName}>{clientName}</Text>
                </View>
                <View style={[inv_s.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[inv_s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              {/* Amount + due date */}
              <View style={inv_s.amountRow}>
                <View>
                  <Text style={inv_s.amountLabel}>Total Amount</Text>
                  <Text style={inv_s.amountValue}>{fmt(inv.total_amount)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={inv_s.amountLabel}>Due Date</Text>
                  <Text style={[inv_s.dueDate, isOverdue && { color: C.red600 }]}>
                    {isOverdue && <FontAwesome5 name="exclamation-circle" size={10} color={C.red600} />}
                    {' '}{dueDate}
                  </Text>
                </View>
              </View>

              {/* Items preview */}
              {inv.invoice_item && inv.invoice_item.length > 0 && (
                <View style={inv_s.itemsBox}>
                  {inv.invoice_item.slice(0, 2).map((item, idx) => (
                    <View key={idx} style={inv_s.itemRow}>
                      <Text style={inv_s.itemDesc} numberOfLines={1}>{item.description}</Text>
                      <Text style={inv_s.itemPrice}>{fmt(item.quantity * item.unit_price)}</Text>
                    </View>
                  ))}
                  {inv.invoice_item.length > 2 && (
                    <Text style={inv_s.itemMore}>+{inv.invoice_item.length - 2} more items</Text>
                  )}
                </View>
              )}

              {/* Actions */}
              <View style={inv_s.actions}>
                <TouchableOpacity style={inv_s.actionBtn} onPress={() => setViewInvoice(inv)}>
                  <FontAwesome5 name="eye" size={11} color={C.primary} />
                  <Text style={[inv_s.actionTxt, { color: C.primary }]}>View</Text>
                </TouchableOpacity>
                {inv.status !== 'PAID' && (
                  <TouchableOpacity
                    style={[inv_s.actionBtn, { backgroundColor: C.red50 }]}
                    onPress={() => handleDeleteInvoice(inv)}
                  >
                    <FontAwesome5 name="trash-alt" size={11} color={C.red600} />
                    <Text style={[inv_s.actionTxt, { color: C.red600 }]}>Delete</Text>
                  </TouchableOpacity>
                )}
                {inv.status === 'DRAFT' && (
                  <TouchableOpacity
                    style={[inv_s.actionBtn, { backgroundColor: C.green50 }, isLoading(inv.id, 'send') && { opacity: 0.5 }]}
                    onPress={() => handleSend(inv)}
                    disabled={isLoading(inv.id, 'send')}
                  >
                    {isLoading(inv.id, 'send')
                      ? <ActivityIndicator size={11} color={C.green600} />
                      : <FontAwesome5 name="paper-plane" size={11} color={C.green600} />
                    }
                    <Text style={[inv_s.actionTxt, { color: C.green600 }]}>Send</Text>
                  </TouchableOpacity>
                )}
                {(inv.status === 'PENDING' || inv.status === 'OVERDUE') && (
                  <TouchableOpacity
                    style={[inv_s.actionBtn, { backgroundColor: C.amber50 }, isLoading(inv.id, 'remind') && { opacity: 0.5 }]}
                    onPress={() => handleRemind(inv)}
                    disabled={isLoading(inv.id, 'remind')}
                  >
                    {isLoading(inv.id, 'remind')
                      ? <ActivityIndicator size={11} color={C.amber600} />
                      : <FontAwesome5 name="bell" size={11} color={C.amber600} />
                    }
                    <Text style={[inv_s.actionTxt, { color: C.amber600 }]}>Remind</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      {/* ── Invoice Detail Modal ── */}
      <Modal visible={!!viewInvoice} transparent animationType="slide" onRequestClose={() => setViewInvoice(null)}>
        <View style={inv_s.modalOverlay}>
          <View style={inv_s.modalSheet}>
            {viewInvoice && (() => {
              const inv  = viewInvoice;
              const meta = STATUS_META[inv.status] || STATUS_META.DRAFT;
              const clientName = inv.client
                ? `${inv.client.first_name || ''} ${inv.client.last_name || ''}`.trim()
                : '—';
              const dueDate = inv.due_date
                ? new Date(inv.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—';
              const issueDate = inv.issue_date
                ? new Date(inv.issue_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—';
              return (
                <>
                  {/* Header */}
                  <View style={inv_s.modalHeader}>
                    <View>
                      <Text style={inv_s.modalInvNum}>{inv.invoice_number}</Text>
                      <Text style={inv_s.modalClient}>{clientName}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[inv_s.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={[inv_s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setViewInvoice(null)}>
                        <FontAwesome5 name="times" size={16} color={C.g500} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Dates */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={inv_s.modalFieldLabel}>Issue Date</Text>
                      <Text style={inv_s.modalFieldValue}>{issueDate}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={inv_s.modalFieldLabel}>Due Date</Text>
                      <Text style={[inv_s.modalFieldValue, inv.status === 'OVERDUE' && { color: C.red600 }]}>{dueDate}</Text>
                    </View>
                  </View>

                  {/* Items */}
                  {inv.invoice_item && inv.invoice_item.length > 0 && (
                    <View style={inv_s.itemsBox}>
                      <Text style={inv_s.modalFieldLabel}>Items</Text>
                      {inv.invoice_item.map((item, idx) => (
                        <View key={idx} style={[inv_s.itemRow, { paddingVertical: 6 }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={inv_s.itemDesc}>{item.description}</Text>
                            <Text style={{ fontSize: 11, color: C.g400 }}>Qty: {item.quantity} × {fmt(item.unit_price)}</Text>
                          </View>
                          <Text style={[inv_s.itemPrice, { fontSize: 13 }]}>{fmt(item.quantity * item.unit_price)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Total */}
                  <View style={inv_s.totalRow}>
                    <Text style={inv_s.totalLabel}>Total</Text>
                    <Text style={inv_s.totalValue}>{fmt(inv.total_amount)}</Text>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const inv_s = StyleSheet.create({
  // Summary cards
  summaryCard:  { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 4 },
  summaryIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  summaryValue: { fontSize: 15, fontWeight: '900' },
  summaryLabel: { fontSize: 10, color: C.g500, fontWeight: '600', textAlign: 'center' },

  // Invoice card
  card:         { backgroundColor: C.g50, borderRadius: 16, padding: 14, marginBottom: 10 },
  invoiceIcon:  { width: 46, height: 46, borderRadius: 13, backgroundColor: C.green50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  invoiceNum:   { fontSize: 14, fontWeight: '800', color: C.dark },
  clientName:   { fontSize: 12, color: C.g500, marginTop: 2 },
  statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusTxt:    { fontSize: 11, fontWeight: '800' },

  // Amount row
  amountRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  amountLabel:  { fontSize: 10, color: C.g400, fontWeight: '600', marginBottom: 3 },
  amountValue:  { fontSize: 20, fontWeight: '900', color: C.dark },
  dueDate:      { fontSize: 13, fontWeight: '700', color: C.dark },

  // Items
  itemsBox:     { borderTopWidth: 1, borderTopColor: C.g200, paddingTop: 10, marginBottom: 10 },
  itemRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  itemDesc:     { fontSize: 12, color: C.g600, flex: 1 },
  itemPrice:    { fontSize: 12, fontWeight: '700', color: C.dark, marginLeft: 8 },
  itemMore:     { fontSize: 11, color: C.g400, fontStyle: 'italic' },

  // Actions
  actions:      { flexDirection: 'row', gap: 8 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.blue50, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  actionTxt:    { fontSize: 12, fontWeight: '700' },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalInvNum:     { fontSize: 17, fontWeight: '900', color: C.dark },
  modalClient:     { fontSize: 13, color: C.g500, marginTop: 2 },
  modalFieldLabel: { fontSize: 11, color: C.g400, fontWeight: '600', marginBottom: 3 },
  modalFieldValue: { fontSize: 13, fontWeight: '700', color: C.dark },
  totalRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1.5, borderTopColor: C.g200, paddingTop: 12, marginTop: 4 },
  totalLabel:      { fontSize: 14, fontWeight: '800', color: C.dark },
  totalValue:      { fontSize: 22, fontWeight: '900', color: C.green600 },
});

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: TIMELINE
// ═════════════════════════════════════════════════════════════════════════════
const TimelineTab = ({ timeline: propTimeline = [], loading = false }) => {
  const items = propTimeline.map(toTimelineDisplay);

  // Group by day
  const groups = [];
  const seen   = {};
  items.forEach(item => {
    if (!seen[item.day]) { seen[item.day] = true; groups.push({ day: item.day, entries: [] }); }
    groups[groups.length - 1].entries.push(item);
  });

  return (
    <View style={{ paddingTop: 4 }}>

      {/* Header card */}
      <View style={tl.header}>
        <View style={tl.headerLeft}>
          <View style={tl.headerIcon}>
            <FontAwesome5 name="stream" size={16} color={C.white} />
          </View>
          <View>
            <Text style={tl.headerTitle}>Case Timeline</Text>
            <Text style={tl.headerSub}>{items.length} {items.length === 1 ? 'event' : 'events'}</Text>
          </View>
        </View>
      </View>

      {loading && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={{ color: C.g400, fontSize: 12, marginTop: 10 }}>Loading activity…</Text>
        </View>
      )}

      {!loading && items.length === 0 && (
        <View style={tl.empty}>
          <View style={tl.emptyIcon}>
            <FontAwesome5 name="stream" size={28} color={C.g300} />
          </View>
          <Text style={tl.emptyTitle}>No activity yet</Text>
          <Text style={tl.emptySub}>Events will appear here as the case progresses</Text>
        </View>
      )}

      {!loading && groups.map((group, gi) => (
        <View key={group.day}>
          {/* Day label */}
          <View style={tl.dayRow}>
            <View style={tl.dayLine} />
            <View style={tl.dayPill}>
              <Text style={tl.dayTxt}>{group.day}</Text>
            </View>
            <View style={tl.dayLine} />
          </View>

          {/* Events — card list */}
          <View style={tl.groupCard}>
            {group.entries.map((item, idx) => (
              <View key={item.id} style={[tl.entryRow, idx < group.entries.length - 1 && tl.entryBorder]}>
                <View style={[tl.dot, { backgroundColor: item.bg }]}>
                  <FontAwesome5 name={item.icon} size={12} color={item.color} />
                </View>
                <View style={tl.entryBody}>
                  <Text style={tl.actionTxt} numberOfLines={2}>{item.action}</Text>
                  {!!item.actor && item.actor !== 'System' && (
                    <Text style={tl.actorTxt}>by {item.actor}</Text>
                  )}
                </View>
                <Text style={tl.timeTxt}>{item.time}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: 24 }} />
    </View>
  );
};

const tl = StyleSheet.create({
  // Header
  header:       { marginHorizontal: 16, marginBottom: 16, backgroundColor: C.primary, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIcon:   { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  // Empty
  empty:        { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon:    { width: 72, height: 72, borderRadius: 22, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:   { fontSize: 16, fontWeight: '800', color: C.dark, marginBottom: 6 },
  emptySub:     { fontSize: 13, color: C.g400, textAlign: 'center', lineHeight: 19 },

  // Day separator
  dayRow:       { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10 },
  dayLine:      { flex: 1, height: 1, backgroundColor: C.g200 },
  dayPill:      { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: C.g100, marginHorizontal: 10 },
  dayTxt:       { fontSize: 11, fontWeight: '700', color: C.g500, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Group card
  groupCard:    { marginHorizontal: 16, marginBottom: 8, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.g100, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },

  // Entry row
  entryRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  entryBorder:  { borderBottomWidth: 1, borderBottomColor: C.g100 },
  entryBody:    { flex: 1, marginLeft: 12, marginRight: 8 },

  // Dot
  dot:          { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Text
  actionTxt:    { fontSize: 13, fontWeight: '700', color: C.dark, lineHeight: 18 },
  actorTxt:     { fontSize: 11, color: C.g500, marginTop: 2 },
  timeTxt:      { fontSize: 11, color: C.g400, flexShrink: 0 },
});

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
export default function CaseDetailsScreen({ navigation, route }) {
  const rawCase  = route?.params?.caseData || CASE;
  // Supabase returns `id`; some navigation paths pass `_id` — normalise to `_id`
  const caseData = rawCase._id ? rawCase : { ...rawCase, _id: rawCase.id };
  const pr = PRIORITY[caseData.priority] || PRIORITY.urgent;

  const [activeTab,  setActiveTab]  = useState('overview');
  const [editMode,   setEditMode]   = useState(false);
  const [documents,  setDocuments]  = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [notes,      setNotes]      = useState([]);
  const [timeline,   setTimeline]   = useState([]);
  const [events,     setEvents]     = useState([]);
  const [invoices,   setInvoices]   = useState([]);
  const [team,       setTeam]       = useState([]);
  const [lawyerId,   setLawyerId]   = useState(caseData.lawyer_id ?? null);
  const [stats,      setStats]      = useState(caseData.stats || { docs: 0, tasks: 0, events: 0, notes: 0 });
  const [tabLoading, setTabLoading] = useState(false);
  const [saving,     setSaving]     = useState(false);

  const initialFormRef = React.useRef({
    title:       caseData.title       ?? '',
    caseType:    caseData.type        ?? '',
    phase:       caseData.phase       ?? '',
    priority:    (caseData.priority   ?? 'normal').toLowerCase(),
    court:       caseData.court       ?? '',
    judge:       caseData.judge       ?? '',
    attorney:    caseData.attorney    ?? '',
    description: caseData.description ?? '',
    filingDate:  caseData.filingDate  ?? '',
    nextHearing: caseData.nextHearing?.label ?? '',
    tags:        [...(caseData.tags || [])],
  });

  const [form, setForm] = useState(initialFormRef.current);

  const handleSave = async () => {
    setSaving(true);
    try {
      const caseId = caseData._id;
      if (caseId) {
        // Build body with only fields the backend accepts (UpdateCaseRequest)
        const body = {};
        if (form.title)       body.title        = form.title;
        if (form.description) body.description  = form.description;
        if (form.priority)    body.priority     = form.priority.toUpperCase();
        if (form.court)       body.court_name   = form.court;
        if (form.filingDate)  body.filing_date  = form.filingDate;
        if (form.nextHearing) body.first_hearing_date = form.nextHearing;
        // case_type must match enum (CRIMINAL, CIVIL, etc.) — only send if already uppercase
        if (form.caseType && /^[A-Z_]+$/.test(form.caseType)) {
          body.case_type = form.caseType;
        }
        await casesAPI.update(caseId, body);
      }
      setEditMode(false);
      Alert.alert('Saved', 'Changes saved successfully.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setForm(initialFormRef.current);
    setEditMode(false);
  };

  const loadTeam = useCallback(async () => {
    const caseId = caseData._id;
    if (!caseId) return;
    try {
      const data = await casesAPI.getTeam(caseId);
      setTeam(Array.isArray(data) ? data : []);
    } catch { setTeam([]); }
  }, [caseData._id]);

  useEffect(() => {
    const caseId = caseData._id;
    if (!caseId) return;
    let cancelled = false;
    const fetchAll = async () => {
      setTabLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const [tl, tk, docs, nts, evts, invs, tm, fullCase] = await Promise.all([
          casesAPI.getTimeline(caseId).catch(() => []),
          tasksAPI.list({ case_id: caseId }).catch(() => []),
          documentsAPI.list({ case_id: caseId }).catch(() => []),
          notesAPI.list({ case_id: caseId }).catch(() => []),
          calendarAPI.listEvents({ case_id: caseId, from_date: today }).catch(() => []),
          billingAPI.listInvoices({ case_id: caseId }).catch(() => []),
          casesAPI.getTeam(caseId).catch(() => []),
          casesAPI.getById(caseId).catch(() => null),
        ]);
        if (cancelled) return;
        const safeArr = (v) => (Array.isArray(v) ? v : []);
        const tlArr   = safeArr(tl);
        const tkArr   = safeArr(tk);
        const docsArr = safeArr(docs);
        const ntsArr  = safeArr(nts);
        const evtsArr = safeArr(evts);
        const invsArr = safeArr(invs);
        if (fullCase?.lawyer_id) setLawyerId(fullCase.lawyer_id);
        setTimeline(tlArr);
        setTasks(tkArr);
        setDocuments(docsArr);
        setNotes(ntsArr);
        setEvents(evtsArr);
        setInvoices(invsArr);
        setTeam(safeArr(tm));
        setStats({ docs: docsArr.length, tasks: tkArr.length, events: evtsArr.length, notes: ntsArr.length });
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [caseData._id]);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':  return <OverviewTab  caseData={caseData} events={events} stats={stats} editMode={editMode} setEditMode={setEditMode} form={form} setForm={setForm} />;
      case 'documents': return <DocumentsTab documents={documents} stats={stats} loading={tabLoading} caseId={caseData._id} onUploaded={(n) => setStats(s => ({ ...s, docs: n }))} />;
      case 'tasks':     return <TasksTab     tasks={tasks}     stats={stats} loading={tabLoading} caseId={caseData._id} team={team} />;
      case 'invoices':  return <InvoicesTab  invoices={invoices}            loading={tabLoading} />;
      case 'notes':     return <NotesTab     notes={notes}     stats={stats} loading={tabLoading} caseId={caseData._id} navigation={navigation} caseData={caseData} />;
      case 'team':      return <TeamTab      team={team}                    loading={tabLoading} caseId={caseData._id} lawyerId={lawyerId} onTeamChange={loadTeam} />;
      case 'timeline':  return <TimelineTab  timeline={timeline}            loading={tabLoading} />;
    }
  };

  const tabCounts = {
    overview:  null,
    documents: stats.docs,
    tasks:     stats.tasks,
    invoices:  invoices.length || null,
    notes:     stats.notes,
    team:      team.length || null,
    timeline:  null,
  };

  return (
    <SafeAreaView style={sc.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.slate900} />

      {/* ── DARK HEADER ─────────────────────────────────────────── */}
      <View style={sc.header}>

        {/* Nav row */}
        <View style={sc.navRow}>
          <TouchableOpacity style={sc.navBtn} onPress={() => navigation?.goBack?.()}>
            <FontAwesome5 name="arrow-left" size={15} color={C.white} />
          </TouchableOpacity>
          <Text style={sc.navTitle}>Case Details</Text>
          <TouchableOpacity
            style={sc.navBtn}
            onPress={() => Alert.alert('Archive Case', 'Are you sure you want to archive this case?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Archive', style: 'destructive',
                onPress: async () => {
                  try {
                    await casesAPI.archive(caseData._id);
                    navigation?.goBack?.();
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Could not archive this case.');
                  }
                },
              },
            ])}
          >
            <FontAwesome5 name="archive" size={14} color={C.white} />
          </TouchableOpacity>
        </View>

        {!editMode && (
          <>
            {/* Badges row */}
            <View style={sc.badgeRow}>
              <View style={[sc.priPill, { backgroundColor: pr.color }]}>
                <View style={sc.priDot} />
                <Text style={sc.priTxt}>{pr.label.toUpperCase()}</Text>
              </View>
              <View style={sc.typePill}>
                <Text style={sc.typeTxt}>{caseData.type}</Text>
              </View>
              <View style={sc.typePill}>
                <Text style={sc.typeTxt}>{caseData.phase}</Text>
              </View>
            </View>

            {/* Hero title */}
            <Text style={sc.heroTitle}>{caseData.title}</Text>
            <Text style={sc.heroSub}>{caseData.subtitle}</Text>

            {/* Stats pills */}
            <View style={sc.statsPills}>
              {[
                { icon: 'file-alt',    value: stats.docs,   label: 'Docs',   color: '#60A5FA' },
                { icon: 'check-square',value: stats.tasks,  label: 'Tasks',  color: '#FCD34D' },
                { icon: 'calendar',    value: stats.events, label: 'Events', color: '#6EE7B7' },
                { icon: 'sticky-note', value: stats.notes,  label: 'Notes',  color: '#C4B5FD' },
              ].map(s => (
                <View key={s.label} style={sc.statPill}>
                  <FontAwesome5 name={s.icon} size={12} color={s.color} />
                  <Text style={[sc.statNum, { color: s.color }]}>{s.value ?? 0}</Text>
                  <Text style={sc.statLbl}>{s.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

      </View>

      {/* ── CLIENT STRIP ──────────────────────────────────────────── */}
      {!editMode && <View style={sc.clientStrip}>
        <View style={sc.clientLeft}>
          {caseData.client?.avatar ? (
            <Image source={{ uri: caseData.client.avatar }} style={sc.clientAvatar} />
          ) : (
            <View style={[sc.clientAvatar, { backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.primary }}>
                {(caseData.client?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
          )}
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={sc.clientName}>{caseData.client.name}</Text>
            <Text style={sc.clientMeta}>{caseData.client.since}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
              <Badge label={caseData.client.status} color={C.primary}  bg={C.blue50}  />
              <Badge label={caseData.client.tier}   color={C.green600} bg={C.green50} />
            </View>
          </View>
        </View>
        <View style={sc.clientActions}>
          <TouchableOpacity
            style={[sc.contactCircle, { backgroundColor: C.green50 }]}
            onPress={() => {
              const p = caseData.client?.phone;
              if (!p || p === '—') return Alert.alert('Unavailable', 'No phone number on file.');
              Linking.openURL(`tel:${p}`);
            }}
          >
            <FontAwesome5 name="phone" size={13} color={C.green600} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[sc.contactCircle, { backgroundColor: C.blue50 }]}
            onPress={() => {
              const e = caseData.client?.email;
              if (!e || e === '—') return Alert.alert('Unavailable', 'No email address on file.');
              Linking.openURL(`mailto:${e}`);
            }}
          >
            <FontAwesome5 name="envelope" size={12} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[sc.contactCircle, { backgroundColor: C.purple50 }]}
            onPress={() => {
              const p = caseData.client?.phone;
              if (!p || p === '—') return Alert.alert('Unavailable', 'No phone number on file.');
              Linking.openURL(`sms:${p}`);
            }}
          >
            <FontAwesome5 name="comment" size={12} color={C.purple600} />
          </TouchableOpacity>
        </View>
      </View>}


      {/* ── TAB BAR ───────────────────────────────────────────────── */}
      <View style={sc.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {TABS.map(t => {
            const active = activeTab === t.key;
            const count  = tabCounts[t.key];
            return (
              <TouchableOpacity
                key={t.key}
                style={[sc.tabPill, active && sc.tabPillActive]}
                onPress={() => setActiveTab(t.key)}
              >
                <FontAwesome5 name={t.icon} size={11} color={active ? C.white : C.g500} />
                <Text style={[sc.tabPillTxt, active && sc.tabPillTxtActive]}>{t.label}</Text>
                {count != null && count > 0 && (
                  <View style={[sc.tabCount, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : C.g200 }]}>
                    <Text style={[sc.tabCountTxt, { color: active ? C.white : C.g600 }]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── SCROLLABLE CONTENT ────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        <ScrollView
          style={sc.scroll}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: editMode ? 100 : 50 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderTab()}
        </ScrollView>

        {/* ── EDIT MODE FOOTER ──────────────────────────────────────── */}
        {editMode && (
        <View style={sc.footer}>
          <TouchableOpacity style={sc.footerCancel} onPress={handleDiscard} disabled={saving}>
            <Text style={sc.footerCancelTxt}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[sc.footerSave, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={C.white} size="small" />
              : <>
                  <FontAwesome5 name="check" size={14} color={C.white} />
                  <Text style={sc.footerSaveTxt}>Save Changes</Text>
                </>
            }
          </TouchableOpacity>
        </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── SCREEN STYLES ────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.slate900 },
  scroll: { flex: 1, backgroundColor: C.bg },

  // Header
  header:    { backgroundColor: C.slate900, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  navRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  navBtn:    { width: 38, height: 38, borderRadius: 11, backgroundColor: C.glass, alignItems: 'center', justifyContent: 'center' },
  navTitle:  { fontSize: 17, fontWeight: '800', color: C.white },

  // Badges
  badgeRow:  { flexDirection: 'row', gap: 7, marginBottom: 14, alignItems: 'center' },
  priPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  priDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  priTxt:    { fontSize: 10, fontWeight: '900', color: C.white, letterSpacing: 0.8 },
  typePill:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: C.glassB },
  typeTxt:   { fontSize: 10, fontWeight: '600', color: C.onDarkSub },

  // Hero
  heroTitle: { fontSize: 26, fontWeight: '900', color: C.white, lineHeight: 32, marginBottom: 4 },
  heroSub:   { fontSize: 13, color: C.onDarkSub, marginBottom: 18 },

  // Stats pills
  statsPills:{ flexDirection: 'row', gap: 8 },
  statPill:  { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 3, backgroundColor: C.glassB, borderRadius: 14, paddingVertical: 10 },
  statNum:   { fontSize: 18, fontWeight: '900' },
  statLbl:   { fontSize: 9, color: C.onDarkMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Client strip
  clientStrip:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.g100 },
  clientLeft:    { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  clientAvatar:  { width: 52, height: 52, borderRadius: 16, borderWidth: 2.5, borderColor: C.primary },
  clientName:    { fontSize: 15, fontWeight: '800', color: C.dark },
  clientMeta:    { fontSize: 10, color: C.g400, marginTop: 2, fontWeight: '500' },
  clientActions: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  contactCircle: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  // Action bar
  actionBar:  { backgroundColor: C.white, maxHeight: 72, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.g100 },
  actionBtn:  { alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  actionIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionLabel:{ fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Tab bar
  tabBar:       { backgroundColor: C.white, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.g100 },
  tabPill:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, backgroundColor: C.g100 },
  tabPillActive:{ backgroundColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  tabPillTxt:   { fontSize: 12, fontWeight: '700', color: C.g500 },
  tabPillTxtActive: { color: C.white },
  tabCount:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  tabCountTxt:  { fontSize: 10, fontWeight: '800' },

  // Footer
  footer:          { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.g100 },
  footerCancel:    { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.g200, alignItems: 'center', justifyContent: 'center' },
  footerCancelTxt: { fontSize: 14, fontWeight: '700', color: C.g600 },
  footerSave:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 14, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  footerSaveTxt:   { fontSize: 15, fontWeight: '800', color: C.white },
});
