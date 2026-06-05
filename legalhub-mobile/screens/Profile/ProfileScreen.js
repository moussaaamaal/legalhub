import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Image, StyleSheet, SafeAreaView, StatusBar,
  Switch, TextInput, Alert, Share,
  Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../supabase/supabase';
import { useAuth } from '../../context/AuthContext';
import { useAppPrefs } from '../../context/AppPrefsContext';
import { authAPI, firmAPI, dashboardAPI, clientsAPI, calendarAPI } from '../../services/api';

WebBrowser.maybeCompleteAuthSession();

const bioEnabledKey     = (uid) => `lh_biometric_enabled_${uid}`;
const bioTokenKey       = (uid) => `lh_bio_token_${uid}`;
const BIO_ACTIVE_USER_KEY = 'lh_bio_active_user';

// ─── COULEURS ──────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF', gray50: '#F9FAFB', gray100: '#F3F4F6',
  gray200: '#E5E7EB', gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563', gray700: '#374151',
  red50: '#FEF2F2', red100: '#FEE2E2', red200: '#FECACA', red500: '#EF4444', red600: '#DC2626',
  amber50: '#FFFBEB', amber100: '#FEF3C7', amber600: '#D97706',
  green50: '#F0FDF4', green100: '#DCFCE7', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE', blue600: '#2563EB',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo100: '#E0E7FF', indigo600: '#4F46E5',
  pink50: '#FDF2F8', pink100: '#FCE7F3', pink600: '#DB2777',
  teal50: '#F0FDFA', teal100: '#CCFBF1', teal600: '#0D9488',
};

const Icon = ({ lib = 'FA5', name, size = 16, color = C.dark }) => {
  if (lib === 'FA5') return <FontAwesome5 name={name} size={size} color={color} />;
  if (lib === 'FA')  return <FontAwesome  name={name} size={size} color={color} />;
  if (lib === 'ION') return <Ionicons     name={name} size={size} color={color} />;
  return null;
};

// ─── DONNÉES ──────────────────────────────────────────────────────────────

const SECURITY_ITEMS = [
  { iconLib: 'FA5', iconName: 'lock',        iconColor: C.red600,   iconBg: C.red100,   title: 'Change Password',          sub: 'Update your account password',       type: 'chevron' },
  { iconLib: 'FA5', iconName: 'shield-alt',  iconColor: C.green600, iconBg: C.green100, title: 'Two-Factor Authentication', sub: 'Authenticator app (TOTP)',           type: 'toggle-2fa' },
  { iconLib: 'FA5', iconName: 'fingerprint', iconColor: C.primary,  iconBg: C.blue100,  title: 'Biometric Login',          sub: 'Use fingerprint or Face ID',         type: 'toggle-bio' },
  { iconLib: 'FA5', iconName: 'history',     iconColor: C.amber600, iconBg: C.amber100, title: 'Login History',            sub: 'View recent login activity',         type: 'chevron' },
];

// Valeurs par défaut utilisées si la table n'existe pas encore
const NOTIF_DEFAULTS = {
  hearing_reminders:     true,
  hearing_reminder_offset: '1 hour before',
  task_reminders:        true,
  document_updates:      true,
  client_messages:       true,
  payment_notifications: true,
  email_notifications:   false,
  whatsapp_updates:      true,
};

// pref key par item de notification
const NOTIF_PREF_KEY = {
  'Hearing Reminders':    'hearing_reminders',
  'Task Reminders':       'task_reminders',
  'Document Updates':     'document_updates',
  'Client Messages':      'client_messages',
  'Payment Notifications':'payment_notifications',
  'Email Notifications':  'email_notifications',
  'WhatsApp Updates':     'whatsapp_updates',
};

const NOTIF_ITEMS = [
  { iconLib: 'FA5', iconName: 'gavel',       iconColor: C.amber600,  iconBg: C.amber100,  title: 'Hearing Reminders',   sub: 'Get notified before hearings',  toggleOn: true,  toggleColor: C.primary, radioGroup: 'hearing', radioOptions: ['1 hour before', '2 hours before', '1 day before'] },
  { iconLib: 'FA5', iconName: 'tasks',       iconColor: C.primary,   iconBg: C.blue100,   title: 'Task Reminders',      sub: 'Deadline notifications',        toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'file-alt',    iconColor: C.green600,  iconBg: C.green100,  title: 'Document Updates',    sub: 'New document notifications',    toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'comment',     iconColor: C.purple600, iconBg: C.purple100, title: 'Client Messages',     sub: 'New message alerts',            toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'dollar-sign', iconColor: C.indigo600, iconBg: C.indigo100, title: 'Payment Notifications',sub: 'Invoice and payment updates',  toggleOn: true,  toggleColor: C.primary },
  { iconLib: 'FA5', iconName: 'envelope',    iconColor: C.pink600,   iconBg: C.pink100,   title: 'Email Notifications', sub: 'Receive email summaries',       toggleOn: false, toggleColor: C.primary },
  { iconLib: 'FA',  iconName: 'whatsapp',    iconColor: C.teal600,   iconBg: C.teal100,   title: 'WhatsApp Updates',    sub: 'Get updates via WhatsApp',      toggleOn: true,  toggleColor: C.primary },
];

const SOCIAL_LINKS = [
  { lib: 'FA', name: 'twitter',   bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'linkedin',  bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'facebook',  bg: C.blue100,  color: C.blue600  },
  { lib: 'FA', name: 'instagram', bg: C.pink100,  color: C.pink600  },
];

