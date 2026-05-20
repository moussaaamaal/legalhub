import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, Linking,
  RefreshControl, Alert, Image, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { FontAwesome5, FontAwesome, Ionicons } from '@expo/vector-icons';
import { casesAPI, calendarAPI, dashboardAPI } from '../../services/api';

import CaseDetailsScreen from './CaseDetailsScreen';
import AddCaseScreen from './AddCaseScreen';
import VoiceNoteScreen from '../TasksNotes/VoiceNoteScreen';
import InvoiceScreen from '../Invoices/InvoiceScreen';
import CaseAIAssistantTab from './CaseAIAssistantTab';

// ─── COULEURS ──────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280',
  gray600: '#4B5563', gray700: '#374151',
  red50: '#FEF2F2', red100: '#FEE2E2', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
};

const Icon = ({ lib = 'FA5', name, size = 16, color = C.dark }) => {
  if (lib === 'FA5') return <FontAwesome5 name={name} size={size} color={color} />;
  if (lib === 'FA')  return <FontAwesome  name={name} size={size} color={color} />;
  if (lib === 'ION') return <Ionicons     name={name} size={size} color={color} />;
  return null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CASES_REF = [
  {
    id: 'CR-2024-1247', urgency: 'Urgent', urgencyIcon: 'fire',
    urgencyColor: C.red600, urgencyBg: C.red50, borderColor: C.red500,
    title: 'State vs. Johnson', subtitle: 'Criminal Defense - Assault Charges',
    tags: [{ label: 'Criminal Law', color: C.gray600, bg: C.gray100 }, { label: 'Trial Phase', color: C.purple600, bg: C.purple50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-8.jpg',
    client: 'Marcus Johnson', clientSince: 'Jan 2024',
    contacts: [
      { lib: 'FA', name: 'whatsapp', bg: C.green50, color: C.green600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Hearing', val: 'Today',  valColor: C.red600 },
      { label: 'Docs',    val: '23',     valColor: C.dark   },
      { label: 'Tasks',   val: '5',      valColor: C.amber600 },
      { label: 'Notes',   val: '12',     valColor: C.dark   },
    ],
    nextLabel: 'Next: Today 09:30 AM', calColor: C.red500,
    timeLeft: '3h left', timeLeftColor: C.red600, timeLeftBg: C.red50,
    // ── champs CaseDetailsScreen ──
    type: 'Criminal Law', phase: 'Trial Phase', priority: 'urgent',
    status: 'Active', filingDate: '2024-01-15',
    court: 'Manhattan Criminal Court', judge: 'Hon. Patricia Williams',
    prosecutor: 'DA Robert Chen', attorney: 'Sarah Williams - Lead Attorney',
    caseValue: '$45,000',
    description: 'Client is charged with assault in the second degree following an altercation at a local establishment. The prosecution alleges intentional harm, while the defense maintains self-defense. Key evidence includes surveillance footage and witness testimonies.',
    nextHearing: { label: 'Today', time: '09:30 AM', room: 'Room 305', countdown: '2h 47m' },
    clientData: {
      name: 'Marcus Johnson', id: 'CL-2024-089',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-8.jpg',
      since: 'January 15, 2024', phone: '+1 (555) 234-5678',
      email: 'm.johnson@email.com', address: '742 Evergreen Terrace, Springfield',
      status: 'Active', tier: 'Verified',
    },
  },
  {
    id: 'CV-2024-0892', urgency: 'Medium', urgencyIcon: 'exclamation-triangle',
    urgencyColor: C.amber600, urgencyBg: C.amber50, borderColor: C.amber600,
    title: 'Mitchell Corp. Contract Dispute', subtitle: 'Corporate Law - Breach of Contract',
    tags: [{ label: 'Corporate Law', color: C.gray600, bg: C.gray100 }, { label: 'Discovery', color: C.blue600, bg: C.blue50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg',
    client: 'Sarah Mitchell', clientSince: 'Dec 2023',
    contacts: [
      { lib: 'FA5', name: 'envelope', bg: C.purple50, color: C.purple600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Hearing', val: 'Mar 18', valColor: C.dark },
      { label: 'Docs',    val: '47',     valColor: C.dark },
      { label: 'Tasks',   val: '3',      valColor: C.amber600 },
      { label: 'Notes',   val: '8',      valColor: C.dark },
    ],
    nextLabel: 'Next: Mar 18, 11:00 AM', calColor: C.amber600,
    timeLeft: '2 days', timeLeftColor: C.amber600, timeLeftBg: C.amber50,
    type: 'Corporate Law', phase: 'Discovery', priority: 'medium',
    status: 'Active', filingDate: '2023-12-10',
    court: 'New York Civil Court', judge: 'Hon. James T. Murphy',
    prosecutor: 'Counsel: David Rivers', attorney: 'Michael Chen - Lead Attorney',
    caseValue: '$120,000',
    description: 'Mitchell Corporation disputes a contract amendment by their former vendor claiming breach of agreed terms. The case involves review of financial statements, email correspondence, and contractual obligations over a two-year period.',
    nextHearing: { label: 'Mar 18', time: '11:00 AM', room: 'Room 12', countdown: '2 days' },
    clientData: {
      name: 'Sarah Mitchell', id: 'CL-2023-512',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg',
      since: 'December 1, 2023', phone: '+1 (555) 987-6543',
      email: 's.mitchell@mitchellcorp.com', address: '1200 Fifth Avenue, New York',
      status: 'Active', tier: 'VIP',
    },
  },
  {
    id: 'FM-2024-0453', urgency: 'Normal', urgencyIcon: 'check',
    urgencyColor: C.green600, urgencyBg: C.green50, borderColor: C.green600,
    title: 'Chen Family Estate Planning', subtitle: 'Family Law - Estate Distribution',
    tags: [{ label: 'Family Law', color: C.gray600, bg: C.gray100 }, { label: 'Planning', color: C.green600, bg: C.green50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-4.jpg',
    client: 'Robert Chen', clientSince: 'Nov 2023',
    contacts: [
      { lib: 'FA', name: 'whatsapp', bg: C.green50, color: C.green600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Meeting', val: 'Mar 20', valColor: C.dark },
      { label: 'Docs',    val: '31',     valColor: C.dark },
      { label: 'Tasks',   val: '2',      valColor: C.green600 },
      { label: 'Notes',   val: '15',     valColor: C.dark },
    ],
    nextLabel: 'Next: Mar 20, 02:00 PM', calColor: C.green600,
    timeLeft: '4 days', timeLeftColor: C.green600, timeLeftBg: C.green50,
    type: 'Family Law', phase: 'Planning', priority: 'normal',
    status: 'Active', filingDate: '2023-11-20',
    court: 'Surrogate Court, NY', judge: 'Hon. Linda Park',
    prosecutor: 'N/A', attorney: 'Jennifer Davis - Lead Attorney',
    caseValue: '$320,000',
    description: 'Estate planning and distribution case for the Chen family following the passing of the patriarch. Involves reviewing existing wills, asset allocation, and potential disputes among beneficiaries.',
    nextHearing: null,
    clientData: {
      name: 'Robert Chen', id: 'CL-2023-498',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-4.jpg',
      since: 'November 20, 2023', phone: '+1 (555) 456-7890',
      email: 'r.chen@email.com', address: '55 Riverside Dr, New York',
      status: 'Active', tier: 'Verified',
    },
  },
  {
    id: 'PI-2024-0678', urgency: 'Urgent', urgencyIcon: 'fire',
    urgencyColor: C.red600, urgencyBg: C.red50, borderColor: C.red500,
    title: 'Williams Personal Injury Claim', subtitle: 'Personal Injury - Car Accident',
    tags: [{ label: 'Personal Injury', color: C.gray600, bg: C.gray100 }, { label: 'Litigation', color: C.red600, bg: C.red50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-6.jpg',
    client: 'Jennifer Williams', clientSince: 'Feb 2024',
    contacts: [
      { lib: 'FA', name: 'whatsapp', bg: C.green50, color: C.green600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Hearing',   val: 'Tomorrow', valColor: C.red600 },
      { label: 'Docs',      val: '19',       valColor: C.dark   },
      { label: 'Tasks',     val: '7',        valColor: C.red600 },
      { label: 'Notes',     val: '6',        valColor: C.dark   },
    ],
    nextLabel: 'Next: Tomorrow 10:00 AM', calColor: C.red500,
    timeLeft: '1 day', timeLeftColor: C.red600, timeLeftBg: C.red50,
    type: 'Personal Injury', phase: 'Litigation', priority: 'urgent',
    status: 'Active', filingDate: '2024-02-01',
    court: 'Queens Civil Court', judge: 'Hon. Antonio Rivera',
    prosecutor: 'Opposing: Clark & Assoc.', attorney: 'Sarah Williams - Lead Attorney',
    caseValue: '$85,000',
    description: 'Jennifer Williams suffered significant injuries in a car accident caused by a distracted driver. The case involves medical reports, accident reconstruction, and negotiation with the insurance company for fair compensation.',
    nextHearing: { label: 'Tomorrow', time: '10:00 AM', room: 'Room 8', countdown: '1 day' },
    clientData: {
      name: 'Jennifer Williams', id: 'CL-2024-201',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-6.jpg',
      since: 'February 1, 2024', phone: '+1 (555) 321-6549',
      email: 'j.williams@email.com', address: '88 Queens Blvd, Queens, NY',
      status: 'Active', tier: 'Standard',
    },
  },
  {
    id: 'RE-2024-0234', urgency: 'Normal', urgencyIcon: 'info-circle',
    urgencyColor: C.blue600, urgencyBg: C.blue50, borderColor: C.secondary,
    title: 'Thompson Real Estate Transaction', subtitle: 'Real Estate - Property Sale',
    tags: [{ label: 'Real Estate', color: C.gray600, bg: C.gray100 }, { label: 'Closing', color: C.blue600, bg: C.blue50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg',
    client: 'Michael Thompson', clientSince: 'Jan 2024',
    contacts: [
      { lib: 'FA5', name: 'envelope', bg: C.purple50, color: C.purple600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Closing', val: 'Mar 22', valColor: C.dark },
      { label: 'Docs',    val: '38',     valColor: C.dark },
      { label: 'Tasks',   val: '4',      valColor: C.blue600 },
      { label: 'Notes',   val: '9',      valColor: C.dark },
    ],
    nextLabel: 'Next: Mar 22, 03:00 PM', calColor: C.secondary,
    timeLeft: '6 days', timeLeftColor: C.blue600, timeLeftBg: C.blue50,
    type: 'Real Estate', phase: 'Closing', priority: 'normal',
    status: 'Active', filingDate: '2024-01-10',
    court: 'N/A', judge: 'N/A',
    prosecutor: 'Opposing: Barker Law Group', attorney: 'Michael Chen - Lead Attorney',
    caseValue: '$1,200,000',
    description: 'Michael Thompson is selling his Manhattan property and requires legal assistance with contract drafting, title searches, and closing procedures. The transaction involves multiple parties and requires careful coordination.',
    nextHearing: null,
    clientData: {
      name: 'Michael Thompson', id: 'CL-2024-178',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg',
      since: 'January 10, 2024', phone: '+1 (555) 654-3210',
      email: 'm.thompson@email.com', address: '420 Park Avenue, Manhattan',
      status: 'Active', tier: 'VIP',
    },
  },
  {
    id: 'IP-2024-0567', urgency: 'Normal', urgencyIcon: 'star',
    urgencyColor: C.purple600, urgencyBg: C.purple50, borderColor: C.purple600,
    title: 'Anderson IP Protection', subtitle: 'Intellectual Property - Trademark',
    tags: [{ label: 'IP Law', color: C.gray600, bg: C.gray100 }, { label: 'Filing', color: C.purple600, bg: C.purple50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-7.jpg',
    client: 'Lisa Anderson', clientSince: 'Mar 2024',
    contacts: [
      { lib: 'FA', name: 'whatsapp', bg: C.green50, color: C.green600 },
      { lib: 'FA5', name: 'envelope', bg: C.purple50, color: C.purple600 },
    ],
    stats: [
      { label: 'Filing', val: 'Mar 25', valColor: C.dark   },
      { label: 'Docs',   val: '15',     valColor: C.dark   },
      { label: 'Tasks',  val: '3',      valColor: C.purple600 },
      { label: 'Notes',  val: '5',      valColor: C.dark   },
    ],
    nextLabel: 'Next: Mar 25, 01:00 PM', calColor: C.purple600,
    timeLeft: '9 days', timeLeftColor: C.purple600, timeLeftBg: C.purple50,
    type: 'IP Law', phase: 'Filing', priority: 'normal',
    status: 'Active', filingDate: '2024-03-01',
    court: 'USPTO', judge: 'N/A',
    prosecutor: 'N/A', attorney: 'Jennifer Davis - Lead Attorney',
    caseValue: '$25,000',
    description: 'Lisa Anderson seeks trademark protection for her tech startup brand. The filing process involves trademark search, application preparation, and response to any USPTO office actions.',
    nextHearing: null,
    clientData: {
      name: 'Lisa Anderson', id: 'CL-2024-305',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-7.jpg',
      since: 'March 1, 2024', phone: '+1 (555) 789-0123',
      email: 'l.anderson@startup.io', address: '200 Tech Hub, Brooklyn, NY',
      status: 'Active', tier: 'Standard',
    },
  },
  {
    id: 'EM-2024-0345', urgency: 'Medium', urgencyIcon: 'exclamation-triangle',
    urgencyColor: C.amber600, urgencyBg: C.amber50, borderColor: C.amber600,
    title: 'Davis Employment Dispute', subtitle: 'Employment Law - Wrongful Termination',
    tags: [{ label: 'Employment Law', color: C.gray600, bg: C.gray100 }, { label: 'Mediation', color: C.amber600, bg: C.amber50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg',
    client: 'Thomas Davis', clientSince: 'Feb 2024',
    contacts: [
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
      { lib: 'FA5', name: 'envelope', bg: C.purple50, color: C.purple600 },
    ],
    stats: [
      { label: 'Mediation', val: 'Mar 19', valColor: C.dark },
      { label: 'Docs',      val: '26',     valColor: C.dark },
      { label: 'Tasks',     val: '4',      valColor: C.amber600 },
      { label: 'Notes',     val: '11',     valColor: C.dark },
    ],
    nextLabel: 'Next: Mar 19, 02:30 PM', calColor: C.amber600,
    timeLeft: '3 days', timeLeftColor: C.amber600, timeLeftBg: C.amber50,
    type: 'Employment Law', phase: 'Mediation', priority: 'medium',
    status: 'Active', filingDate: '2024-02-15',
    court: 'NLRB', judge: 'Mediator J. Collins',
    prosecutor: 'Employer: Global Inc. Legal', attorney: 'Michael Chen - Lead Attorney',
    caseValue: '$65,000',
    description: 'Thomas Davis was wrongfully terminated following a whistleblower complaint. The case involves reviewing termination documentation, communications, and preparing for mediation with the employer.',
    nextHearing: { label: 'Mar 19', time: '02:30 PM', room: 'Mediation Room B', countdown: '3 days' },
    clientData: {
      name: 'Thomas Davis', id: 'CL-2024-245',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg',
      since: 'February 15, 2024', phone: '+1 (555) 234-9876',
      email: 't.davis@email.com', address: '34 Midtown Ave, New York',
      status: 'Active', tier: 'Standard',
    },
  },
  {
    id: 'DV-2024-0123', urgency: 'Normal', urgencyIcon: 'check',
    urgencyColor: C.green600, urgencyBg: C.green50, borderColor: C.green600,
    title: 'Martinez Divorce Settlement', subtitle: 'Family Law - Divorce Proceedings',
    tags: [{ label: 'Family Law', color: C.gray600, bg: C.gray100 }, { label: 'Settlement', color: C.green600, bg: C.green50 }],
    avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg',
    client: 'Maria Martinez', clientSince: 'Dec 2023',
    contacts: [
      { lib: 'FA', name: 'whatsapp', bg: C.green50, color: C.green600 },
      { lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary },
    ],
    stats: [
      { label: 'Meeting', val: 'Mar 21', valColor: C.dark },
      { label: 'Docs',    val: '42',     valColor: C.dark },
      { label: 'Tasks',   val: '2',      valColor: C.green600 },
      { label: 'Notes',   val: '18',     valColor: C.dark },
    ],
    nextLabel: 'Next: Mar 21, 10:00 AM', calColor: C.green600,
    timeLeft: '5 days', timeLeftColor: C.green600, timeLeftBg: C.green50,
    type: 'Family Law', phase: 'Settlement', priority: 'normal',
    status: 'Active', filingDate: '2023-12-05',
    court: 'Family Court, NY', judge: 'Hon. Carol Burns',
    prosecutor: 'Opposing: Carter & Sons', attorney: 'Sarah Williams - Lead Attorney',
    caseValue: '$210,000',
    description: 'Divorce proceedings for Maria Martinez involving asset distribution, child custody arrangements, and spousal support. Both parties are working toward an amicable settlement to avoid prolonged litigation.',
    nextHearing: null,
    clientData: {
      name: 'Maria Martinez', id: 'CL-2023-488',
      avatar: 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg',
      since: 'December 5, 2023', phone: '+1 (555) 111-2233',
      email: 'm.martinez@email.com', address: '19 Sunset Blvd, Brooklyn',
      status: 'Active', tier: 'Verified',
    },
  },
];

const AI_INSIGHTS = [
  { iconBg: C.red500,   icon: 'exclamation', title: 'Urgent Deadline Alert',  desc: 'Motion filing due in 3 hours for CR-2024-1247', btn: 'View Case'   },
  { iconBg: C.amber600, icon: 'lightbulb',   title: 'Document Missing',       desc: '3 cases need additional documentation',         btn: 'Review'      },
  { iconBg: C.green600, icon: 'chart-line',  title: 'Case Trend Analysis',    desc: 'Similar cases show 92% success rate',           btn: 'See Details' },
];



// ─── Map raw API case → CaseDetailsScreen format ────────────────────────────
const rawToDetails = (raw) => {
  const typeLabel = TYPE_LABEL[(raw.case_type || '').toUpperCase()] || raw.case_type || '';
  const clientName = raw.client
    ? `${raw.client.first_name ?? ''} ${raw.client.last_name ?? ''}`.trim()
    : 'No Client';
  const filingLabel = raw.filing_date
    ? new Date(raw.filing_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const hearingLabel = raw.first_hearing_date
    ? new Date(raw.first_hearing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  return {
    _id:         raw.id,          // UUID — used by CaseDetailsScreen to fetch sub-data
    id:          raw.case_number,
    title:       raw.title,
    subtitle:    `${typeLabel} — ${(raw.status || '').replace(/_/g, ' ')}`,
    type:        typeLabel,
    phase:       (raw.status || '').replace(/_/g, ' '),
    priority:    (raw.priority || 'NORMAL').toLowerCase(),
    status:      raw.status,
    filingDate:  raw.filing_date || '',
    court:       raw.court_name       || '',
    judge:       raw.judge_name       || '',
    prosecutor:  raw.opposing_counsel || '',
    attorney:    '',
    caseValue:   raw.estimated_value ? `$${Number(raw.estimated_value).toLocaleString()}` : '',
    description: raw.description || '',
    tags:        [typeLabel, (raw.status || '').replace(/_/g, ' ')].filter(Boolean),
    nextHearing: hearingLabel
      ? { label: hearingLabel, time: '—', room: '—', countdown: '—' }
      : null,
    stats:        { docs: 0, tasks: 0, events: 0, notes: 0 },
    timeTracking: { billable: 0, nonBillable: 0 },
    client: {
      name:    clientName,
      id:      raw.client?.id      || '—',
      avatar:  null,
      since:   filingLabel,
      phone:   raw.client?.phone   || '—',
      email:   raw.client?.email   || '—',
      address: raw.client?.address || '—',
      status:  'Active',
      tier:    'Standard',
    },
  };
};

// ─── Activity helpers ─────────────────────────────────────────────────────
const getActivityMeta = (action = '') => {
  const a = action.toLowerCase();

  // ── Calendar event types (checked first — most specific) ─────────────
  if (a.includes('meeting scheduled'))
    return { icon: 'user-friends',    color: C.indigo600, bg: C.indigo100 };
  if (a.includes('consultation scheduled'))
    return { icon: 'comments',        color: C.purple600, bg: C.purple100 };
  if (a.includes('court hearing scheduled') || a.includes('court date scheduled'))
    return { icon: 'gavel',           color: C.red600,    bg: C.red100    };
  if (a.includes('deadline scheduled'))
    return { icon: 'exclamation-circle', color: C.amber600, bg: C.amber100 };
  if (a.includes('filing scheduled'))
    return { icon: 'file-alt',        color: C.primary,   bg: C.blue100   };
  if (a.includes('deposition scheduled'))
    return { icon: 'microphone',      color: C.gray600,   bg: C.gray200   };
  if (a.includes('mediation scheduled'))
    return { icon: 'handshake',       color: C.green600,  bg: C.green100  };
  if (a.includes('arbitration scheduled'))
    return { icon: 'balance-scale',   color: C.amber600,  bg: C.amber100  };
  if (a.includes('scheduled'))
    return { icon: 'calendar-check',  color: C.primary,   bg: C.blue100   };

  // ── Case timeline actions ─────────────────────────────────────────────
  if (a.includes('document') || a.includes('upload') || a.includes('filed') || a.includes('motion'))
    return { icon: 'file-alt',        color: C.primary,   bg: C.blue100   };
  if (a.includes('task') || a.includes('completed') || a.includes('assigned'))
    return { icon: 'tasks',           color: C.amber600,  bg: C.amber100  };
  if (a.includes('hearing') || a.includes('court'))
    return { icon: 'gavel',           color: C.red600,    bg: C.red100    };
  if (a.includes('appeal'))
    return { icon: 'gavel',           color: C.purple600, bg: C.purple100 };
  if (a.includes('trial'))
    return { icon: 'balance-scale',   color: C.red600,    bg: C.red100    };
  if (a.includes('opened') || a.includes('creat') || a.includes('new case'))
    return { icon: 'folder-plus',     color: C.green600,  bg: C.green100  };
  if (a.includes('archived'))
    return { icon: 'archive',         color: C.gray600,   bg: C.gray200   };
  if (a.includes('settled'))
    return { icon: 'handshake',       color: C.green600,  bg: C.green100  };
  if (a.includes('closed'))
    return { icon: 'check-circle',    color: C.green600,  bg: C.green100  };
  if (a.includes('status') || a.includes('changed') || a.includes('updated'))
    return { icon: 'exchange-alt',    color: C.blue600,   bg: C.blue100   };
  if (a.includes('note') || a.includes('comment'))
    return { icon: 'sticky-note',     color: C.purple600, bg: C.purple100 };
  if (a.includes('client') || a.includes('meeting'))
    return { icon: 'user-tie',        color: C.indigo600, bg: C.indigo100 };
  return { icon: 'history',           color: C.primary,   bg: C.blue100   };
};

// ─── Format raw action strings from the database ──────────────────────────
const ACTION_LABELS = {
  'case created':              'Case opened',
  'case archived':             'Case archived',
  'case details updated':      'Case details updated',
  'status changed to new':        'Status set to New',
  'status changed to investigation': 'Under Investigation',
  'status changed to pre_trial':  'Pre-Trial stage started',
  'status changed to trial':      'Trial stage started',
  'status changed to appeal':     'Appeal filed',
  'status changed to settled':    'Case settled',
  'status changed to closed':     'Case closed',
};
// Friendly labels for EventType enum values (used in old DB entries)
const _EV_FRIENDLY = {
  HEARING: 'Court Hearing', COURT_DATE: 'Court Date',
  MEETING: 'Meeting', CONSULTATION: 'Consultation',
  DEADLINE: 'Deadline', FILING: 'Filing',
  DEPOSITION: 'Deposition', MEDIATION: 'Mediation',
  ARBITRATION: 'Arbitration',
};

const formatAction = (raw = '') => {
  if (!raw) return 'Activity recorded';
  const key = raw.toLowerCase().trim();

  // ── Exact match lookup ──────────────────────────────────────────────
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];

  // ── Old DB format: "Event created: Title (EventType.X) (repeated Y)" ─
  // or "Event created: Title (EventType.X)"
  const legacyMatch = raw.match(
    /^Event created:\s*(.+?)\s*\(EventType\.(\w+)\)(.*)?$/i
  );
  if (legacyMatch) {
    const title      = legacyMatch[1].trim();
    const evTypeKey  = legacyMatch[2].toUpperCase();
    const extra      = (legacyMatch[3] || '').trim()
                         .replace(/\(repeated\s+/i, '(repeats ');
    const typeLabel  = _EV_FRIENDLY[evTypeKey]
                    || evTypeKey.replace(/_/g, ' ');
    return `${typeLabel} scheduled: ${title}${extra ? ' ' + extra : ''}`;
  }

  // ── Strip any remaining "EnumClass." prefix anywhere in the string ──
  return raw
    .replace(/\bEventType\./gi, '')
    .replace(/\bCaseStatus\./gi, '')
    .replace(/\bCasePriority\./gi, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Activity recorded';
};

const getRelativeTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getCountdown = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return { label: 'Passed', color: C.gray400 };
  const m = Math.floor(diff / 60000);
  if (m < 60) return { label: `${m}m left`,       color: C.red600   };
  const h = Math.floor(m / 60);
  if (h < 24) return { label: `${h}h left`,       color: C.red600   };
  const d = Math.floor(h / 24);
  if (d === 1) return { label: 'Tomorrow',         color: C.amber600 };
  if (d < 7)  return { label: `${d} days`,         color: C.amber600 };
  return { label: `${d} days`, color: C.primary };
};

// ─── COMPOSANTS ───────────────────────────────────────────────────────────
const CaseCard = ({ item, onViewDetails, onArchive, onUnarchive, onAIPress }) => {
  const archived = item.isArchived;
  return (
    <View style={[
      s.card,
      { borderLeftWidth: 4, borderLeftColor: archived ? C.gray400 : item.borderColor },
      archived && { backgroundColor: C.gray50 },
    ]}>
      {/* Header */}
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <View style={s.row}>
          <View style={[s.tag, { backgroundColor: archived ? C.gray100 : item.urgencyBg }]}>
            <View style={s.row}>
              <Icon lib="FA5" name={archived ? 'archive' : item.urgencyIcon} size={10} color={archived ? C.gray500 : item.urgencyColor} />
              <Text style={[s.tagText, { color: archived ? C.gray500 : item.urgencyColor, marginLeft: 4 }]}>
                {archived ? 'Archived' : item.urgency}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[s.cardTitle, archived && { color: C.gray500 }]}>{item.title}</Text>
      <Text style={[s.cardSubtitle, { marginBottom: 8 }, archived && { color: C.gray400 }]}>{item.subtitle}</Text>
      <View style={[s.row, { marginBottom: 12, flexWrap: 'wrap', gap: 6 }]}>
        {item.tags.map((t, i) => (
          <View key={i} style={[s.tag, { backgroundColor: archived ? C.gray100 : t.bg }]}>
            <Text style={[s.tagText, { color: archived ? C.gray400 : t.color }]}>{t.label}</Text>
          </View>
        ))}
      </View>

      {/* Client row */}
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }]}>
        <View style={s.row}>
          {item.avatar ? (
            <Image
              source={{ uri: item.avatar }}
              style={[s.avatarMd, { opacity: archived ? 0.4 : 1 }]}
            />
          ) : (
            <View style={[s.avatarMd, { backgroundColor: archived ? C.gray200 : C.blue100, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: archived ? C.gray500 : C.primary }}>
                {item.client.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
          )}
          <View style={{ marginLeft: 10 }}>
            <Text style={[s.clientName, archived && { color: C.gray500 }]}>{item.client}</Text>
            <Text style={s.clientSince}>Since: {item.clientSince}</Text>
          </View>
        </View>
        {/* Boutons contact — désactivés si archivé */}
        <View style={s.row}>
          {item.contacts.map((c, i) => (
            <TouchableOpacity
              key={i}
              disabled={archived}
              style={[s.iconBtn, { backgroundColor: archived ? C.gray100 : c.bg, marginLeft: 6 }]}
              onPress={() => !archived && c.action && Linking.openURL(c.action)}
            >
              <Icon lib={c.lib} name={c.name} size={14} color={archived ? C.gray400 : c.color} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats row */}
      <View style={[s.row, { justifyContent: 'space-around', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }]}>
        {item.stats.map((st, i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Text style={s.statLabel}>{st.label}</Text>
            <Text style={[s.statVal, { color: archived ? C.gray400 : st.valColor }]}>{st.val}</Text>
          </View>
        ))}
      </View>

      {/* Next event */}
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <View style={s.row}>
          <Icon lib="FA5" name="calendar" size={12} color={archived ? C.gray400 : item.calColor} />
          <Text style={[s.xs, { marginLeft: 6, color: archived ? C.gray400 : undefined }]}>{item.nextLabel}</Text>
        </View>
        <View style={[s.tag, { backgroundColor: archived ? C.gray100 : item.timeLeftBg }]}>
          <View style={s.row}>
            <Icon lib="FA5" name="clock" size={10} color={archived ? C.gray400 : item.timeLeftColor} />
            <Text style={[s.tagText, { color: archived ? C.gray400 : item.timeLeftColor, marginLeft: 4 }]}>{item.timeLeft}</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={s.row}>
        {/* View Details — désactivé si archivé */}
        <TouchableOpacity
          disabled={archived}
          style={[s.btnPrimary, archived && { backgroundColor: C.gray200 }]}
          onPress={() => !archived && onViewDetails(item)}
        >
          <Icon lib="FA5" name="eye" size={14} color={archived ? C.gray400 : C.white} />
          <Text style={[s.btnPrimaryText, { marginLeft: 6 }, archived && { color: C.gray400 }]}>View Details</Text>
        </TouchableOpacity>

        {/* Archive / Restore */}
        {archived ? (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.green50, marginLeft: 8, width: 44, height: 44 }]}
            onPress={() => onUnarchive && onUnarchive(item)}
          >
            <Icon lib="FA5" name="box-open" size={15} color={C.green600} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.red50, marginLeft: 8, width: 44, height: 44 }]}
            onPress={() => onArchive && onArchive(item)}
          >
            <Icon lib="FA5" name="archive" size={15} color={C.red600} />
          </TouchableOpacity>
        )}

        {/* AI — disabled if archived */}
        <TouchableOpacity
          disabled={archived}
          style={[s.iconBtn, { backgroundColor: archived ? C.gray100 : C.blue50, marginLeft: 8, width: 44, height: 44 }]}
          onPress={() => !archived && onAIPress && onAIPress(item)}
        >
          <Icon lib="FA5" name="robot" size={16} color={archived ? C.gray400 : C.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Priority → visual meta ───────────────────────────────────────────────
const PRIORITY_META = {
  URGENT: { urgency: 'Urgent', urgencyIcon: 'fire',                  urgencyColor: C.red600,    urgencyBg: C.red50,    borderColor: C.red500    },
  HIGH:   { urgency: 'High',   urgencyIcon: 'exclamation-triangle',  urgencyColor: C.red600,    urgencyBg: C.red50,    borderColor: C.red500    },
  MEDIUM: { urgency: 'Medium', urgencyIcon: 'minus-circle',          urgencyColor: C.amber600,  urgencyBg: C.amber50,  borderColor: C.amber500  },
  NORMAL: { urgency: 'Normal', urgencyIcon: 'check',                 urgencyColor: C.green600,  urgencyBg: C.green50,  borderColor: C.green600  },
  LOW:    { urgency: 'Low',    urgencyIcon: 'info-circle',           urgencyColor: C.green600,  urgencyBg: C.green50,  borderColor: C.green600  },
};

// ─── CaseType → label ─────────────────────────────────────────────────────
const TYPE_LABEL = {
  CRIMINAL:        'Criminal Law',
  CIVIL:           'Civil Law',
  CORPORATE:       'Corporate Law',
  FAMILY:          'Family Law',
  REAL_ESTATE:     'Real Estate',
  IMMIGRATION:     'Immigration',
  PERSONAL_INJURY: 'Personal Injury',
  IP:              'IP Law',
  LABOR:           'Labor Law',
  TAX:             'Tax Law',
  ADMINISTRATIVE:  'Administrative',
  CONSTITUTIONAL:  'Constitutional',
  ENVIRONMENTAL:   'Environmental',
  BANKING:         'Banking & Finance',
  MEDICAL:         'Medical Law',
  COMMERCIAL:      'Commercial Law',
  ARBITRATION:     'Arbitration',
  INTERNATIONAL:   'International Law',
  INHERITANCE:     'Inheritance',
  INSURANCE:       'Insurance',
};

// ─── EventType → friendly label ───────────────────────────────────────────
const EVENT_TYPE_LABELS = {
  HEARING:      'Court Hearing',
  COURT_DATE:   'Court Date',
  MEETING:      'Meeting',
  CONSULTATION: 'Consultation',
  DEADLINE:     'Deadline',
  FILING:       'Filing',
  DEPOSITION:   'Deposition',
  MEDIATION:    'Mediation',
  ARBITRATION:  'Arbitration',
  OTHER:        'Other Event',
};
const formatEventType = (raw = '') =>
  EVENT_TYPE_LABELS[(raw || '').toUpperCase()] ||
  raw.replace(/^EventType\./i, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

// ─── Status labels (sync with backend CaseStatus enum) ─────────────────────
const STATUS_LABEL = {
  NEW:           'New',
  INVESTIGATION: 'Investigation',
  PRE_TRIAL:     'Pre-trial',
  TRIAL:         'Trial',
  APPEAL:        'Appeal',
  SETTLED:       'Settled',
  CLOSED:        'Closed',
};

// ─── Filter config ─────────────────────────────────────────────────────────
const FILTER_CONFIG = [
  { key: 'all',    label: 'All Cases',  icon: 'briefcase',    filter: () => true },
  { key: 'urgent', label: 'Urgent',     icon: 'fire',         filter: c => ['URGENT','HIGH'].includes((c.priority || '').toUpperCase()) },
  { key: 'active', label: 'Active',     icon: 'clock',        filter: c => ['NEW','INVESTIGATION','PRE_TRIAL','TRIAL','APPEAL'].includes((c.status || '').toUpperCase()) },
  { key: 'closed', label: 'Closed',     icon: 'check-circle', filter: c => ['SETTLED','CLOSED'].includes((c.status || '').toUpperCase()) },
];

// ─── Map API case → CaseCard format ──────────────────────────────────────
const toCardFormat = (c) => {
  const pm          = PRIORITY_META[c.priority]  || PRIORITY_META.NORMAL;
  const typeLabel   = TYPE_LABEL[c.case_type]    || c.case_type;
  const clientName  = c.client
    ? `${c.client.first_name ?? ''} ${c.client.last_name ?? ''}`.trim()
    : 'No Client';
  const filingLabel = c.filing_date
    ? new Date(c.filing_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';
  const hearingLabel = c.first_hearing_date
    ? new Date(c.first_hearing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const isArchived = ['SETTLED', 'CLOSED'].includes((c.status || '').toUpperCase());

  return {
    _raw:         c,
    id:           c.case_number,
    isArchived,
    ...pm,
    // Grey out priority visuals for archived cases
    ...(isArchived ? {
      urgency:      'Archived',
      urgencyIcon:  'archive',
      urgencyColor: C.gray500,
      urgencyBg:    C.gray100,
      borderColor:  C.gray400,
    } : {}),
    title:        c.title,
    subtitle:     `${typeLabel} — ${STATUS_LABEL[c.status] || c.status.replace(/_/g, ' ')}`,
    tags: [
      { label: typeLabel,                                                     color: C.gray600, bg: C.gray100 },
      { label: STATUS_LABEL[c.status] || c.status.replace(/_/g, ' '),        color: C.blue600, bg: C.blue50  },
    ],
    avatar:       c.client?.app_user?.avatar_url || null,
    client:       clientName,
    clientSince:  filingLabel,
    contacts: [
      ...(c.client?.email ? [{ lib: 'FA5', name: 'envelope', bg: C.purple50, color: C.purple600, action: `mailto:${c.client.email}` }] : []),
      ...(c.client?.phone ? [{ lib: 'FA5', name: 'phone',    bg: C.blue50,   color: C.primary,   action: `tel:${c.client.phone}`   }] : [{ lib: 'FA5', name: 'phone', bg: C.blue50, color: C.primary, action: null }]),
    ],
    stats: [
      { label: 'Statut',   val: STATUS_LABEL[c.status] || c.status.replace(/_/g, ' '), valColor: C.dark },
      { label: 'Priority', val: pm.urgency,                  valColor: pm.urgencyColor    },
      { label: 'Type',     val: typeLabel.split(' ')[0],     valColor: C.dark             },
      { label: 'Filed',    val: filingLabel,                  valColor: C.dark            },
    ],
    nextLabel:      hearingLabel ? `Hearing: ${hearingLabel}` : 'No hearing scheduled',
    calColor:       hearingLabel ? C.primary  : C.gray400,
    timeLeft:       hearingLabel ? 'Upcoming' : '—',
    timeLeftColor:  hearingLabel ? C.primary  : C.gray400,
    timeLeftBg:     hearingLabel ? C.blue50   : C.gray50,
    // ── CaseDetailsScreen fields ──
    type:           typeLabel,
    phase:          STATUS_LABEL[c.status] || c.status.replace(/_/g, ' '),
    priority:       (c.priority || 'NORMAL').toLowerCase(),
    status:         c.status,
    filingDate:     c.filing_date || '',
    court:          c.court_name       || '—',
    judge:          c.judge_name       || '—',
    prosecutor:     c.opposing_counsel || '—',
    attorney:       '—',
    caseValue:      c.estimated_value  ? `$${Number(c.estimated_value).toLocaleString()}` : '—',
    description:    c.description || '',
    nextHearing:    hearingLabel
      ? { label: hearingLabel, time: '—', room: '—', countdown: '—' }
      : null,
    clientData: {
      name:    clientName,
      id:      c.client?.id    || '—',
      avatar:  c.client?.app_user?.avatar_url || null,
      since:   filingLabel,
      phone:   c.client?.phone || '—',
      email:   c.client?.email || '—',
      address: c.client?.address || '—',
      status:  'Active',
      tier:    'Standard',
    },
  };
};

// ─── ALL ACTIVITY SCREEN ─────────────────────────────────────────────────────
function AllActivityScreen({ onBack }) {
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    dashboardAPI.recentActivity(7)
      .then(data => setActivity(Array.isArray(data) ? data : []))
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, []);
  const groupByDay = (items) => {
    const groups = [];
    const seen = {};
    items.forEach(a => {
      const d = a.created_at ? new Date(a.created_at) : null;
      let label = 'Unknown';
      if (d) {
        const now = new Date(); now.setHours(0,0,0,0);
        const day = new Date(d); day.setHours(0,0,0,0);
        const diff = Math.round((now - day) / 86400000);
        if (diff === 0)      label = 'Today';
        else if (diff === 1) label = 'Yesterday';
        else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      }
      if (!seen[label]) { seen[label] = true; groups.push({ label, items: [] }); }
      groups[groups.length - 1].items.push(a);
    });
    return groups;
  };

  const groups = groupByDay(activity);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={aa.header}>
        <TouchableOpacity style={aa.backBtn} onPress={onBack}>
          <FontAwesome5 name="arrow-left" size={15} color={C.dark} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={aa.title}>All Activity</Text>
          <Text style={aa.sub}>{loading ? 'Loading…' : `${activity.length} event${activity.length !== 1 ? 's' : ''} · Last 7 days`}</Text>
        </View>
        <View style={aa.liveWrap}>
          <View style={aa.liveDot} />
          <Text style={aa.liveText}>LIVE</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 12 }}>Loading activity…</Text>
          </View>
        ) : activity.length === 0 ? (
          <View style={aa.empty}>
            <View style={aa.emptyIcon}>
              <FontAwesome5 name="history" size={28} color="#D1D5DB" />
            </View>
            <Text style={aa.emptyTitle}>No activity yet</Text>
            <Text style={aa.emptySub}>Actions on cases will appear here</Text>
          </View>
        ) : groups.map(group => (
          <View key={group.label}>
            {/* Day separator */}
            <View style={aa.dayRow}>
              <View style={aa.dayLine} />
              <View style={aa.dayPill}>
                <Text style={aa.dayTxt}>{group.label}</Text>
              </View>
              <View style={aa.dayLine} />
            </View>

            {/* Cards */}
            <View style={aa.groupCard}>
              {group.items.map((a, i) => {
                const meta    = getActivityMeta(a.action);
                const relTime = getRelativeTime(a.created_at);
                const cf      = a.case_file;
                const isLast  = i === group.items.length - 1;
                return (
                  <View key={a.id ?? i} style={[aa.row, !isLast && aa.rowDivider]}>
                    <View style={[aa.iconWrap, { backgroundColor: meta.bg }]}>
                      <Icon lib="FA5" name={meta.icon} size={16} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <Text style={aa.action} numberOfLines={2}>{formatAction(a.action)}</Text>
                        <View style={[aa.timePill, { backgroundColor: meta.bg }]}>
                          <FontAwesome5 name="clock" size={8} color={meta.color} />
                          <Text style={[aa.timeText, { color: meta.color }]}>{relTime}</Text>
                        </View>
                      </View>
                      {cf && (
                        <View style={aa.casePill}>
                          <FontAwesome5 name="folder-open" size={9} color={C.primary} />
                          <Text style={aa.casePillText} numberOfLines={1}>{cf.title}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const aa = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 17, fontWeight: '800', color: C.dark },
  sub:        { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  liveWrap:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  liveText:   { fontSize: 9, fontWeight: '800', color: '#16A34A', letterSpacing: 0.5 },
  // day separator
  dayRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 18, marginBottom: 10 },
  dayLine:    { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dayPill:    { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F3F4F6', marginHorizontal: 10 },
  dayTxt:     { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  // group card
  groupCard:  { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  row:        { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconWrap:   { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  action:     { fontSize: 13, fontWeight: '700', color: C.dark, lineHeight: 19, flex: 1 },
  timePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  timeText:   { fontSize: 10, fontWeight: '800' },
  casePill:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', maxWidth: '95%' },
  casePillText:{ fontSize: 11, fontWeight: '600', color: C.primary },
  // empty
  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
  emptySub:   { fontSize: 13, color: '#9CA3AF', marginTop: 6 },
});

// ─── ÉCRAN ─────────────────────────────────────────────────────────────────
export default function CaseManagement({ navigation }) {
  const [selectedCase,     setSelectedCase]     = useState(null);
  const [aiCase,           setAiCase]           = useState(null);
  const [voiceNoteCase,    setVoiceNoteCase]    = useState(null);
  const [invoiceParams,    setInvoiceParams]    = useState(null);
  const [showAddCase,      setShowAddCase]      = useState(false);
  const [showAllActivity,  setShowAllActivity]  = useState(false);
  const [cases,            setCases]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activity,         setActivity]         = useState([]);
  const [deadlines,        setDeadlines]        = useState([]);
  const [searchText,       setSearchText]       = useState('');
  const [activeFilter,     setActiveFilter]     = useState('all');
  const [typeFilter,       setTypeFilter]       = useState(null);
  const [sortOrder,        setSortOrder]        = useState('newest');
  const [showFilterPanel,  setShowFilterPanel]  = useState(false);
  const [showSortPanel,    setShowSortPanel]    = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await casesAPI.list();
      setCases(Array.isArray(data) ? data : []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const data = await dashboardAPI.recentActivity();
      setActivity(Array.isArray(data) ? data : []);
    } catch {
      setActivity([]);
    }
  }, []);

  const loadDeadlines = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await calendarAPI.listEvents({ from_date: today });
      // Keep only the next 5 upcoming events
      setDeadlines(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch {
      setDeadlines([]);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCases(), loadActivity(), loadDeadlines()]);
    setRefreshing(false);
  }, [loadCases, loadActivity, loadDeadlines]);

  const handleArchive = useCallback(async (cardItem) => {
    Alert.alert(
      'Archive Case',
      `Are you sure you want to archive "${cardItem.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', style: 'destructive',
          onPress: async () => {
            try {
              await casesAPI.archive(cardItem._raw.id);
              loadCases();
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not archive case.');
            }
          },
        },
      ]
    );
  }, [loadCases]);

  const handleUnarchive = useCallback(async (cardItem) => {
    Alert.alert(
      'Restore Case',
      `Restore "${cardItem.title}" to active?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              await casesAPI.restore(cardItem._raw.id);
              loadCases();
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not restore case.');
            }
          },
        },
      ]
    );
  }, [loadCases]);

  useEffect(() => {
    loadCases();
    loadActivity();
    loadDeadlines();
  }, [loadCases, loadActivity, loadDeadlines]);

  // ── Count per type (for filter panel badges) ─────────────────────────
  const typeCountMap2 = {};
  cases.forEach(c => {
    const key = (c.case_type || '').toUpperCase();
    if (key) typeCountMap2[key] = (typeCountMap2[key] || 0) + 1;
  });
  // All known types; put types with cases first, then the rest alphabetically
  const allTypeKeys = Object.keys(TYPE_LABEL).sort((a, b) => {
    const ca = typeCountMap2[a] || 0;
    const cb = typeCountMap2[b] || 0;
    if (cb !== ca) return cb - ca;
    return TYPE_LABEL[a].localeCompare(TYPE_LABEL[b]);
  });

  // ── Filtered + searched + sorted cases ───────────────────────────────
  const filterFn = FILTER_CONFIG.find(f => f.key === activeFilter)?.filter ?? (() => true);
  const displayCases = cases
    .filter(filterFn)
    .filter(c => !typeFilter || (c.case_type || '').toUpperCase() === typeFilter)
    .filter(c => {
      if (!searchText.trim()) return true;
      const q = searchText.toLowerCase();
      const clientName = c.client
        ? `${c.client.first_name} ${c.client.last_name}`.toLowerCase()
        : '';
      return (
        c.title?.toLowerCase().includes(q) ||
        c.case_number?.toLowerCase().includes(q) ||
        clientName.includes(q)
      );
    })
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.filing_date || 0) - new Date(b.filing_date || 0);
      if (sortOrder === 'az')     return (a.title || '').localeCompare(b.title || '');
      if (sortOrder === 'za')     return (b.title || '').localeCompare(a.title || '');
      return new Date(b.filing_date || 0) - new Date(a.filing_date || 0); // newest
    })
    .map(toCardFormat);

  // ── Tab counts ────────────────────────────────────────────────────────
  const tabCounts = {
    all:    cases.length,
    urgent: cases.filter(FILTER_CONFIG[1].filter).length,
    active: cases.filter(FILTER_CONFIG[2].filter).length,
    closed: cases.filter(FILTER_CONFIG[3].filter).length,
  };

  // ── Dynamic statistics ────────────────────────────────────────────────
  const TYPE_COLORS = [C.red500, C.secondary, C.green600, C.purple600, C.amber600];
  const typeCountMap = {};
  cases.forEach(c => {
    const label = TYPE_LABEL[(c.case_type || '').toUpperCase()] || c.case_type || 'Other';
    typeCountMap[label] = (typeCountMap[label] || 0) + 1;
  });
  const total = cases.length || 1;
  const dynamicCaseTypes = Object.entries(typeCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count], i) => ({
      color: TYPE_COLORS[i % TYPE_COLORS.length],
      label,
      count: `${count} case${count !== 1 ? 's' : ''}`,
      pct:   `${Math.round(count / total * 100)}%`,
    }));
  const urgentCount = tabCounts.urgent;
  const closedCount = tabCounts.closed;
  const activeCount = tabCounts.active;
  const totalCount  = cases.length;

  // InvoiceScreen depuis CaseDetails
  if (invoiceParams !== null) {
    return (
      <InvoiceScreen
        navigation={{ goBack: () => setInvoiceParams(null) }}
        route={{ params: invoiceParams }}
      />
    );
  }

  // VoiceNoteScreen depuis CaseDetails (case verrouillé)
  if (voiceNoteCase) {
    return (
      <VoiceNoteScreen
        navigation={{ goBack: () => setVoiceNoteCase(null) }}
        route={{ params: { lockedCase: voiceNoteCase } }}
      />
    );
  }

  // Afficher AddCaseScreen en plein écran (inline)
  if (showAddCase) {
    return (
      <AddCaseScreen
        navigation={{
          goBack: () => { setShowAddCase(false); loadCases(); },
        }}
      />
    );
  }

  if (showAllActivity) {
    return <AllActivityScreen onBack={() => setShowAllActivity(false)} />;
  }

  // Si un case est sélectionné, on affiche CaseDetailsScreen
  if (selectedCase) {
    return (
      <CaseDetailsScreen
        navigation={{
          goBack: () => { setSelectedCase(null); loadCases(); },
          navigate: (screen, params) => {
            if (screen === 'VoiceNote') setVoiceNoteCase(params?.lockedCase);
            if (screen === 'Invoice')   setInvoiceParams(params ?? {});
          },
        }}
        route={{ params: { caseData: selectedCase } }}
      />
    );
  }

  const handleViewDetails = (cardItem) => {
    setSelectedCase(rawToDetails(cardItem._raw));
  };

  const handleAIPress = (cardItem) => {
    const raw = cardItem._raw;
    setAiCase({
      id:     raw.id,
      title:  raw.title,
      number: raw.case_number,
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── AI Assistant modal (standalone, no CaseDetails) ── */}
      <Modal
        visible={!!aiCase}
        animationType="slide"
        onRequestClose={() => setAiCase(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
          <View style={aiM.header}>
            <TouchableOpacity onPress={() => setAiCase(null)} style={aiM.closeBtn}>
              <FontAwesome5 name="chevron-down" size={16} color="#6B7280" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={aiM.title}>AI Assistant</Text>
              {aiCase?.title ? (
                <Text style={aiM.sub} numberOfLines={1}>{aiCase.title}</Text>
              ) : null}
            </View>
            <View style={{ width: 36 }} />
          </View>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {aiCase && (
              <CaseAIAssistantTab
                caseId={aiCase.id}
                caseTitle={aiCase.title}
                caseNumber={aiCase.number}
              />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* HEADER */}
      <View style={s.header}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
          <View style={s.row}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack?.()}>
              <Icon lib="FA5" name="arrow-left" size={18} color={C.white} />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={s.headerTitle}>Case Management</Text>
              <Text style={s.headerSub}>{cases.length} Case{cases.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.backBtn, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
            onPress={() => setShowAddCase(true)}
          >
            <Icon lib="FA5" name="plus" size={18} color={C.white} />
          </TouchableOpacity>
        </View>
        <View style={s.searchWrap}>
          <Icon lib="ION" name="search-outline" size={18} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by case number, client name..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Icon lib="ION" name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} tintColor={C.primary} />
        }
      >

        {/* FILTER TABS */}
        <View style={s.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTER_CONFIG.map(t => {
              const isActive = activeFilter === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.filterTab, { backgroundColor: isActive ? C.primary : C.gray100, marginRight: 8 }]}
                  onPress={() => setActiveFilter(t.key)}
                >
                  <Icon lib="FA5" name={t.icon} size={12} color={isActive ? C.white : C.gray500} />
                  <Text style={[s.filterTabText, { color: isActive ? C.white : C.gray700, marginLeft: 6 }]}>
                    {t.label} ({tabCounts[t.key]})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* SORT/FILTER BAR */}
        <View style={[s.section, { backgroundColor: C.blue50, paddingBottom: showFilterPanel || showSortPanel ? 8 : 16 }]}>
          <View style={s.row}>
            <TouchableOpacity
              style={[s.sortBtn, { flex: 1, marginRight: 8, borderColor: showFilterPanel || typeFilter ? C.primary : C.gray200 }]}
              onPress={() => { setShowFilterPanel(v => !v); setShowSortPanel(false); }}
            >
              <View style={s.row}>
                <Icon lib="FA5" name="filter" size={14} color={typeFilter ? C.primary : C.dark} />
                <Text style={[s.sortBtnText, { marginLeft: 8, color: typeFilter ? C.primary : C.dark }]}>
                  {typeFilter ? (TYPE_LABEL[typeFilter] || typeFilter) : 'Filter'}
                </Text>
              </View>
              <Icon lib="FA5" name={showFilterPanel ? 'chevron-up' : 'chevron-down'} size={10} color={C.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sortBtn, { flex: 1, marginRight: 8, borderColor: showSortPanel || sortOrder !== 'newest' ? C.primary : C.gray200 }]}
              onPress={() => { setShowSortPanel(v => !v); setShowFilterPanel(false); }}
            >
              <View style={s.row}>
                <Icon lib="FA5" name="sort" size={14} color={sortOrder !== 'newest' ? C.primary : C.dark} />
                <Text style={[s.sortBtnText, { marginLeft: 8, color: sortOrder !== 'newest' ? C.primary : C.dark }]}>
                  {{ newest: 'Newest', oldest: 'Oldest', az: 'A → Z', za: 'Z → A' }[sortOrder]}
                </Text>
              </View>
              <Icon lib="FA5" name={showSortPanel ? 'chevron-up' : 'chevron-down'} size={10} color={C.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sliderBtn, { backgroundColor: (typeFilter || sortOrder !== 'newest') ? C.primary : C.gray400 }]}
              onPress={() => { setTypeFilter(null); setSortOrder('newest'); setShowFilterPanel(false); setShowSortPanel(false); }}
            >
              <Icon lib="FA5" name="times" size={16} color={C.white} />
            </TouchableOpacity>
          </View>

          {/* Filter panel — case types */}
          {showFilterPanel && (
            <View style={s.filterPanel}>
              <Text style={[s.xs, { color: C.gray500, marginBottom: 10 }]}>Filter by case type:</Text>
              <View style={s.typeChipWrap}>
                <TouchableOpacity
                  style={[s.typeChip, !typeFilter && s.typeChipActive]}
                  onPress={() => { setTypeFilter(null); setShowFilterPanel(false); }}
                >
                  <Text style={[s.typeChipText, !typeFilter && { color: C.white }]}>
                    All Types
                  </Text>
                  <View style={[s.typeChipBadge, !typeFilter && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={[s.typeChipBadgeText, !typeFilter && { color: C.white }]}>{cases.length}</Text>
                  </View>
                </TouchableOpacity>
                {allTypeKeys.map(key => {
                  const count = typeCountMap2[key] || 0;
                  const isActive = typeFilter === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.typeChip, isActive && s.typeChipActive, count === 0 && s.typeChipDim]}
                      onPress={() => { setTypeFilter(key); setShowFilterPanel(false); }}
                    >
                      <Text style={[s.typeChipText, isActive && { color: C.white }, count === 0 && { color: C.gray400 }]}>
                        {TYPE_LABEL[key]}
                      </Text>
                      <View style={[s.typeChipBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }, count === 0 && { backgroundColor: C.gray100 }]}>
                        <Text style={[s.typeChipBadgeText, isActive && { color: C.white }, count === 0 && { color: C.gray400 }]}>{count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Sort panel */}
          {showSortPanel && (
            <View style={s.filterPanel}>
              <Text style={[s.xs, { color: C.gray500, marginBottom: 8 }]}>Sort cases by:</Text>
              {[
                { key: 'newest', label: 'Newest First',  icon: 'sort-amount-down' },
                { key: 'oldest', label: 'Oldest First',  icon: 'sort-amount-up'   },
                { key: 'az',     label: 'Title A → Z',   icon: 'sort-alpha-down'  },
                { key: 'za',     label: 'Title Z → A',   icon: 'sort-alpha-up-alt'},
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.sortOption, sortOrder === opt.key && s.sortOptionActive]}
                  onPress={() => { setSortOrder(opt.key); setShowSortPanel(false); }}
                >
                  <View style={s.row}>
                    <Icon lib="FA5" name={opt.icon} size={13} color={sortOrder === opt.key ? C.primary : C.gray500} />
                    <Text style={[s.sortBtnText, { marginLeft: 10, color: sortOrder === opt.key ? C.primary : C.dark }]}>
                      {opt.label}
                    </Text>
                  </View>
                  {sortOrder === opt.key && <Icon lib="FA5" name="check" size={12} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ACTIVE FILTERS chips */}
        {(typeFilter || sortOrder !== 'newest') && (
          <View style={[s.section, { backgroundColor: C.blue50, paddingTop: 0, paddingBottom: 12 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[s.xs, { color: C.gray500, marginRight: 8, lineHeight: 28 }]}>Active:</Text>
              {typeFilter && (
                <View style={[s.activeFilter, { marginRight: 8 }]}>
                  <Text style={s.activeFilterText}>{TYPE_LABEL[typeFilter] || typeFilter}</Text>
                  <TouchableOpacity style={{ marginLeft: 6 }} onPress={() => setTypeFilter(null)}>
                    <Icon lib="FA5" name="times" size={10} color={C.primary} />
                  </TouchableOpacity>
                </View>
              )}
              {sortOrder !== 'newest' && (
                <View style={[s.activeFilter, { marginRight: 8 }]}>
                  <Text style={s.activeFilterText}>
                    {{ oldest: 'Oldest First', az: 'A → Z', za: 'Z → A' }[sortOrder]}
                  </Text>
                  <TouchableOpacity style={{ marginLeft: 6 }} onPress={() => setSortOrder('newest')}>
                    <Icon lib="FA5" name="times" size={10} color={C.primary} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={() => { setTypeFilter(null); setSortOrder('newest'); }}>
                <Text style={[s.xs, { color: C.primary, textDecorationLine: 'underline', lineHeight: 28 }]}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* CASES LIST */}
        <View style={s.section}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
            <Text style={s.sectionTitle}>
              {displayCases.length} Case{displayCases.length !== 1 ? 's' : ''}
              {searchText ? ` for "${searchText}"` : ''}
            </Text>
            <TouchableOpacity onPress={loadCases}>
              <Icon lib="FA5" name="sync-alt" size={14} color={C.primary} />
            </TouchableOpacity>
          </View>

          {loading && (
            <ActivityIndicator color={C.primary} size="large" style={{ marginVertical: 24 }} />
          )}
          {!loading && displayCases.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Icon lib="FA5" name="folder-open" size={36} color={C.gray400} />
              <Text style={[s.sm, { color: C.gray400, marginTop: 12 }]}>
                {searchText ? 'No cases match your search.' : 'No cases found.'}
              </Text>
              {!searchText && (
                <TouchableOpacity
                  style={[s.btnPrimary, { marginTop: 16, paddingHorizontal: 24 }]}
                  onPress={() => navigation?.navigate?.('AddCase', { onCreated: loadCases })}
                >
                  <Icon lib="FA5" name="plus" size={13} color={C.white} />
                  <Text style={[s.btnPrimaryText, { marginLeft: 6 }]}>Create First Case</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!loading && displayCases.map((c, i) => (
            <CaseCard key={c._raw?.id ?? i} item={c} onViewDetails={handleViewDetails} onArchive={handleArchive} onUnarchive={handleUnarchive} onAIPress={handleAIPress} />
          ))}
        </View>

        {/* STATISTICS */}
        <View style={[s.section, { backgroundColor: '#FAF5FF' }]}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>Case Statistics</Text>
          <View style={[s.card, { marginBottom: 16 }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
              <Text style={s.cardTitle}>Cases by Type</Text>
            </View>
            {dynamicCaseTypes.length === 0 ? (
              <Text style={[s.xs, { color: C.gray400, textAlign: 'center', paddingVertical: 12 }]}>No cases yet</Text>
            ) : dynamicCaseTypes.map((t, i) => (
              <View key={i} style={{ marginBottom: 12 }}>
                <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                  <View style={s.row}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.color, marginRight: 8 }} />
                    <Text style={s.sm}>{t.label}</Text>
                  </View>
                  <Text style={s.smBold}>{t.count}</Text>
                </View>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: t.pct, backgroundColor: t.color }]} />
                </View>
              </View>
            ))}
          </View>
          {/* Row 1 */}
          <View style={s.statsRow}>
            <View style={[s.statMiniCard, { flex: 1, marginRight: 8 }]}>
              <View style={[s.statMiniIcon, { backgroundColor: C.primary }]}>
                <Icon lib="FA5" name="briefcase" size={20} color={C.white} />
              </View>
              <Text style={s.statMiniCount}>{totalCount}</Text>
              <Text style={s.statMiniLabel}>Total Cases</Text>
              <Text style={s.statMiniSub}>All dossiers</Text>
            </View>
            <View style={[s.statMiniCard, { flex: 1 }]}>
              <View style={[s.statMiniIcon, { backgroundColor: C.blue600 }]}>
                <Icon lib="FA5" name="folder-open" size={20} color={C.white} />
              </View>
              <Text style={s.statMiniCount}>{activeCount}</Text>
              <Text style={s.statMiniLabel}>Active</Text>
              <Text style={[s.statMiniSub, { color: C.blue600 }]}>Not archived</Text>
            </View>
          </View>
          {/* Row 2 */}
          <View style={[s.statsRow, { marginTop: 8 }]}>
            <View style={[s.statMiniCard, { flex: 1, marginRight: 8 }]}>
              <View style={[s.statMiniIcon, { backgroundColor: C.green600 }]}>
                <Icon lib="FA5" name="check-circle" size={20} color={C.white} />
              </View>
              <Text style={s.statMiniCount}>{closedCount}</Text>
              <Text style={s.statMiniLabel}>Closed</Text>
              <Text style={s.statMiniSub}>Settled or closed</Text>
            </View>
            <View style={[s.statMiniCard, { flex: 1 }]}>
              <View style={[s.statMiniIcon, { backgroundColor: C.red600 }]}>
                <Icon lib="FA5" name="fire" size={20} color={C.white} />
              </View>
              <Text style={s.statMiniCount}>{urgentCount}</Text>
              <Text style={s.statMiniLabel}>Urgent</Text>
              <Text style={[s.statMiniSub, { color: C.red600 }]}>High priority</Text>
            </View>
          </View>
        </View>

        {/* RECENT ACTIVITY */}
        <View style={act.section}>
          {/* Header */}
          <View style={act.header}>
            <View style={act.headerLeft}>
              <View style={act.sectionIconWrap}>
                <Icon lib="FA5" name="history" size={15} color={C.primary} />
              </View>
              <View>
                <Text style={act.headerTitle}>Recent Activity</Text>
                <Text style={act.headerSub}>
                  {activity.length > 0 ? `${activity.length} recent event${activity.length !== 1 ? 's' : ''}` : 'Up to date'}
                </Text>
              </View>
            </View>
            <View style={act.headerRight}>
              <View style={act.liveWrap}>
                <View style={act.liveDot} />
                <Text style={act.liveText}>LIVE</Text>
              </View>
              <TouchableOpacity style={act.viewAllBtn} onPress={() => setShowAllActivity(true)}>
                <Text style={act.viewAllText}>View All</Text>
                <Icon lib="FA5" name="chevron-right" size={10} color={C.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Feed */}
          <View style={act.feed}>
            {activity.length === 0 ? (
              <View style={act.emptyWrap}>
                <View style={act.emptyIcon}>
                  <Icon lib="FA5" name="inbox" size={26} color={C.gray400} />
                </View>
                <Text style={act.emptyTitle}>No recent activity</Text>
                <Text style={act.emptySub}>Actions on cases will appear here</Text>
              </View>
            ) : activity.map((a, i) => {
              const meta    = getActivityMeta(a.action);
              const relTime = getRelativeTime(a.created_at);
              const cf      = a.case_file;
              const isLast  = i === activity.length - 1;
              return (
                <View key={a.id ?? i} style={[act.card, !isLast && act.cardDivider]}>
                  {/* Colored icon square */}
                  <View style={[act.iconWrap, { backgroundColor: meta.bg }]}>
                    <Icon lib="FA5" name={meta.icon} size={16} color={meta.color} />
                  </View>

                  {/* Body */}
                  <View style={act.body}>
                    {/* Row 1 — action + time pill */}
                    <View style={act.bodyTop}>
                      <Text style={act.action} numberOfLines={2}>{formatAction(a.action)}</Text>
                      <View style={[act.timePill, { backgroundColor: meta.bg }]}>
                        <Icon lib="FA5" name="clock" size={8} color={meta.color} />
                        <Text style={[act.timeText, { color: meta.color }]}>{relTime}</Text>
                      </View>
                    </View>

                    {/* Row 2 — linked case pill */}
                    {cf && (
                      <View style={act.casePill}>
                        <Icon lib="FA5" name="folder-open" size={9} color={C.primary} />
                        <Text style={act.casePillText} numberOfLines={1}>{cf.title}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* AI INSIGHTS */}
        <View style={[s.section, { backgroundColor: C.indigo50 }]}>
          <View style={s.aiCard}>
            <View style={[s.row, { marginBottom: 16 }]}>
              <View style={s.aiIconWrap}>
                <Icon lib="FA5" name="brain" size={24} color={C.white} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.aiTitle}>AI Case Insights</Text>
                <Text style={s.aiSub}>Smart recommendations</Text>
              </View>
            </View>
            {AI_INSIGHTS.map((a, i) => (
              <View key={i} style={s.aiItem}>
                <View style={[s.aiItemIcon, { backgroundColor: a.iconBg }]}>
                  <Icon lib="FA5" name={a.icon} size={14} color={C.white} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.aiItemTitle}>{a.title}</Text>
                  <Text style={s.aiItemDesc}>{a.desc}</Text>
                  <TouchableOpacity style={s.aiItemBtn}>
                    <Text style={s.aiItemBtnText}>{a.btn}</Text>
                    <Icon lib="FA5" name="arrow-right" size={10} color={C.white} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.aiMainBtn}>
              <Icon lib="FA5" name="robot" size={16} color={C.indigo600} />
              <Text style={s.aiMainBtnText}>Get More AI Insights</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* UPCOMING EVENTS */}
        <View style={[s.section, { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: C.white }]}>
          {/* Header */}
          <View style={ev.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={ev.headerIcon}>
                <Icon lib="FA5" name="calendar-alt" size={16} color={C.white} />
              </View>
              <View>
                <Text style={ev.headerTitle}>Upcoming Events</Text>
                <Text style={ev.headerSub}>
                  {deadlines.length > 0 ? `${deadlines.length} scheduled` : 'No events'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={ev.calBtn} onPress={() => navigation?.navigate?.('Calendar')}>
              <Icon lib="FA5" name="calendar" size={11} color={C.primary} />
              <Text style={ev.calBtnText}>Calendar</Text>
            </TouchableOpacity>
          </View>

          {/* Cards */}
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
            {deadlines.length === 0 ? (
              <View style={ev.emptyWrap}>
                <View style={ev.emptyIcon}>
                  <Icon lib="FA5" name="calendar-check" size={24} color={C.gray400} />
                </View>
                <Text style={ev.emptyTitle}>Calendar is clear</Text>
                <Text style={ev.emptySub}>No upcoming events scheduled</Text>
              </View>
            ) : deadlines.map((d, i) => {
              const EV_META = {
                HEARING:      { color: C.red600,    bg: C.red50,    icon: 'gavel'          },
                COURT_DATE:   { color: C.purple600, bg: C.purple50, icon: 'landmark'       },
                MEETING:      { color: C.amber600,  bg: C.amber50,  icon: 'handshake'      },
                CONSULTATION: { color: C.green600,  bg: C.green50,  icon: 'comments'       },
                DEADLINE:     { color: C.blue600,   bg: C.blue50,   icon: 'clock'          },
                FILING:       { color: C.amber600,  bg: C.amber50,  icon: 'file-signature' },
                DEPOSITION:   { color: C.red600,    bg: C.red50,    icon: 'microphone'     },
                MEDIATION:    { color: C.green600,  bg: C.green50,  icon: 'balance-scale'  },
                ARBITRATION:  { color: C.purple600, bg: C.purple50, icon: 'balance-scale'  },
              };
              const evMeta   = EV_META[(d.event_type || '').toUpperCase()] || { color: C.primary, bg: C.blue50, icon: 'calendar-check' };
              const accent   = evMeta.color;
              const accentBg = evMeta.bg;
              const iconName = evMeta.icon;
              const typeLabel  = formatEventType(d.event_type);
              const dt         = d.start_datetime ? new Date(d.start_datetime) : null;
              const dayNum     = dt ? dt.getDate() : '—';
              const monthStr   = dt ? dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
              const timeStr    = dt ? dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
              const countdown  = getCountdown(d.start_datetime);

              return (
                <View key={d.id ?? i} style={[ev.card, { borderLeftColor: accent }]}>
                  {/* Date column */}
                  <View style={[ev.dateBadge, { backgroundColor: accent }]}>
                    <Text style={ev.dateDay}>{dayNum}</Text>
                    <Text style={ev.dateMonth}>{monthStr}</Text>
                  </View>

                  {/* Main content */}
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    {/* Row 1: type badge + countdown */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={[ev.typeBadge, { backgroundColor: accentBg }]}>
                        <Icon lib="FA5" name={iconName} size={9} color={accent} />
                        <Text style={[ev.typeText, { color: accent }]}>{typeLabel}</Text>
                      </View>
                      {countdown && (
                        <View style={[ev.countdownBadge, { backgroundColor: accentBg }]}>
                          <Icon lib="FA5" name="clock" size={9} color={countdown.color} />
                          <Text style={[ev.countdownText, { color: countdown.color }]}>{countdown.label}</Text>
                        </View>
                      )}
                    </View>
                    {/* Row 2: title */}
                    <Text style={ev.evTitle} numberOfLines={1}>{d.title}</Text>
                    {/* Row 3: time + location */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
                      {timeStr ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon lib="FA5" name="clock" size={10} color={C.gray400} />
                          <Text style={ev.evMeta}>{timeStr}</Text>
                        </View>
                      ) : null}
                      {d.location ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <Icon lib="FA5" name="map-marker-alt" size={10} color={C.gray400} />
                          <Text style={ev.evMeta} numberOfLines={1}>{d.location}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>


                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── AI modal header styles ───────────────────────────────────────────────
const aiM = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  sub:      { fontSize: 12, color: '#6B7280', marginTop: 1 },
});

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  notifBadge: { position: 'absolute', top: -3, right: -3, backgroundColor: C.red500, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { color: C.white, fontSize: 10, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },
  section: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white, marginBottom: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.dark },
  sectionAction: { fontSize: 13, fontWeight: '600', color: C.primary },
  filterTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  filterTabText: { fontSize: 13, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: C.dark },
  sliderBtn: { width: 48, height: 48, backgroundColor: C.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activeFilter: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  activeFilterText: { fontSize: 12, fontWeight: '600', color: C.primary },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.gray100, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: C.gray600 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },
  caseIdBadge: { backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  caseIdText: { fontSize: 11, fontWeight: '700', color: C.primary },
  avatarMd: { width: 40, height: 40, borderRadius: 20 },
  clientName: { fontSize: 13, fontWeight: '700', color: C.dark },
  clientSince: { fontSize: 11, color: C.gray500 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, color: C.gray500, marginBottom: 2, textAlign: 'center' },
  statVal: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  xs: { fontSize: 12, color: C.gray600 },
  sm: { fontSize: 13, color: C.dark },
  smBold: { fontSize: 13, fontWeight: '700', color: C.dark },
  gray400xs: { fontSize: 12, color: C.gray400 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 10, borderRadius: 12 },
  btnPrimaryText: { color: C.white, fontWeight: '700', fontSize: 14 },
  viewToggle: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  progressBg: { height: 8, backgroundColor: C.gray100, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  statsRow:  { flexDirection: 'row' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statMiniCard: { flex: 1, backgroundColor: C.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.gray100 },
  statMiniIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statMiniCount: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 2 },
  statMiniLabel: { fontSize: 12, color: C.gray600, fontWeight: '500' },
  statMiniSub: { fontSize: 11, fontWeight: '700', color: C.green600, marginTop: 2 },
  qfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  qfCard: { width: '47%', backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.gray200 },
  qfIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qfCount: { fontSize: 20, fontWeight: '800', color: C.dark, marginTop: 6 },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiCard: { backgroundColor: C.indigo600, borderRadius: 24, padding: 20 },
  aiIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 16, fontWeight: '700', color: C.white },
  aiSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  aiItem: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  aiItemIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiItemTitle: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 3 },
  aiItemDesc: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 8 },
  aiItemBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 4 },
  aiItemBtnText: { fontSize: 12, fontWeight: '600', color: C.white },
  aiMainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.white, paddingVertical: 12, borderRadius: 14, gap: 8, marginTop: 4 },
  aiMainBtnText: { fontSize: 14, fontWeight: '700', color: C.indigo600 },
  deadlineCard: { borderRadius: 16, padding: 14, borderLeftWidth: 4, marginBottom: 10, backgroundColor: C.gray50 },
  deadlineBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  deadlineBtnText: { color: C.white, fontSize: 12, fontWeight: '700' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: C.gray400, marginRight: 10 },
  bulkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bulkBtn: { width: '47%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  // ── Filter / Sort panels ─────────────────────────────────────────────
  filterPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.gray200 },
  typeChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  typeChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  typeChipDim: { borderColor: C.gray200, backgroundColor: C.gray50 },
  typeChipText: { fontSize: 13, fontWeight: '600', color: C.dark },
  typeChipBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  typeChipBadgeText: { fontSize: 11, fontWeight: '700', color: C.primary },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  sortOptionActive: { backgroundColor: C.blue50 },
});

// ─── RECENT ACTIVITY styles ───────────────────────────────────────────────
const act = StyleSheet.create({
  // — Section wrapper
  section:        { backgroundColor: C.white, marginBottom: 0 },

  // — Header
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIconWrap:{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 16, fontWeight: '800', color: C.dark },
  headerSub:      { fontSize: 11, color: C.gray400, marginTop: 1 },
  liveWrap:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green600 },
  liveText:       { fontSize: 9, fontWeight: '800', color: C.green600, letterSpacing: 0.5 },
  viewAllBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.blue50, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  viewAllText:    { fontSize: 12, fontWeight: '700', color: C.primary },

  // — Feed list
  feed:           { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },

  // — Each activity card row
  card:           { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 4, gap: 14 },
  cardDivider:    { borderBottomWidth: 1, borderBottomColor: C.gray100 },

  // — Left icon
  iconWrap:       { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // — Body
  body:           { flex: 1 },
  bodyTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  action:         { fontSize: 13, fontWeight: '700', color: C.dark, lineHeight: 19, flex: 1 },

  // — Time pill (inherits color from activity)
  timePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  timeText:       { fontSize: 10, fontWeight: '800' },

  // — Linked case pill
  casePill:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, backgroundColor: C.blue50, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', maxWidth: '95%' },
  casePillText:   { fontSize: 11, fontWeight: '600', color: C.primary },

  // — Empty state
  emptyWrap:      { alignItems: 'center', paddingVertical: 32 },
  emptyIcon:      { width: 58, height: 58, borderRadius: 18, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:     { fontSize: 14, fontWeight: '700', color: C.gray500 },
  emptySub:       { fontSize: 12, color: C.gray400, marginTop: 4 },
});

// ─── UPCOMING EVENTS styles ───────────────────────────────────────────────
const ev = StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  headerIcon:    { width: 38, height: 38, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 17, fontWeight: '800', color: C.dark },
  headerSub:     { fontSize: 12, color: C.gray500, marginTop: 1 },
  calBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.blue50, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.blue100 },
  calBtnText:    { fontSize: 12, fontWeight: '700', color: C.primary },
  card:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 18, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: C.gray100, borderLeftWidth: 4 },
  dateBadge:     { width: 50, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dateDay:       { fontSize: 22, fontWeight: '900', color: C.white, lineHeight: 24 },
  dateMonth:     { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8 },
  typeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  typeText:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  countdownBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  countdownText: { fontSize: 10, fontWeight: '800' },
  evTitle:       { fontSize: 14, fontWeight: '800', color: C.dark },
  evMeta:        { fontSize: 11, color: C.gray500, fontWeight: '500' },
  arrowBtn:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8, flexShrink: 0 },
  emptyWrap:     { alignItems: 'center', paddingVertical: 28 },
  emptyIcon:     { width: 58, height: 58, borderRadius: 18, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 14, fontWeight: '700', color: C.gray500 },
  emptySub:      { fontSize: 12, color: C.gray400, marginTop: 4 },
});