// ─── PHONE COUNTRIES ──────────────────────────────────────────────────────
const PHONE_COUNTRIES = [
  // Africa
  { code:'DZ', flag:'🇩🇿', name:'Algeria',              dial:'+213' },
  { code:'AO', flag:'🇦🇴', name:'Angola',               dial:'+244' },
  { code:'BJ', flag:'🇧🇯', name:'Benin',                dial:'+229' },
  { code:'BW', flag:'🇧🇼', name:'Botswana',             dial:'+267' },
  { code:'BF', flag:'🇧🇫', name:'Burkina Faso',         dial:'+226' },
  { code:'BI', flag:'🇧🇮', name:'Burundi',              dial:'+257' },
  { code:'CV', flag:'🇨🇻', name:'Cape Verde',           dial:'+238' },
  { code:'CM', flag:'🇨🇲', name:'Cameroon',             dial:'+237' },
  { code:'CF', flag:'🇨🇫', name:'Central African Rep.', dial:'+236' },
  { code:'TD', flag:'🇹🇩', name:'Chad',                 dial:'+235' },
  { code:'KM', flag:'🇰🇲', name:'Comoros',              dial:'+269' },
  { code:'CG', flag:'🇨🇬', name:'Congo',                dial:'+242' },
  { code:'CD', flag:'🇨🇩', name:'Congo (DRC)',          dial:'+243' },
  { code:'CI', flag:'🇨🇮', name:"Côte d'Ivoire",        dial:'+225' },
  { code:'DJ', flag:'🇩🇯', name:'Djibouti',             dial:'+253' },
  { code:'EG', flag:'🇪🇬', name:'Egypt',                dial:'+20'  },
  { code:'GQ', flag:'🇬🇶', name:'Equatorial Guinea',    dial:'+240' },
  { code:'ER', flag:'🇪🇷', name:'Eritrea',              dial:'+291' },
  { code:'ET', flag:'🇪🇹', name:'Ethiopia',             dial:'+251' },
  { code:'GA', flag:'🇬🇦', name:'Gabon',                dial:'+241' },
  { code:'GM', flag:'🇬🇲', name:'Gambia',               dial:'+220' },
  { code:'GH', flag:'🇬🇭', name:'Ghana',                dial:'+233' },
  { code:'GN', flag:'🇬🇳', name:'Guinea',               dial:'+224' },
  { code:'GW', flag:'🇬🇼', name:'Guinea-Bissau',        dial:'+245' },
  { code:'KE', flag:'🇰🇪', name:'Kenya',                dial:'+254' },
  { code:'LS', flag:'🇱🇸', name:'Lesotho',              dial:'+266' },
  { code:'LR', flag:'🇱🇷', name:'Liberia',              dial:'+231' },
  { code:'LY', flag:'🇱🇾', name:'Libya',                dial:'+218' },
  { code:'MG', flag:'🇲🇬', name:'Madagascar',           dial:'+261' },
  { code:'MW', flag:'🇲🇼', name:'Malawi',               dial:'+265' },
  { code:'ML', flag:'🇲🇱', name:'Mali',                 dial:'+223' },
  { code:'MR', flag:'🇲🇷', name:'Mauritania',           dial:'+222' },
  { code:'MU', flag:'🇲🇺', name:'Mauritius',            dial:'+230' },
  { code:'MA', flag:'🇲🇦', name:'Morocco',              dial:'+212' },
  { code:'MZ', flag:'🇲🇿', name:'Mozambique',           dial:'+258' },
  { code:'NA', flag:'🇳🇦', name:'Namibia',              dial:'+264' },
  { code:'NE', flag:'🇳🇪', name:'Niger',                dial:'+227' },
  { code:'NG', flag:'🇳🇬', name:'Nigeria',              dial:'+234' },
  { code:'RW', flag:'🇷🇼', name:'Rwanda',               dial:'+250' },
  { code:'ST', flag:'🇸🇹', name:'São Tomé & Príncipe',  dial:'+239' },
  { code:'SN', flag:'🇸🇳', name:'Senegal',              dial:'+221' },
  { code:'SC', flag:'🇸🇨', name:'Seychelles',           dial:'+248' },
  { code:'SL', flag:'🇸🇱', name:'Sierra Leone',         dial:'+232' },
  { code:'SO', flag:'🇸🇴', name:'Somalia',              dial:'+252' },
  { code:'ZA', flag:'🇿🇦', name:'South Africa',         dial:'+27'  },
  { code:'SS', flag:'🇸🇸', name:'South Sudan',          dial:'+211' },
  { code:'SD', flag:'🇸🇩', name:'Sudan',                dial:'+249' },
  { code:'SZ', flag:'🇸🇿', name:'Eswatini',             dial:'+268' },
  { code:'TZ', flag:'🇹🇿', name:'Tanzania',             dial:'+255' },
  { code:'TG', flag:'🇹🇬', name:'Togo',                 dial:'+228' },
  { code:'TN', flag:'🇹🇳', name:'Tunisia',              dial:'+216' },
  { code:'UG', flag:'🇺🇬', name:'Uganda',               dial:'+256' },
  { code:'ZM', flag:'🇿🇲', name:'Zambia',               dial:'+260' },
  { code:'ZW', flag:'🇿🇼', name:'Zimbabwe',             dial:'+263' },
  // Middle East
  { code:'BH', flag:'🇧🇭', name:'Bahrain',              dial:'+973' },
  { code:'IQ', flag:'🇮🇶', name:'Iraq',                 dial:'+964' },
  { code:'IR', flag:'🇮🇷', name:'Iran',                 dial:'+98'  },
  { code:'IL', flag:'🇮🇱', name:'Israel',               dial:'+972' },
  { code:'JO', flag:'🇯🇴', name:'Jordan',               dial:'+962' },
  { code:'KW', flag:'🇰🇼', name:'Kuwait',               dial:'+965' },
  { code:'LB', flag:'🇱🇧', name:'Lebanon',              dial:'+961' },
  { code:'OM', flag:'🇴🇲', name:'Oman',                 dial:'+968' },
  { code:'PS', flag:'🇵🇸', name:'Palestine',            dial:'+970' },
  { code:'QA', flag:'🇶🇦', name:'Qatar',                dial:'+974' },
  { code:'SA', flag:'🇸🇦', name:'Saudi Arabia',         dial:'+966' },
  { code:'SY', flag:'🇸🇾', name:'Syria',                dial:'+963' },
  { code:'AE', flag:'🇦🇪', name:'UAE',                  dial:'+971' },
  { code:'YE', flag:'🇾🇪', name:'Yemen',                dial:'+967' },
  // Europe
  { code:'AL', flag:'🇦🇱', name:'Albania',              dial:'+355' },
  { code:'AD', flag:'🇦🇩', name:'Andorra',              dial:'+376' },
  { code:'AT', flag:'🇦🇹', name:'Austria',              dial:'+43'  },
  { code:'BY', flag:'🇧🇾', name:'Belarus',              dial:'+375' },
  { code:'BE', flag:'🇧🇪', name:'Belgium',              dial:'+32'  },
  { code:'BA', flag:'🇧🇦', name:'Bosnia & Herzegovina', dial:'+387' },
  { code:'BG', flag:'🇧🇬', name:'Bulgaria',             dial:'+359' },
  { code:'HR', flag:'🇭🇷', name:'Croatia',              dial:'+385' },
  { code:'CY', flag:'🇨🇾', name:'Cyprus',               dial:'+357' },
  { code:'CZ', flag:'🇨🇿', name:'Czech Republic',       dial:'+420' },
  { code:'DK', flag:'🇩🇰', name:'Denmark',              dial:'+45'  },
  { code:'EE', flag:'🇪🇪', name:'Estonia',              dial:'+372' },
  { code:'FI', flag:'🇫🇮', name:'Finland',              dial:'+358' },
  { code:'FR', flag:'🇫🇷', name:'France',               dial:'+33'  },
  { code:'DE', flag:'🇩🇪', name:'Germany',              dial:'+49'  },
  { code:'GR', flag:'🇬🇷', name:'Greece',               dial:'+30'  },
  { code:'HU', flag:'🇭🇺', name:'Hungary',              dial:'+36'  },
  { code:'IS', flag:'🇮🇸', name:'Iceland',              dial:'+354' },
  { code:'IE', flag:'🇮🇪', name:'Ireland',              dial:'+353' },
  { code:'IT', flag:'🇮🇹', name:'Italy',                dial:'+39'  },
  { code:'LV', flag:'🇱🇻', name:'Latvia',               dial:'+371' },
  { code:'LI', flag:'🇱🇮', name:'Liechtenstein',        dial:'+423' },
  { code:'LT', flag:'🇱🇹', name:'Lithuania',            dial:'+370' },
  { code:'LU', flag:'🇱🇺', name:'Luxembourg',           dial:'+352' },
  { code:'MT', flag:'🇲🇹', name:'Malta',                dial:'+356' },
  { code:'MD', flag:'🇲🇩', name:'Moldova',              dial:'+373' },
  { code:'MC', flag:'🇲🇨', name:'Monaco',               dial:'+377' },
  { code:'ME', flag:'🇲🇪', name:'Montenegro',           dial:'+382' },
  { code:'NL', flag:'🇳🇱', name:'Netherlands',          dial:'+31'  },
  { code:'MK', flag:'🇲🇰', name:'North Macedonia',      dial:'+389' },
  { code:'NO', flag:'🇳🇴', name:'Norway',               dial:'+47'  },
  { code:'PL', flag:'🇵🇱', name:'Poland',               dial:'+48'  },
  { code:'PT', flag:'🇵🇹', name:'Portugal',             dial:'+351' },
  { code:'RO', flag:'🇷🇴', name:'Romania',              dial:'+40'  },
  { code:'RU', flag:'🇷🇺', name:'Russia',               dial:'+7'   },
  { code:'SM', flag:'🇸🇲', name:'San Marino',           dial:'+378' },
  { code:'RS', flag:'🇷🇸', name:'Serbia',               dial:'+381' },
  { code:'SK', flag:'🇸🇰', name:'Slovakia',             dial:'+421' },
  { code:'SI', flag:'🇸🇮', name:'Slovenia',             dial:'+386' },
  { code:'ES', flag:'🇪🇸', name:'Spain',                dial:'+34'  },
  { code:'SE', flag:'🇸🇪', name:'Sweden',               dial:'+46'  },
  { code:'CH', flag:'🇨🇭', name:'Switzerland',          dial:'+41'  },
  { code:'TR', flag:'🇹🇷', name:'Turkey',               dial:'+90'  },
  { code:'UA', flag:'🇺🇦', name:'Ukraine',              dial:'+380' },
  { code:'GB', flag:'🇬🇧', name:'United Kingdom',       dial:'+44'  },
  { code:'VA', flag:'🇻🇦', name:'Vatican City',         dial:'+379' },
  // Asia
  { code:'AF', flag:'🇦🇫', name:'Afghanistan',          dial:'+93'  },
  { code:'AM', flag:'🇦🇲', name:'Armenia',              dial:'+374' },
  { code:'AZ', flag:'🇦🇿', name:'Azerbaijan',           dial:'+994' },
  { code:'BD', flag:'🇧🇩', name:'Bangladesh',           dial:'+880' },
  { code:'BT', flag:'🇧🇹', name:'Bhutan',               dial:'+975' },
  { code:'BN', flag:'🇧🇳', name:'Brunei',               dial:'+673' },
  { code:'KH', flag:'🇰🇭', name:'Cambodia',             dial:'+855' },
  { code:'CN', flag:'🇨🇳', name:'China',                dial:'+86'  },
  { code:'GE', flag:'🇬🇪', name:'Georgia',              dial:'+995' },
  { code:'IN', flag:'🇮🇳', name:'India',                dial:'+91'  },
  { code:'ID', flag:'🇮🇩', name:'Indonesia',            dial:'+62'  },
  { code:'JP', flag:'🇯🇵', name:'Japan',                dial:'+81'  },
  { code:'KZ', flag:'🇰🇿', name:'Kazakhstan',           dial:'+7'   },
  { code:'KG', flag:'🇰🇬', name:'Kyrgyzstan',           dial:'+996' },
  { code:'LA', flag:'🇱🇦', name:'Laos',                 dial:'+856' },
  { code:'MY', flag:'🇲🇾', name:'Malaysia',             dial:'+60'  },
  { code:'MV', flag:'🇲🇻', name:'Maldives',             dial:'+960' },
  { code:'MN', flag:'🇲🇳', name:'Mongolia',             dial:'+976' },
  { code:'MM', flag:'🇲🇲', name:'Myanmar',              dial:'+95'  },
  { code:'NP', flag:'🇳🇵', name:'Nepal',                dial:'+977' },
  { code:'KP', flag:'🇰🇵', name:'North Korea',          dial:'+850' },
  { code:'PK', flag:'🇵🇰', name:'Pakistan',             dial:'+92'  },
  { code:'PH', flag:'🇵🇭', name:'Philippines',          dial:'+63'  },
  { code:'SG', flag:'🇸🇬', name:'Singapore',            dial:'+65'  },
  { code:'KR', flag:'🇰🇷', name:'South Korea',          dial:'+82'  },
  { code:'LK', flag:'🇱🇰', name:'Sri Lanka',            dial:'+94'  },
  { code:'TW', flag:'🇹🇼', name:'Taiwan',               dial:'+886' },
  { code:'TJ', flag:'🇹🇯', name:'Tajikistan',           dial:'+992' },
  { code:'TH', flag:'🇹🇭', name:'Thailand',             dial:'+66'  },
  { code:'TL', flag:'🇹🇱', name:'Timor-Leste',          dial:'+670' },
  { code:'TM', flag:'🇹🇲', name:'Turkmenistan',         dial:'+993' },
  { code:'UZ', flag:'🇺🇿', name:'Uzbekistan',           dial:'+998' },
  { code:'VN', flag:'🇻🇳', name:'Vietnam',              dial:'+84'  },
  // Americas
  { code:'AG', flag:'🇦🇬', name:'Antigua & Barbuda',    dial:'+1'   },
  { code:'AR', flag:'🇦🇷', name:'Argentina',            dial:'+54'  },
  { code:'BS', flag:'🇧🇸', name:'Bahamas',              dial:'+1'   },
  { code:'BB', flag:'🇧🇧', name:'Barbados',             dial:'+1'   },
  { code:'BZ', flag:'🇧🇿', name:'Belize',               dial:'+501' },
  { code:'BO', flag:'🇧🇴', name:'Bolivia',              dial:'+591' },
  { code:'BR', flag:'🇧🇷', name:'Brazil',               dial:'+55'  },
  { code:'CA', flag:'🇨🇦', name:'Canada',               dial:'+1'   },
  { code:'CL', flag:'🇨🇱', name:'Chile',                dial:'+56'  },
  { code:'CO', flag:'🇨🇴', name:'Colombia',             dial:'+57'  },
  { code:'CR', flag:'🇨🇷', name:'Costa Rica',           dial:'+506' },
  { code:'CU', flag:'🇨🇺', name:'Cuba',                 dial:'+53'  },
  { code:'DM', flag:'🇩🇲', name:'Dominica',             dial:'+1'   },
  { code:'DO', flag:'🇩🇴', name:'Dominican Republic',   dial:'+1'   },
  { code:'EC', flag:'🇪🇨', name:'Ecuador',              dial:'+593' },
  { code:'SV', flag:'🇸🇻', name:'El Salvador',          dial:'+503' },
  { code:'GD', flag:'🇬🇩', name:'Grenada',              dial:'+1'   },
  { code:'GT', flag:'🇬🇹', name:'Guatemala',            dial:'+502' },
  { code:'GY', flag:'🇬🇾', name:'Guyana',               dial:'+592' },
  { code:'HT', flag:'🇭🇹', name:'Haiti',                dial:'+509' },
  { code:'HN', flag:'🇭🇳', name:'Honduras',             dial:'+504' },
  { code:'JM', flag:'🇯🇲', name:'Jamaica',              dial:'+1'   },
  { code:'MX', flag:'🇲🇽', name:'Mexico',               dial:'+52'  },
  { code:'NI', flag:'🇳🇮', name:'Nicaragua',            dial:'+505' },
  { code:'PA', flag:'🇵🇦', name:'Panama',               dial:'+507' },
  { code:'PY', flag:'🇵🇾', name:'Paraguay',             dial:'+595' },
  { code:'PE', flag:'🇵🇪', name:'Peru',                 dial:'+51'  },
  { code:'KN', flag:'🇰🇳', name:'Saint Kitts & Nevis',  dial:'+1'   },
  { code:'LC', flag:'🇱🇨', name:'Saint Lucia',          dial:'+1'   },
  { code:'VC', flag:'🇻🇨', name:'St. Vincent',          dial:'+1'   },
  { code:'SR', flag:'🇸🇷', name:'Suriname',             dial:'+597' },
  { code:'TT', flag:'🇹🇹', name:'Trinidad & Tobago',    dial:'+1'   },
  { code:'US', flag:'🇺🇸', name:'United States',        dial:'+1'   },
  { code:'UY', flag:'🇺🇾', name:'Uruguay',              dial:'+598' },
  { code:'VE', flag:'🇻🇪', name:'Venezuela',            dial:'+58'  },
  // Oceania
  { code:'AU', flag:'🇦🇺', name:'Australia',            dial:'+61'  },
  { code:'FJ', flag:'🇫🇯', name:'Fiji',                 dial:'+679' },
  { code:'KI', flag:'🇰🇮', name:'Kiribati',             dial:'+686' },
  { code:'MH', flag:'🇲🇭', name:'Marshall Islands',     dial:'+692' },
  { code:'FM', flag:'🇫🇲', name:'Micronesia',           dial:'+691' },
  { code:'NR', flag:'🇳🇷', name:'Nauru',                dial:'+674' },
  { code:'NZ', flag:'🇳🇿', name:'New Zealand',          dial:'+64'  },
  { code:'PW', flag:'🇵🇼', name:'Palau',                dial:'+680' },
  { code:'PG', flag:'🇵🇬', name:'Papua New Guinea',     dial:'+675' },
  { code:'WS', flag:'🇼🇸', name:'Samoa',                dial:'+685' },
  { code:'SB', flag:'🇸🇧', name:'Solomon Islands',      dial:'+677' },
  { code:'TO', flag:'🇹🇴', name:'Tonga',                dial:'+676' },
  { code:'TV', flag:'🇹🇻', name:'Tuvalu',               dial:'+688' },
  { code:'VU', flag:'🇻🇺', name:'Vanuatu',              dial:'+678' },
];

// ─── LAWYER TITLES ─────────────────────────────────────────────────────────
const LAWYER_TITLES = [
  'Managing Partner', 'Senior Partner', 'Partner',
  'Of Counsel', 'Senior Associate', 'Associate', 'Junior Associate', 'Trainee',
];

// ─── CountryPickerModal ────────────────────────────────────────────────────
const CountryPickerModal = ({ visible, selected, onSelect, onClose }) => {
  const [search, setSearch] = React.useState('');
  const filtered = PHONE_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200, alignSelf: 'center', marginTop: 10, marginBottom: 6 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.gray100, gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.dark }}>Select Country</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome5 name="times" size={13} color={C.gray500} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <TextInput
              value={search} onChangeText={setSearch}
              placeholder="Search country…" placeholderTextColor={C.gray400}
              style={{ backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: C.dark }}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {filtered.map(c => (
              <TouchableOpacity
                key={c.code}
                onPress={() => { onSelect(c); setSearch(''); onClose(); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.gray50, backgroundColor: selected?.code === c.code ? C.blue50 : C.white }}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{c.flag}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: C.dark, fontWeight: selected?.code === c.code ? '700' : '400' }}>{c.name}</Text>
                <Text style={{ fontSize: 14, color: C.gray500, fontWeight: '600' }}>{c.dial}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── TitlePickerModal ──────────────────────────────────────────────────────
const TitlePickerModal = ({ visible, selected, onSelect, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
      <View style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200, alignSelf: 'center', marginTop: 10, marginBottom: 6 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.gray100, gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.dark }}>Select Title</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesome5 name="times" size={13} color={C.gray500} />
          </TouchableOpacity>
        </View>
        {LAWYER_TITLES.map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => { onSelect(t); onClose(); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.gray50, backgroundColor: selected === t ? C.blue50 : C.white }}
          >
            <Text style={{ flex: 1, fontSize: 14, color: C.dark, fontWeight: selected === t ? '700' : '400' }}>{t}</Text>
            {selected === t && <FontAwesome5 name="check" size={13} color={C.primary} />}
          </TouchableOpacity>
        ))}
        <View style={{ height: 20 }} />
      </View>
    </View>
  </Modal>
);

// ─── COMPOSANTS RÉUTILISABLES ──────────────────────────────────────────────
const SectionHeader = ({ title, action, onAction, titleColor }) => (
  <View style={s.sectionHeader}>
    <Text style={[s.sectionTitle, titleColor && { color: titleColor }]}>{title}</Text>
    {action && <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{action}</Text></TouchableOpacity>}
  </View>
);


const RadioGroup = ({ options, value, onChange }) => (
  <View style={{ paddingLeft: 52, marginTop: 6 }}>
    {options.map((opt, i) => (
      <TouchableOpacity key={i} style={[s.row, { marginBottom: 8 }]} onPress={() => onChange(opt)}>
        <View style={[s.radioOuter, value === opt && { borderColor: C.primary }]}>
          {value === opt && <View style={s.radioInner} />}
        </View>
        <Text style={[s.sm, { marginLeft: 8 }]}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const ChevronRow = ({ item }) => (
  <View style={s.card}>
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <View style={s.row}>
        <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
          <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
        </View>
        <View style={{ marginLeft: 12 }}>
          <Text style={s.smBold}>{item.title}</Text>
          <Text style={s.xs}>{item.sub}</Text>
        </View>
      </View>
      <Icon lib="FA5" name="chevron-right" size={13} color={C.gray400} />
    </View>
  </View>
);

// ─── ÉCRAN ─────────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const { user, signOut, updateUser } = useAuth();
  const { theme: T, strings: L } = useAppPrefs();
  const [profile, setProfile]             = useState(null);
  const [stats, setStats]                 = useState({ active_cases: 0, total_clients: 0 });
  // Edit personal info
  const [editing, setEditing]             = useState(false);
  const [editName, setEditName]           = useState('');
  const [editPhone, setEditPhone]         = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  // Change password modal
  const [pwdModal, setPwdModal]           = useState(false);
  const [currentPwd, setCurrentPwd]       = useState('');
  const [newPwd, setNewPwd]               = useState('');
  const [confirmPwd, setConfirmPwd]       = useState('');
  const [savingPwd, setSavingPwd]         = useState(false);
  // 2FA modal
  const [twoFAModal, setTwoFAModal]           = useState(false);
  const [twoFAData, setTwoFAData]             = useState(null);   // { secret, qr_code_url }
  const [twoFACode, setTwoFACode]             = useState('');
  const [twoFALoading, setTwoFALoading]       = useState(false);
  // Disable 2FA modal
  const [disable2FAModal, setDisable2FAModal] = useState(false);
  const [disable2FACode, setDisable2FACode]   = useState('');
  // Biometric
  const [biometricEnabled, setBiometricEnabled]   = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  // Login history modal
  const [historyModal, setHistoryModal]   = useState(false);
  const [loginHistory, setLoginHistory]   = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Notification preferences
  const [notifPrefs, setNotifPrefs]       = useState(null);
  const [savingNotif, setSavingNotif]     = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const scrollRef   = useRef(null);
  const notifSectionY = useRef(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Calendar integrations
  const [googleConnecting,  setGoogleConnecting]  = useState(false);
  const [googleSyncing,     setGoogleSyncing]     = useState(false);
  const [googleSyncResult,  setGoogleSyncResult]  = useState(null);
  const [googleConnected,   setGoogleConnected]   = useState(false);
  // Firm profile + branding
  const [firmProfile, setFirmProfile]   = useState(null);
  const [firmBranding, setFirmBranding] = useState(null);
  // Lawyer professional info
  const [lawyerProfile,        setLawyerProfile]        = useState(null);
  const [editingPro,           setEditingPro]            = useState(false);
  const [editTitle,            setEditTitle]             = useState('');
  const [editBarLicenseNumber, setEditBarLicenseNumber]  = useState('');
  const [editBarLicenseState,  setEditBarLicenseState]   = useState('');
  const [editSpecializations,  setEditSpecializations]   = useState([]);
  const [editYearsExp,         setEditYearsExp]          = useState('');
  const [editOfficeLocation,   setEditOfficeLocation]    = useState('');
  const [savingPro,            setSavingPro]             = useState(false);
  // Phone country picker
  const [editPhoneCountry,     setEditPhoneCountry]      = useState(PHONE_COUNTRIES[0]);
  const [editPhoneLocal,       setEditPhoneLocal]        = useState('');
  const [countryPickerVisible, setCountryPickerVisible]  = useState(false);
  // Title picker
  const [titlePickerVisible,   setTitlePickerVisible]    = useState(false);


  const loadData = useCallback(async () => {
    try {
      const data = await authAPI.me();
      setProfile(data);
      updateUser(data);
      setEditName(data.full_name || '');
      const rawPhone = data.phone || '';
      const detected = PHONE_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
      if (detected) {
        setEditPhoneCountry(detected);
        setEditPhoneLocal(rawPhone.slice(detected.dial.length).trim());
      } else {
        setEditPhoneLocal(rawPhone);
      }
      setEditPhone(rawPhone);
      if (data.role === 'FIRM_ADMIN' || data.role === 'LAWYER') {
        firmAPI.getProfile().then(setFirmProfile).catch(() => {});
        firmAPI.getBranding().then(setFirmBranding).catch(() => {});
      }
      if (data.role === 'LAWYER') {
        authAPI.getLawyerProfile().then(lp => {
          setLawyerProfile(lp);
          setEditTitle(lp.title || '');
          setEditBarLicenseNumber((lp.bar_license_number || '').replace(/^BAR-/i, ''));
          setEditBarLicenseState(lp.bar_license_state || '');
          setEditSpecializations(lp.specializations || []);
          setEditYearsExp(lp.years_experience != null ? String(lp.years_experience) : '');
          setEditOfficeLocation(lp.office_location || '');
        }).catch(() => {});
      }
    } catch {}

    Promise.all([dashboardAPI.stats(), clientsAPI.list()])
      .then(([s, clients]) => setStats({
        active_cases:  s.active_cases || 0,
        total_clients: Array.isArray(clients) ? clients.length : 0,
      })).catch(() => {});

    authAPI.getNotifPreferences().then(setNotifPrefs).catch(() => setNotifPrefs(NOTIF_DEFAULTS));
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    loadData();

    LocalAuthentication.hasHardwareAsync().then(supported => {
      setBiometricSupported(supported);
      if (supported && user?.id) {
        AsyncStorage.getItem(bioEnabledKey(user.id)).then(val => setBiometricEnabled(val === 'true'));
      }
    });
  }, []);


  // ── 2FA ────────────────────────────────────────────────
  const handleToggle2FA = useCallback(async () => {
    if (twoFaEnabled) {
      setDisable2FACode('');
      setDisable2FAModal(true);
      return;
    }
    setTwoFALoading(true);
    try {
      const data = await authAPI.setup2FA();
      setTwoFAData(data);
      setTwoFAModal(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not start 2FA setup.');
    } finally {
      setTwoFALoading(false);
    }
  }, [twoFaEnabled]);

  const handleDisable2FA = useCallback(async () => {
    if (!disable2FACode.trim()) return;
    setTwoFALoading(true);
    try {
      await authAPI.disable2FA(disable2FACode.trim());
      setProfile(prev => ({ ...prev, two_fa_enabled: false }));
      setDisable2FAModal(false);
      setDisable2FACode('');
      Alert.alert('Success', '2FA has been disabled on your account.');
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'The code you entered is incorrect.');
    } finally {
      setTwoFALoading(false);
    }
  }, [disable2FACode]);

  const handleVerify2FA = useCallback(async () => {
    if (!twoFACode.trim()) return;
    setTwoFALoading(true);
    try {
      await authAPI.verify2FA(twoFACode);
      setProfile(prev => ({ ...prev, two_fa_enabled: true }));
      setTwoFAModal(false);
      setTwoFACode('');
      Alert.alert('Success', '2FA has been enabled on your account.');
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'The code you entered is incorrect.');
    } finally {
      setTwoFALoading(false);
    }
  }, [twoFACode]);

  // ── Biometric ──────────────────────────────────────────
  const handleToggleBiometric = useCallback(async (value) => {
    const userId = user?.id;
    if (!userId) return;

    if (value) {
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled  = await LocalAuthentication.isEnrolledAsync();
      if (!supported || !enrolled) {
        Alert.alert('Not available', 'No Face ID or fingerprint is enrolled on this device.');
        return;
      }
      Alert.alert(
        'Enable Biometric Login',
        'Use Face ID or fingerprint to sign in quickly next time?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable', onPress: async () => {
              try {
                const data = await authAPI.registerBiometric();
                await SecureStore.setItemAsync(bioTokenKey(userId), data.biometric_token);
                await AsyncStorage.setItem(bioEnabledKey(userId), 'true');
                await AsyncStorage.setItem(BIO_ACTIVE_USER_KEY, userId);
                setBiometricEnabled(true);
              } catch (err) {
                Alert.alert('Error', err.message || 'Could not enable biometric login.');
              }
            },
          },
        ]
      );
    } else {
      try { await authAPI.revokeBiometric(); } catch (_) {}
      await SecureStore.deleteItemAsync(bioTokenKey(userId));
      await AsyncStorage.setItem(bioEnabledKey(userId), 'false');
      const activeUser = await AsyncStorage.getItem(BIO_ACTIVE_USER_KEY);
      if (activeUser === userId) await AsyncStorage.removeItem(BIO_ACTIVE_USER_KEY);
      setBiometricEnabled(false);
    }
  }, [user]);

  // ── Login history ──────────────────────────────────────
  const handleOpenHistory = useCallback(async () => {
    setHistoryModal(true);
    setHistoryLoading(true);
    try {
      const data = await authAPI.loginHistory();
      setLoginHistory(data);
    } catch {
      setLoginHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Notification preferences ───────────────────────────
  const handleNotifToggle = useCallback(async (key, value) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    setSavingNotif(true);
    try {
      await authAPI.updateNotifPreferences({ [key]: value });
    } catch {
      setNotifPrefs(prev => ({ ...prev, [key]: !value })); // rollback
    } finally {
      setSavingNotif(false);
    }
  }, [notifPrefs]);

  const me       = profile || user || {};
  const fullName = me.full_name || 'Your Name';
  const email    = me.email     || '';
  const phone    = me.phone     || '';
  const avatarUrl = me.avatar_url || null;
  const firmName = me.firm_name || 'Your Firm';
  const role     = me.role      || 'LAWYER';
  const roleLabel = { FIRM_ADMIN: 'Firm Admin', LAWYER: 'Lawyer', CLIENT: 'Client' }[role] || role;
  const twoFaEnabled = me.two_fa_enabled || false;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const fullPhone = editPhoneLocal.trim() ? `${editPhoneCountry.dial} ${editPhoneLocal.trim()}` : '';
      const updated = await authAPI.updateMe({ full_name: editName, phone: fullPhone });
      setProfile(updated);
      updateUser(updated);
      if (role === 'LAWYER') {
        const lp = await authAPI.updateLawyerProfile({
          title:              editTitle.trim() || null,
          bar_license_number: editBarLicenseNumber.trim() ? 'BAR-' + editBarLicenseNumber.trim() : null,
          bar_license_state:  editBarLicenseState.trim() || null,
          specializations:    editSpecializations,
          years_experience:   editYearsExp ? parseInt(editYearsExp, 10) : null,
          office_location:    editOfficeLocation.trim() || null,
        });
        setLawyerProfile(lp);
      }
      setEditing(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    if (newPwd.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }
    setSavingPwd(true);
    try {
      await authAPI.changePassword({ current_password: currentPwd, new_password: newPwd });
      Alert.alert('Success', 'Password changed successfully.');
      setPwdModal(false);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to change password.');
    } finally {
      setSavingPwd(false);
    }
  };

  const handlePickAvatar = useCallback(async () => {
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
      updateUser({ ...me, avatar_url: data.avatar_url });
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not update profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [me, updateUser]);

  // ── Google Calendar — même pattern qu'AuthScreen (Supabase OAuth) ──────────
  const handleConnectGoogle = async () => {
    setGoogleConnecting(true);
    try {
      const redirectTo = Linking.createURL('oauth/google/callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes:              'https://www.googleapis.com/auth/calendar',
          redirectTo,
          skipBrowserRedirect: true,
          queryParams:         { access_type: 'offline', prompt: 'consent' },
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error('Missing OAuth URL');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return;

      // Supabase met les tokens dans le fragment (#) — même parsing qu'AuthScreen
      const raw = result.url.includes('#')
        ? result.url.split('#')[1]
        : result.url.split('?')[1] || '';
      const params = Object.fromEntries(
        raw.split('&').filter(Boolean).map(p => {
          const [k, ...v] = p.split('=');
          return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
        })
      );

      const providerToken = params.provider_token;
      if (!providerToken) throw new Error('Google Calendar token missing. Make sure the calendar scope is enabled in Supabase → Providers → Google.');

      await calendarAPI.saveGoogleToken({
        access_token:  providerToken,
        refresh_token: params.provider_refresh_token || null,
        expires_in:    parseInt(params.expires_in) || 3600,
      });

      setGoogleConnected(true);
      Alert.alert('Connected ✓', 'Google Calendar connected! Tap Sync Now to synchronize.');
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', err.message || 'Could not connect Google Calendar.');
      }
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleSyncGoogle = async () => {
    setGoogleSyncing(true);
    setGoogleSyncResult(null);
    try {
      const result = await calendarAPI.syncGoogle({});
      setGoogleSyncResult(result);
      Alert.alert(
        'Google Calendar Synced ✅',
        `${result.synced} event${result.synced !== 1 ? 's' : ''} sent to Google Calendar` +
        (result.failed > 0 ? `\n⚠️ ${result.failed} event(s) failed` : '')
      );
    } catch (err) {
      Alert.alert(
        'Sync Failed',
        err.message?.includes('not connected')
          ? 'Connect Google Calendar first by tapping "Connect".'
          : err.message || 'Sync failed. Try reconnecting.'
      );
    } finally {
      setGoogleSyncing(false);
    }
  };


  const handleSavePro = async () => {
    setSavingPro(true);
    try {
      const body = {
        bar_number:       editBarNumber.trim() || null,
        specializations:  editSpecializations,
        years_experience: editYearsExp ? parseInt(editYearsExp, 10) : null,
        bio:              editBio.trim() || null,
        hourly_rate:      editHourlyRate ? parseFloat(editHourlyRate) : null,
      };
      const updated = await authAPI.updateLawyerProfile(body);
      setLawyerProfile(updated);
      setEditingPro(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save professional info.');
    } finally {
      setSavingPro(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          try { await authAPI.logout(); } catch (_) {}
          await signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await authAPI.deleteAccount();
              await signOut();
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not delete account. Please try again.');
            }
          },
        },
      ]
    );
  };

  const personalFields = [
    { label: 'Full Name',    iconLib: 'FA5', iconName: 'user',     iconColor: C.primary,   iconBg: C.blue100,   value: editing ? editName : fullName, editable: editing, onEdit: setEditName, keyboardType: 'default'      },
    { label: 'Email Address',iconLib: 'FA5', iconName: 'envelope', iconColor: C.purple600, iconBg: C.purple100, value: email,                         editable: false,                         keyboardType: 'email-address'},
    { label: 'Phone Number', iconLib: 'FA5', iconName: 'phone',    iconColor: C.green600,  iconBg: C.green100,  value: editing ? (editPhoneLocal ? `${editPhoneCountry.dial} ${editPhoneLocal}` : '') : phone, editable: editing, pickerType: 'phone', keyboardType: 'phone-pad' },
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <TouchableOpacity style={s.headerBtn}onPress={() => navigation?.goBack?.()}>
            <Icon lib="FA5" name="arrow-left" size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profile Settings</Text>
          <View style={[s.headerBtn, { backgroundColor: 'transparent' }]} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} tintColor={C.primary} />}
      >

        {/* ── PROFILE HEADER ── */}
        <View style={[s.section, { backgroundColor: C.blue50 }]}>
          <View style={s.profileCard}>
            {/* Avatar */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ position: 'relative', marginBottom: 12 }}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={s.profileAvatar} />
                ) : (
                  <View style={[s.profileAvatar, { backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon lib="FA5" name="user" size={44} color={C.primary} />
                  </View>
                )}
                <TouchableOpacity style={s.cameraBtn} onPress={handlePickAvatar} disabled={uploadingAvatar}>
                  {uploadingAvatar
                    ? <ActivityIndicator size={14} color={C.white} />
                    : <Icon lib="FA5" name="camera" size={14} color={C.white} />}
                </TouchableOpacity>
              </View>
              <Text style={s.profileName}>{fullName}</Text>
              <Text style={s.profileRole}>{roleLabel}</Text>
              <View style={[s.row, { marginTop: 8, marginBottom: 6, gap: 8 }]}>
                <View style={[s.tag, { backgroundColor: C.green100 }]}>
                  <Text style={[s.tagText, { color: C.green600 }]}>Active</Text>
                </View>
              </View>
              <Text style={s.xs}>{firmName}</Text>
            </View>
            {/* Stats */}
            <View style={[s.row, { justifyContent: 'space-around', paddingTop: 16, borderTopWidth: 1, borderTopColor: C.gray100 }]}>
              {[
                { val: String(stats.active_cases),  label: 'Active Cases' },
                { val: String(stats.total_clients), label: 'Total Clients', bordered: true },
              ].map((st, i) => (
                <View key={i} style={[{ alignItems: 'center', flex: 1 }, st.bordered && { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.gray100 }]}>
                  <Text style={s.profileStatVal}>{st.val}</Text>
                  <Text style={s.profileStatLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── PERSONAL INFORMATION ── */}
        <View style={s.section}>
          <SectionHeader
            title="Personal Information"
            action={editing ? null : 'Edit'}
            onAction={() => setEditing(true)}
          />
          {personalFields.filter(f => f.value).map((f, i) => (
            <View key={i} style={s.card}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <View style={s.row}>
                <View style={[s.iconBtn40, { backgroundColor: f.iconBg }]}>
                  <Icon lib={f.iconLib} name={f.iconName} size={16} color={f.iconColor} />
                </View>
                {f.pickerType === 'phone' && f.editable ? (
                  <View style={[s.row, { flex: 1, borderBottomWidth: 1, borderBottomColor: C.primary }]}>
                    <TouchableOpacity
                      onPress={() => setCountryPickerVisible(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8, gap: 4 }}
                    >
                      <Text style={{ fontSize: 18 }}>{editPhoneCountry.flag}</Text>
                      <Text style={{ fontSize: 13, color: C.gray600, fontWeight: '600' }}>{editPhoneCountry.dial}</Text>
                      <FontAwesome5 name="chevron-down" size={9} color={C.gray400} />
                    </TouchableOpacity>
                    <TextInput
                      style={[s.fieldInput, { flex: 1, borderBottomWidth: 0, paddingLeft: 4 }]}
                      value={editPhoneLocal}
                      onChangeText={v => setEditPhoneLocal(v.replace(/[^0-9 ]/g, ''))}
                      keyboardType="phone-pad"
                      placeholder="XXXXXXXXX"
                      placeholderTextColor={C.gray400}
                    />
                  </View>
                ) : (
                  <TextInput
                    style={[s.fieldInput, f.editable && { borderBottomWidth: 1, borderBottomColor: C.primary }]}
                    value={f.value}
                    onChangeText={f.editable ? f.onEdit : undefined}
                    editable={f.editable}
                    keyboardType={f.keyboardType}
                  />
                )}
              </View>
            </View>
          ))}
          {/* ── Professional fields (LAWYER only) — same style as personalFields ── */}
          {role === 'LAWYER' && lawyerProfile && [
            { label: 'Title',               iconLib:'FA5', iconName:'user-tie',       iconColor:C.primary,   iconBg:C.blue100,   value: editing ? editTitle            : lawyerProfile.title,               editable: editing, onEdit: setEditTitle,            keyboardType:'default', placeholder:'Select a title…', pickerType: editing ? 'title' : null },
            { label: 'Bar License Number',  iconLib:'FA5', iconName:'id-badge',       iconColor:C.indigo600, iconBg:C.indigo100, value: editing ? editBarLicenseNumber : lawyerProfile.bar_license_number, editable: editing, onEdit: setEditBarLicenseNumber, keyboardType:'numeric', placeholder:'12345', prefix: 'BAR-' },
            { label: 'Bar License State',   iconLib:'FA5', iconName:'map-marker-alt', iconColor:C.red600,    iconBg:C.red100,    value: editing ? editBarLicenseState  : lawyerProfile.bar_license_state,  editable: editing, onEdit: setEditBarLicenseState,  keyboardType:'default', placeholder:'e.g. Algiers' },
            { label: 'Years of Experience', iconLib:'FA5', iconName:'star',           iconColor:C.amber600,  iconBg:C.amber100,  value: editing ? editYearsExp         : lawyerProfile.years_experience != null ? String(lawyerProfile.years_experience) : '', editable: editing, onEdit: setEditYearsExp, keyboardType:'numeric', placeholder:'e.g. 8' },
            { label: 'Office Location',     iconLib:'FA5', iconName:'building',       iconColor:C.teal600,   iconBg:C.teal100,   value: editing ? editOfficeLocation   : lawyerProfile.office_location,     editable: editing, onEdit: setEditOfficeLocation,   keyboardType:'default', placeholder:'e.g. 12 Rue Didouche Mourad' },
          ].filter(f => editing || f.value).map((f, i) => (
            <View key={i} style={s.card}>
              <Text style={s.fieldLabel}>{f.label}</Text>
              <View style={s.row}>
                <View style={[s.iconBtn40, { backgroundColor: f.iconBg }]}>
                  <Icon lib={f.iconLib} name={f.iconName} size={16} color={f.iconColor} />
                </View>
                {f.pickerType === 'title' ? (
                  <TouchableOpacity
                    onPress={() => setTitlePickerVisible(true)}
                    style={[s.row, { flex: 1, borderBottomWidth: 1, borderBottomColor: C.primary, paddingVertical: 6, justifyContent: 'space-between' }]}
                  >
                    <Text style={[s.fieldInput, { borderBottomWidth: 0, flex: 1, paddingLeft: 0, color: f.value ? C.dark : C.gray400 }]}>
                      {f.value || 'Select a title…'}
                    </Text>
                    <FontAwesome5 name="chevron-down" size={11} color={C.gray400} style={{ marginRight: 4 }} />
                  </TouchableOpacity>
                ) : f.prefix && f.editable ? (
                  <View style={[s.row, { flex: 1, borderBottomWidth: 1, borderBottomColor: C.primary }]}>
                    <Text style={[s.fieldInput, { borderBottomWidth: 0, color: C.gray500, paddingRight: 0 }]}>{f.prefix}</Text>
                    <TextInput
                      style={[s.fieldInput, { flex: 1, borderBottomWidth: 0, paddingLeft: 2 }]}
                      value={f.value || ''}
                      onChangeText={v => f.onEdit(v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                      placeholder={f.placeholder}
                      placeholderTextColor={C.gray400}
                    />
                  </View>
                ) : (
                  <TextInput
                    style={[s.fieldInput, f.editable && { borderBottomWidth: 1, borderBottomColor: C.primary }]}
                    value={f.value || ''}
                    onChangeText={f.editable ? f.onEdit : undefined}
                    editable={f.editable}
                    keyboardType={f.keyboardType}
                    placeholder={f.editable ? f.placeholder : ''}
                    placeholderTextColor={C.gray400}
                  />
                )}
              </View>
            </View>
          ))}

          {/* Specializations chip card (LAWYER only) */}
          {role === 'LAWYER' && lawyerProfile && (editing || lawyerProfile.specializations?.length > 0) && (
            <View style={s.card}>
              <Text style={s.fieldLabel}>Specializations</Text>
              <View style={[s.row, { flexWrap: 'wrap', gap: 8, marginTop: 10 }]}>
                {['Criminal','Civil','Corporate','Family','Real Estate','Immigration','Personal Injury','IP','Labor','Tax'].map(sp => {
                  const active = editing
                    ? editSpecializations.includes(sp)
                    : (lawyerProfile.specializations || []).includes(sp);
                  if (!editing && !active) return null;
                  return (
                    <TouchableOpacity
                      key={sp}
                      onPress={() => editing && setEditSpecializations(prev => active ? prev.filter(x => x !== sp) : [...prev, sp])}
                      activeOpacity={editing ? 0.7 : 1}
                      style={[s.tag, {
                        backgroundColor: active ? C.primary : C.gray100,
                        borderWidth: 1,
                        borderColor: active ? C.primary : C.gray200,
                      }]}
                    >
                      <Text style={[s.tagText, { color: active ? C.white : C.gray600 }]}>{sp}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {editing && (
            <View style={[s.row, { gap: 10, marginTop: 8 }]}>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1, backgroundColor: C.gray100, justifyContent: 'center' }]}
                onPress={() => { setEditing(false); setEditName(fullName); setEditPhone(phone); }}
              >
                <Text style={[s.smBold, { color: C.gray600 }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1, backgroundColor: C.primary, justifyContent: 'center' }]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <Text style={[s.smBold, { color: C.white }]}>{savingProfile ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── FIRM INFORMATION (FIRM_ADMIN & LAWYER) ── */}
        {(role === 'FIRM_ADMIN' || role === 'LAWYER') && firmProfile && (
          <View style={s.section}>
            <SectionHeader title="Firm Information" />
            <View style={s.card}>

              {/* Logo + nom */}
              <View style={[s.row, { marginBottom: 16 }]}>
                {firmBranding?.logo_url ? (
                  <Image
                    source={{ uri: firmBranding.logo_url }}
                    style={{ width: 60, height: 60, borderRadius: 12, borderWidth: 1, borderColor: C.gray200 }}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.blue100 }}>
                    <Icon lib="FA5" name="building" size={26} color={C.primary} />
                  </View>
                )}
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={s.smBold}>{firmBranding?.display_name || firmProfile.name}</Text>
                  {firmProfile.legal_entity_type ? <Text style={s.xs}>{firmProfile.legal_entity_type}</Text> : null}
                  {(firmProfile.city || firmProfile.country) ? (
                    <Text style={[s.xs, { marginTop: 2 }]}>{[firmProfile.city, firmProfile.country].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: C.gray100, marginBottom: 12 }} />

              {/* Champs */}
              {[
                { iconLib:'FA5', iconName:'envelope',       iconColor:C.purple600, iconBg:C.purple100, label:'Firm Email',          value: firmProfile.email               },
                { iconLib:'FA5', iconName:'phone',          iconColor:C.green600,  iconBg:C.green100,  label:'Firm Phone',          value: firmProfile.phone               },
                { iconLib:'FA5', iconName:'map-marker-alt', iconColor:C.red600,    iconBg:C.red100,    label:'Address',             value: firmProfile.address             },
                { iconLib:'FA5', iconName:'globe',          iconColor:C.amber600,  iconBg:C.amber100,  label:'Country',             value: firmProfile.country             },
                { iconLib:'FA5', iconName:'id-card',        iconColor:C.blue600,   iconBg:C.blue100,   label:'Registration No.',    value: firmProfile.registration_number },
                { iconLib:'FA5', iconName:'file-invoice',   iconColor:C.amber600,  iconBg:C.amber100,  label:'Tax ID',              value: firmProfile.tax_id              },
              ].filter(f => f.value).map((f, i, arr) => (
                <View key={i}>
                  <View style={[s.row, { paddingVertical: 8 }]}>
                    <View style={[s.iconBtn40, { backgroundColor: f.iconBg }]}>
                      <Icon lib={f.iconLib} name={f.iconName} size={15} color={f.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={s.fieldLabel}>{f.label}</Text>
                      <Text style={[s.smBold, { marginTop: 1 }]}>{f.value}</Text>
                    </View>
                  </View>
                  {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: C.gray100 }} />}
                </View>
              ))}

              {/* Domaines d'activité */}
              {firmProfile.practice_areas?.length > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: C.gray100, marginVertical: 4 }} />
                  <View style={{ paddingVertical: 8 }}>
                    <View style={[s.row, { marginBottom: 8 }]}>
                      <View style={[s.iconBtn40, { backgroundColor: C.blue100 }]}>
                        <Icon lib="FA5" name="gavel" size={15} color={C.primary} />
                      </View>
                      <Text style={[s.fieldLabel, { marginLeft: 12 }]}>Practice Areas</Text>
                    </View>
                    <View style={[s.row, { flexWrap: 'wrap', gap: 6, paddingLeft: 52 }]}>
                      {firmProfile.practice_areas.map((area, i) => (
                        <View key={i} style={[s.tag, { backgroundColor: C.blue100 }]}>
                          <Text style={[s.tagText, { color: C.primary }]}>{area}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* Description */}
              {firmProfile.description ? (
                <>
                  <View style={{ height: 1, backgroundColor: C.gray100, marginVertical: 4 }} />
                  <View style={{ paddingVertical: 8 }}>
                    <View style={[s.row, { marginBottom: 6 }]}>
                      <View style={[s.iconBtn40, { backgroundColor: C.gray100 }]}>
                        <Icon lib="FA5" name="align-left" size={15} color={C.gray500} />
                      </View>
                      <Text style={[s.fieldLabel, { marginLeft: 12 }]}>Description</Text>
                    </View>
                    <Text style={[s.xs, { paddingLeft: 52, lineHeight: 18, color: C.gray700 }]}>{firmProfile.description}</Text>
                  </View>
                </>
              ) : null}


            </View>
          </View>
        )}

        {/* ── CABINET MANAGEMENT (FIRM_ADMIN only) ── */}
        {role === 'FIRM_ADMIN' && (
          <View style={s.section}>
            <SectionHeader title="Firm Management" />
            <TouchableOpacity
              style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('CabinetManagement')}
            >
              <View style={s.row}>
                <View style={[s.iconBtn48, { backgroundColor: '#EEF2FF' }]}>
                  <Icon lib="FA5" name="landmark" size={20} color="#4F46E5" />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={s.smBold}>Cabinet Management</Text>
                  <Text style={s.xs}>Logo, members, statistics</Text>
                </View>
              </View>
              <Icon lib="FA5" name="chevron-right" size={13} color={C.gray400} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── CALENDAR INTEGRATIONS ── */}
        {(role === 'FIRM_ADMIN' || role === 'LAWYER') && (
          <View style={[s.section, { backgroundColor: '#F0FDF4' }]}>
            <SectionHeader title="Calendar Integrations" />

            {/* Google Calendar */}
            <View style={s.card}>
              <View style={[s.row, { marginBottom: 14 }]}>
                <View style={[s.iconBtn48, { backgroundColor: '#FEE2E2' }]}>
                  <Icon lib="FA5" name="calendar-alt" size={20} color="#DC2626" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.smBold}>Google Calendar</Text>
                  <Text style={s.xs}>Push your LegalHub events to Google</Text>
                  {googleConnected && (
                    <View style={[s.tag, { backgroundColor: C.green100, alignSelf: 'flex-start', marginTop: 4 }]}>
                      <Text style={[s.tagText, { color: C.green600 }]}>Connected ✓</Text>
                    </View>
                  )}
                  {googleSyncResult && (
                    <Text style={[s.xs, { color: C.green600, marginTop: 3 }]}>
                      Last sync: {googleSyncResult.synced} events ✓
                    </Text>
                  )}
                </View>
              </View>
              <View style={[s.row, { gap: 8 }]}>
                <TouchableOpacity
                  style={[s.integBtn, { backgroundColor: C.blue50, borderColor: C.blue100 }]}
                  onPress={handleConnectGoogle}
                  disabled={googleConnecting}
                  activeOpacity={0.8}
                >
                  {googleConnecting
                    ? <ActivityIndicator size="small" color={C.primary} />
                    : <Icon lib="FA5" name="link" size={13} color={C.primary} />}
                  <Text style={[s.integBtnTxt, { color: C.primary }]}>
                    {googleConnecting ? 'Opening…' : 'Connect'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.integBtn, { backgroundColor: C.green50, borderColor: C.green100, flex: 1 }]}
                  onPress={handleSyncGoogle}
                  disabled={googleSyncing}
                  activeOpacity={0.8}
                >
                  {googleSyncing
                    ? <ActivityIndicator size="small" color={C.green600} />
                    : <Icon lib="FA5" name="sync-alt" size={13} color={C.green600} />}
                  <Text style={[s.integBtnTxt, { color: C.green600 }]}>
                    {googleSyncing ? 'Syncing…' : 'Sync Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>


          </View>
        )}

        {/* ── SECURITY SETTINGS ── */}
        <View style={[s.section, { backgroundColor: '#FFF5F5' }]}>
          <Text style={[s.sectionTitle, { marginBottom: 14 }]}>Security Settings</Text>
          {SECURITY_ITEMS.map((item, i) => {
            // Change Password & Login History → chevron clickable
            if (item.type === 'chevron') return (
              <TouchableOpacity key={i} onPress={
                item.title === 'Change Password' ? () => setPwdModal(true) :
                item.title === 'Login History'   ? handleOpenHistory       : undefined
              }>
                <ChevronRow item={item} />
              </TouchableOpacity>
            );

            // 2FA toggle
            if (item.type === 'toggle-2fa') return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={[s.row, { flex: 1 }]}>
                    <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{item.sub}</Text>
                      <View style={[s.tag, { backgroundColor: twoFaEnabled ? C.green50 : C.red50, alignSelf: 'flex-start', marginTop: 6 }]}>
                        <Text style={[s.tagText, { color: twoFaEnabled ? C.green600 : C.red600 }]}>{twoFaEnabled ? 'Enabled' : 'Disabled'}</Text>
                      </View>
                    </View>
                  </View>
                  {twoFALoading
                    ? <ActivityIndicator color={C.primary} />
                    : <Switch value={twoFaEnabled} onValueChange={handleToggle2FA} trackColor={{ false: C.gray200, true: C.green600 }} thumbColor={C.white} />
                  }
                </View>
              </View>
            );

            // Biometric toggle
            if (item.type === 'toggle-bio') return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={[s.row, { flex: 1 }]}>
                    <View style={[s.iconBtn48, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={20} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{biometricSupported ? item.sub : 'Not available on this device'}</Text>
                    </View>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    disabled={!biometricSupported}
                    trackColor={{ false: C.gray200, true: C.primary }}
                    thumbColor={C.white}
                  />
                </View>
              </View>
            );

            return null;
          })}
        </View>

        {/* ── NOTIFICATION PREFERENCES ── */}
        <View style={s.section} onLayout={e => { notifSectionY.current = e.nativeEvent.layout.y; }}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
            <Text style={s.sectionTitle}>Notification Preferences</Text>
            {savingNotif && <ActivityIndicator size="small" color={C.primary} />}
          </View>
          {notifPrefs && NOTIF_ITEMS.map((item, i) => {
            const prefKey = NOTIF_PREF_KEY[item.title];
            const isOn = prefKey ? !!notifPrefs[prefKey] : item.toggleOn;
            return (
              <View key={i} style={s.card}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <View style={s.row}>
                    <View style={[s.iconBtn40, { backgroundColor: item.iconBg }]}>
                      <Icon lib={item.iconLib} name={item.iconName} size={16} color={item.iconColor} />
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={s.smBold}>{item.title}</Text>
                      <Text style={s.xs}>{item.sub}</Text>
                    </View>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={val => prefKey && handleNotifToggle(prefKey, val)}
                    trackColor={{ false: C.gray200, true: C.primary }}
                    thumbColor={C.white}
                  />
                </View>
                {item.radioGroup && isOn && (
                  <RadioGroup
                    options={item.radioOptions}
                    value={notifPrefs.hearing_reminder_offset || '1 hour before'}
                    onChange={val => handleNotifToggle('hearing_reminder_offset', val)}
                  />
                )}
              </View>
            );
          })}
          {!notifPrefs && <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
        </View>

        {/* ── LOGOUT ── */}
        <View style={s.section}>
          <View style={[s.card, { borderWidth: 2, borderColor: C.red200 }]}>
            <View style={[s.row, { marginBottom: 12 }]}>
              <View style={[s.iconBtn48, { backgroundColor: C.red100 }]}>
                <Icon lib="FA5" name="sign-out-alt" size={20} color={C.red600} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.smBold}>Logout</Text>
                <Text style={s.xs}>Sign out from this device</Text>
              </View>
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Text style={[s.smBold, { color: C.red600 }]}>Logout from Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── DANGER ZONE (admin excluded) ── */}
        {role !== 'FIRM_ADMIN' && (
        <View style={[s.section, { backgroundColor: '#FFF5F5' }]}>
          <Text style={[s.sectionTitle, { color: C.red600, marginBottom: 14 }]}>Danger Zone</Text>
          <View style={[s.card, { borderWidth: 2, borderColor: C.red200 }]}>
            <View style={[s.row, { marginBottom: 12 }]}>
              <View style={[s.iconBtn48, { backgroundColor: C.red100 }]}>
                <Icon lib="FA5" name="trash" size={20} color={C.red600} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={s.smBold}>Delete Account</Text>
                <Text style={s.xs}>Permanently remove your account</Text>
              </View>
            </View>
            <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount}>
              <Text style={[s.smBold, { color: C.white }]}>Delete My Account</Text>
            </TouchableOpacity>
            <Text style={[s.xs, { color: C.red500, textAlign: 'center', marginTop: 8 }]}>
              This action cannot be undone
            </Text>
          </View>
        </View>
        )}

      </ScrollView>

      {/* ── COUNTRY PICKER ── */}
      <CountryPickerModal
        visible={countryPickerVisible}
        selected={editPhoneCountry}
        onSelect={setEditPhoneCountry}
        onClose={() => setCountryPickerVisible(false)}
      />

      {/* ── TITLE PICKER ── */}
      <TitlePickerModal
        visible={titlePickerVisible}
        selected={editTitle}
        onSelect={setEditTitle}
        onClose={() => setTitlePickerVisible(false)}
      />

      {/* ── 2FA SETUP MODAL ── */}
      <Modal visible={twoFAModal} transparent animationType="slide" onRequestClose={() => setTwoFAModal(false)}>
          <View style={s.modalOverlay}>
            <ScrollView
              contentContainerStyle={s.modalBox}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
                <Text style={s.sectionTitle}>Setup Two-Factor Auth</Text>
                <TouchableOpacity onPress={() => { setTwoFAModal(false); setTwoFACode(''); }}>
                  <Icon lib="FA5" name="times" size={18} color={C.gray500} />
                </TouchableOpacity>
              </View>

              <Text style={[s.xs, { marginBottom: 12, lineHeight: 18 }]}>
                1. Open <Text style={{ fontWeight: '700' }}>Google Authenticator</Text> or <Text style={{ fontWeight: '700' }}>Authy</Text> on your phone.{'\n'}
                2. Tap the button below to add LegalHub, or enter the secret key manually.
              </Text>

              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue100, marginBottom: 12, alignItems: 'center' }]}
                onPress={() => twoFAData && Linking.openURL(twoFAData.qr_code_url)}
              >
                <Icon lib="FA5" name="qrcode" size={16} color={C.primary} />
                <Text style={[s.smBold, { color: C.primary, marginTop: 4 }]}>Open in Authenticator App</Text>
              </TouchableOpacity>

              {twoFAData && (
                <View style={{ backgroundColor: C.gray50, borderRadius: 10, padding: 10, marginBottom: 14 }}>
                  <Text style={[s.xs, { marginBottom: 4 }]}>Manual secret key:</Text>
                  <Text selectable style={[s.smBold, { letterSpacing: 2, color: C.primary }]}>{twoFAData.secret}</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Enter the 6-digit code from your app</Text>
              <TextInput
                style={[s.pwdInput, { marginBottom: 16, textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
                placeholder="000000"
                placeholderTextColor={C.gray400}
                keyboardType="number-pad"
                maxLength={6}
                value={twoFACode}
                onChangeText={setTwoFACode}
                returnKeyType="done"
                onSubmitEditing={handleVerify2FA}
              />
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: C.primary, alignItems: 'center', paddingVertical: 14 }]}
                onPress={handleVerify2FA}
                disabled={twoFALoading}
              >
                {twoFALoading
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={[s.smBold, { color: C.white }]}>Verify & Enable 2FA</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
      </Modal>

      {/* ── DISABLE 2FA MODAL ── */}
      <Modal visible={disable2FAModal} transparent animationType="slide" onRequestClose={() => setDisable2FAModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
              <Text style={s.sectionTitle}>Disable 2FA</Text>
              <TouchableOpacity onPress={() => { setDisable2FAModal(false); setDisable2FACode(''); }}>
                <Icon lib="FA5" name="times" size={18} color={C.gray500} />
              </TouchableOpacity>
            </View>
            <Text style={[s.xs, { color: C.gray500, marginBottom: 16 }]}>
              Enter the 6-digit code from your authenticator app to confirm.
            </Text>
            <TextInput
              style={s.input}
              placeholder="6-digit code"
              placeholderTextColor={C.gray400}
              keyboardType="number-pad"
              maxLength={6}
              value={disable2FACode}
              onChangeText={setDisable2FACode}
              returnKeyType="done"
              onSubmitEditing={handleDisable2FA}
            />
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: C.red600, alignItems: 'center', paddingVertical: 14, marginTop: 8 }]}
              onPress={handleDisable2FA}
              disabled={twoFALoading}
            >
              {twoFALoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={[s.smBold, { color: C.white }]}>Confirm & Disable 2FA</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── LOGIN HISTORY MODAL ── */}
      <Modal visible={historyModal} transparent animationType="slide" onRequestClose={() => setHistoryModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '75%' }]}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
              <Text style={s.sectionTitle}>Login History</Text>
              <TouchableOpacity onPress={() => setHistoryModal(false)}>
                <Icon lib="FA5" name="times" size={18} color={C.gray500} />
              </TouchableOpacity>
            </View>
            {historyLoading
              ? <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
              : loginHistory.length === 0
                ? <Text style={[s.xs, { textAlign: 'center', marginVertical: 30 }]}>No login history available.</Text>
                : <ScrollView showsVerticalScrollIndicator={false}>
                    {loginHistory.map((entry, i) => {
                      const method = entry.login_method;
                      const isGoogle    = method === 'google';
                      const isBiometric = method === 'biometric';
                      const iconName    = isGoogle ? 'google' : isBiometric ? 'fingerprint' : 'lock';
                      const iconColor   = isGoogle ? '#EA4335' : isBiometric ? '#6C47FF' : C.primary;
                      const iconBg      = isGoogle ? '#fce8e8' : isBiometric ? '#ede8ff' : C.blue50;
                      const methodLabel = isGoogle ? 'Google' : isBiometric ? 'Biometric' : 'Password';
                      return (
                        <View key={i} style={[s.row, { paddingVertical: 12, borderBottomWidth: i < loginHistory.length - 1 ? 1 : 0, borderBottomColor: C.gray100 }]}>
                          <View style={[s.iconBtn40, { backgroundColor: iconBg }]}>
                            <Icon lib="FA5" name={iconName} size={15} color={iconColor} />
                          </View>
                          <View style={{ marginLeft: 12 }}>
                            <Text style={s.smBold}>
                              {new Date(entry.logged_in_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </Text>
                            <Text style={s.xs}>
                              {new Date(entry.logged_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              {' · '}{methodLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
            }
          </View>
        </View>
      </Modal>

      {/* ── CHANGE PASSWORD MODAL ── */}
      {pwdModal && (
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 20 }]}>
              <Text style={s.sectionTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => { setPwdModal(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}>
                <Icon lib="FA5" name="times" size={18} color={C.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Current Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Enter current password" placeholderTextColor={C.gray400} value={currentPwd} onChangeText={setCurrentPwd} />

            <Text style={s.fieldLabel}>New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 14 }]} secureTextEntry placeholder="Min. 8 characters" placeholderTextColor={C.gray400} value={newPwd} onChangeText={setNewPwd} />

            <Text style={s.fieldLabel}>Confirm New Password</Text>
            <TextInput style={[s.pwdInput, { marginBottom: 20 }]} secureTextEntry placeholder="Repeat new password" placeholderTextColor={C.gray400} value={confirmPwd} onChangeText={setConfirmPwd} />

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: C.primary, width: '100%', justifyContent: 'center', paddingVertical: 14 }]}
              onPress={handleChangePassword}
              disabled={savingPwd}
            >
              <Text style={[s.smBold, { color: C.white }]}>{savingPwd ? 'Saving…' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  scroll: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  section: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: C.white, marginBottom: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.dark },
  sectionAction: { fontSize: 13, fontWeight: '600', color: C.primary },

  profileCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 4, borderWidth: 1, borderColor: C.gray100 },
  profileAvatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: C.primary },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white },
  profileName: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 4 },
  profileRole: { fontSize: 14, color: C.gray600, marginBottom: 4 },
  profileStatVal: { fontSize: 22, fontWeight: '800', color: C.dark, marginBottom: 2 },
  profileStatLabel: { fontSize: 12, color: C.gray600 },

  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.gray100, marginBottom: 10 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { flex: 1, fontSize: 14, fontWeight: '600', color: C.dark, marginLeft: 12 },

  row: { flexDirection: 'row', alignItems: 'center' },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },

  iconBtn40: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconBtn48: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  storageBg: { width: 80, height: 8, backgroundColor: C.gray200, borderRadius: 4 },
  storageFill: { height: 8, backgroundColor: C.amber600, borderRadius: 4 },

  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.gray300, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },

  integBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  integBtnTxt: { fontSize: 13, fontWeight: '700' },

  aboutCard: { backgroundColor: C.white, borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: C.gray100 },
  appIconWrap: { width: 80, height: 80, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  appName: { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 4 },
  updateBtn: { backgroundColor: C.blue50, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14 },
  socialBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  logoutBtn: { backgroundColor: C.red50, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  deleteBtn: { backgroundColor: C.red600, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },

  xs: { fontSize: 12, color: C.gray600 },
  sm: { fontSize: 13, color: C.dark },
  smBold: { fontSize: 13, fontWeight: '700', color: C.dark },

  bottomNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingVertical: 8, paddingHorizontal: 8, position: 'absolute', bottom: 0, left: 0, right: 0, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navLabel: { fontSize: 11, fontWeight: '500', color: C.gray400, marginTop: 2 },
  activeNavIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' },
  fabBtn: { flex: 1, alignItems: 'center', marginTop: -24 },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },

  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: C.white, borderRadius: 24, padding: 24, width: '100%' },
  pwdInput: { borderWidth: 1.5, borderColor: C.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.dark },
});
