import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

const BIO_EMAIL_KEY = 'lh_bio_email';
const BIO_PASS_KEY  = 'lh_bio_pass';

// ─── COULEURS ─────────────────────────────────────────────────────────────
const C = {
  primary: '#1E40AF', secondary: '#3B82F6', dark: '#1E293B',
  white: '#FFFFFF',
  g50: '#F9FAFB', g100: '#F3F4F6', g200: '#E5E7EB', g400: '#9CA3AF', g500: '#6B7280', g600: '#4B5563',
  red50: '#FEF2F2', red600: '#DC2626',
  amber50: '#FFFBEB', amber600: '#D97706',
  green50: '#F0FDF4', green600: '#16A34A',
  blue50: '#EFF6FF', blue100: '#DBEAFE',
  purple50: '#FAF5FF', purple100: '#F3E8FF', purple600: '#9333EA',
  indigo50: '#EEF2FF', indigo600: '#4F46E5',
};

const SECURITY_FEATURES = [
  { icon: 'check-circle', iconColor: C.green600, bg: C.green50,  title: 'End-to-End Encryption',     desc: 'All your data is encrypted and secure'    },
  { icon: 'check-circle', iconColor: C.primary,  bg: C.blue50,   title: 'Two-Factor Authentication', desc: 'Extra layer of security for your account' },
  { icon: 'check-circle', iconColor: C.purple600,bg: C.purple50, title: 'GDPR Compliant',            desc: 'Your privacy is our priority'             },
  { icon: 'check-circle', iconColor: C.amber600, bg: C.amber50,  title: 'Regular Security Audits',   desc: 'Continuously monitored and updated'       },
];

const FEATURES = [
  { gradientBg: '#1D4ED8', icon: 'robot',     title: 'AI-Powered Assistant',     desc: 'Automate document drafting, summarization, and legal research' },
  { gradientBg: '#7E22CE', icon: 'briefcase', title: 'Complete Case Management',  desc: 'Track cases, clients, hearings, and deadlines in one place'   },
  { gradientBg: '#15803D', icon: 'cloud',     title: 'Cloud-Based & Secure',      desc: 'Access your practice from anywhere with bank-level security'  },
  { gradientBg: '#B45309', icon: 'users',     title: 'Multi-Tenant Architecture', desc: 'Perfect for law offices with multiple lawyers and staff'      },
];

const SUPPORT_BTNS = [
  { icon: 'phone',    label: 'Call Support' },
  { icon: 'comments', label: 'Live Chat'    },
  { icon: 'envelope', label: 'Email Us'     },
  { icon: 'book',     label: 'Help Center'  },
];

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────
export default function AuthScreen() {
  const { signIn } = useAuth();
  const [activeTab, setActiveTab]             = useState('signin');
  const [showPass, setShowPass]               = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [bioLoading, setBioLoading]           = useState(false);
  // 2FA challenge modal
  const [twoFAModal, setTwoFAModal]           = useState(false);
  const [twoFATempToken, setTwoFATempToken]   = useState('');
  const [twoFACode, setTwoFACode]             = useState('');
  const [twoFALoading, setTwoFALoading]       = useState(false);

  useEffect(() => {
    (async () => {
      const supported   = await LocalAuthentication.hasHardwareAsync();
      const enrolled    = await LocalAuthentication.isEnrolledAsync();
      const savedEmail  = await SecureStore.getItemAsync(BIO_EMAIL_KEY);
      setBiometricAvailable(supported && enrolled && !!savedEmail);
    })();
  }, []);

  const handleBiometricLogin = async () => {
    setBioLoading(true);
    try {
      const types     = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFaceID = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:         hasFaceID ? 'Sign in with Face ID' : 'Sign in with fingerprint',
        fallbackLabel:         'Use password instead',
        cancelLabel:           'Cancel',
        disableDeviceFallback: false,
      });

      if (!result.success) return;

      const savedEmail = await SecureStore.getItemAsync(BIO_EMAIL_KEY);
      const savedPass  = await SecureStore.getItemAsync(BIO_PASS_KEY);

      if (!savedEmail || !savedPass) {
        Alert.alert('Setup required', 'Please sign in once with your password to enable biometric login.');
        setActiveTab('signin');
        return;
      }

      const data = await authAPI.login(savedEmail, savedPass);

      if (data.requires_2fa) {
        setTwoFATempToken(data.temp_token);
        setTwoFACode('');
        setTwoFAModal(true);
        return;
      }

      await signIn(data.access_token, data.refresh_token, data.user);
    } catch (err) {
      Alert.alert('Error', err.message || 'Biometric authentication failed.');
    } finally {
      setBioLoading(false);
    }
  };

  // ── Sign In ──
  const [officeCode, setOfficeCode] = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [remember, setRemember]     = useState(false);

  // ── New Firm (FIRM_ADMIN) ──
  const [firmName, setFirmName]       = useState('');
  const [fullName, setFullName]       = useState('');
  const [suEmail, setSuEmail]         = useState('');
  const [phone, setPhone]             = useState('');
  const [suPass, setSuPass]           = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [agreeTerms, setAgreeTerms]   = useState(false);

  // ── Accept Invite (Client) ──
  const [invToken, setInvToken]       = useState('');
  const [invEmail, setInvEmail]       = useState('');
  const [invName, setInvName]         = useState('');
  const [invPass, setInvPass]         = useState('');
  const [invConfirm, setInvConfirm]   = useState('');

  // ─── HANDLERS ───────────────────────────────────────────────────────────

  // Validate Office Code — joins a firm as a new LAWYER
  const handleValidateOfficeCode = async () => {
    if (!officeCode.trim() || !email.trim() || !password.trim() || !fullName.trim()) {
      Alert.alert('Missing fields', 'Please fill in the office code, your name, email and password.');
      return;
    }
    setLoading(true);
    try {
      const data = await authAPI.validateOfficeCode({
        code: officeCode,
        email,
        password,
        full_name: fullName,
      });
      await signIn(data.access_token, data.refresh_token, data.user);
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'Office code not recognized.');
    } finally {
      setLoading(false);
    }
  };

  // Sign In
  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const data = await authAPI.login(email, password);

      // 2FA required — show TOTP challenge modal
      if (data.requires_2fa) {
        setTwoFATempToken(data.temp_token);
        setTwoFACode('');
        setTwoFAModal(true);
        return;
      }

      await signIn(data.access_token, data.refresh_token, data.user);

      // Save credentials for biometric login (SecureStore, encrypted)
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled  = await LocalAuthentication.isEnrolledAsync();
      if (supported && enrolled) {
        await SecureStore.setItemAsync(BIO_EMAIL_KEY, email);
        await SecureStore.setItemAsync(BIO_PASS_KEY,  password);
      }
    } catch (err) {
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Complete 2FA login
  const handleComplete2FALogin = async () => {
    if (!twoFACode.trim()) return;
    setTwoFALoading(true);
    try {
      const data = await authAPI.login2FA(twoFATempToken, twoFACode.trim());
      setTwoFAModal(false);
      await signIn(data.access_token, data.refresh_token, data.user);

      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled  = await LocalAuthentication.isEnrolledAsync();
      if (supported && enrolled) {
        await SecureStore.setItemAsync(BIO_EMAIL_KEY, email);
        await SecureStore.setItemAsync(BIO_PASS_KEY,  password);
      }
    } catch (err) {
      Alert.alert('Invalid Code', err.message || 'The code is incorrect or expired.');
    } finally {
      setTwoFALoading(false);
    }
  };

  // Sign Up — registers a new law firm + FIRM_ADMIN account
  const handleSignUp = async () => {
    if (!firmName.trim() || !fullName.trim() || !suEmail.trim() || !suPass.trim()) {
      Alert.alert('Missing fields', 'Please fill all required fields (firm name, your name, email, password).');
      return;
    }
    if (suPass !== confirmPass) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      Alert.alert('Terms Required', 'Please accept the Terms of Service.');
      return;
    }
    setLoading(true);
    try {
      const data = await authAPI.registerFirm({
        firm_name:         firmName.trim(),
        legal_entity_type: 'Law Firm',
        email:             suEmail,
        password:          suPass,
        full_name:         fullName,
        phone:             phone || undefined,
      });
      await signIn(data.access_token, data.refresh_token, data.user);
    } catch (err) {
      Alert.alert('Sign Up Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Accept Invite — client registers via invite token sent by lawyer
  const handleAcceptInvite = async () => {
    if (!invToken.trim() || !invEmail.trim() || !invPass.trim() || !invName.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (invPass !== invConfirm) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await authAPI.acceptInvite({
        invite_token: invToken,
        email:        invEmail,
        password:     invPass,
        full_name:    invName,
      });
      await signIn(data.access_token, data.refresh_token, data.user);
    } catch (err) {
      Alert.alert('Invitation Error', err.message || 'Invalid or expired invite token.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Enter your email first, then tap Forgot Password.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      Alert.alert('Email Sent', 'Check your inbox for the password reset link.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoCircle}>
            <FontAwesome5 name="balance-scale" size={22} color={C.white} />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={s.appName}>LegalHub</Text>
            <Text style={s.appTagline}>Professional Legal Management</Text>
          </View>
          <View style={s.badgeSecure}>
            <FontAwesome5 name="shield-alt" size={10} color="#6EE7B7" />
            <Text style={s.badgeSecureTxt}>Secure</Text>
          </View>
        </View>
        <View style={s.statsRow}>
          {[
            { val: '2,847', label: 'Law Firms' },
            { val: '15K+',  label: 'Lawyers'   },
            { val: '99.9%', label: 'Uptime'    },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── MAIN AUTH CARD ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {activeTab === 'signin'  ? 'Welcome back'
            : activeTab === 'lawyer' ? 'Join Your Firm'
            : activeTab === 'signup' ? 'Register a Law Firm'
            :                          'Client Access'}
          </Text>
          <Text style={[s.cardSub, { marginBottom: 16 }]}>
            {activeTab === 'signin'  ? 'Sign in to your account'
            : activeTab === 'lawyer' ? 'Enter your office code to join as a lawyer'
            : activeTab === 'signup' ? 'Create a new firm — you become its administrator'
            :                          'Activate your account with your invitation token'}
          </Text>

          {/* 4 tabs */}
          <View style={s.tabSwitch}>
            {[
              { key: 'signin',  label: 'Sign In'  },
              { key: 'lawyer',  label: 'Lawyer'   },
              { key: 'signup',  label: 'New Firm' },
              { key: 'invite',  label: 'Client'   },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[s.tabBtnTxt, activeTab === tab.key && s.tabBtnTxtActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── SIGN IN ── */}
          {activeTab === 'signin' && (
            <View>
              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="envelope" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="lawyer@example.com"
                  placeholderTextColor={C.g400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Enter your password"
                  placeholderTextColor={C.g400}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <View style={[s.row, { justifyContent: 'space-between', marginBottom: 20 }]}>
                <TouchableOpacity style={s.row} onPress={() => setRemember(!remember)}>
                  <View style={[s.checkbox, remember && s.checkboxChecked]}>
                    {remember && <FontAwesome5 name="check" size={10} color={C.white} />}
                  </View>
                  <Text style={s.checkLabel}>Remember me</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={s.forgotTxt}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleSignIn}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.white} />
                  : <>
                      <Text style={s.btnPrimaryTxt}>Sign In</Text>
                      <FontAwesome5 name="arrow-right" size={14} color={C.white} style={{ marginLeft: 8 }} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── LAWYER — Office Code ── */}
          {activeTab === 'lawyer' && (
            <View>
              <View style={[s.infoBox, { backgroundColor: C.blue50, borderColor: '#BFDBFE', borderWidth: 1, marginBottom: 20 }]}>
                <FontAwesome5 name="info-circle" size={13} color={C.primary} style={{ marginTop: 1 }} />
                <Text style={s.infoTxt}>
                  Your office code is provided by your firm administrator. Fill in your details to join the firm as a lawyer.
                </Text>
              </View>

              <Text style={s.label}>Office Code</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="hashtag" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="e.g., STERLING2024"
                  placeholderTextColor={C.g400}
                  value={officeCode}
                  onChangeText={setOfficeCode}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={s.label}>Full Name</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="user" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Your full name"
                  placeholderTextColor={C.g400}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="envelope" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="your@email.com"
                  placeholderTextColor={C.g400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Create a password"
                  placeholderTextColor={C.g400}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleValidateOfficeCode}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.white} />
                  : <>
                      <Text style={s.btnPrimaryTxt}>Join Firm</Text>
                      <FontAwesome5 name="sign-in-alt" size={14} color={C.white} style={{ marginLeft: 8 }} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── SIGN UP (New Law Firm) ── */}
          {activeTab === 'signup' && (
            <View>
              <View style={[s.infoBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1, marginBottom: 20 }]}>
                <FontAwesome5 name="building" size={13} color={C.green600} style={{ marginTop: 1 }} />
                <Text style={[s.infoTxt, { color: '#15803D' }]}>
                  This form creates a <Text style={{ fontWeight: '800' }}>new law firm account</Text>. You will be the firm administrator.{'\n'}
                  Lawyers join via Office Code · Clients activate via invite link.
                </Text>
              </View>

              <Text style={s.label}>Law Firm Name</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="building" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="e.g., Sterling & Associates"
                  placeholderTextColor={C.g400}
                  value={firmName}
                  onChangeText={setFirmName}
                />
              </View>

              <Text style={s.label}>Your Full Name</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="user" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="John Doe"
                  placeholderTextColor={C.g400}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="envelope" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="your@email.com"
                  placeholderTextColor={C.g400}
                  value={suEmail}
                  onChangeText={setSuEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={s.label}>Phone Number</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="phone" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={C.g400}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Create a strong password"
                  placeholderTextColor={C.g400}
                  value={suPass}
                  onChangeText={setSuPass}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Confirm Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Re-enter your password"
                  placeholderTextColor={C.g400}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  secureTextEntry={!showConfirmPass}
                />
                <TouchableOpacity onPress={() => setShowConfirmPass(!showConfirmPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showConfirmPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[s.infoBox, { backgroundColor: C.blue50, borderColor: '#BFDBFE', borderWidth: 1, marginBottom: 20 }]}
                onPress={() => setAgreeTerms(!agreeTerms)}
              >
                <View style={[s.checkbox, agreeTerms && s.checkboxChecked, { flexShrink: 0 }]}>
                  {agreeTerms && <FontAwesome5 name="check" size={10} color={C.white} />}
                </View>
                <Text style={s.infoTxt}>
                  I agree to the{' '}
                  <Text style={{ color: C.primary, fontWeight: '700' }}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={{ color: C.primary, fontWeight: '700' }}>Privacy Policy</Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleSignUp}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.white} />
                  : <>
                      <Text style={s.btnPrimaryTxt}>Create Account</Text>
                      <FontAwesome5 name="user-plus" size={14} color={C.white} style={{ marginLeft: 8 }} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
          {/* ── ACCEPT INVITE (CLIENT) ── */}
          {activeTab === 'invite' && (
            <View>
              <View style={[s.infoBox, { backgroundColor: C.blue50, borderColor: '#BFDBFE', borderWidth: 1, marginBottom: 20 }]}>
                <FontAwesome5 name="info-circle" size={13} color={C.primary} style={{ marginTop: 1 }} />
                <Text style={s.infoTxt}>
                  Enter the invite token sent to you by your attorney to create your client account.
                </Text>
              </View>

              <Text style={s.label}>Invite Token</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="key" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Paste your invite token"
                  placeholderTextColor={C.g400}
                  value={invToken}
                  onChangeText={setInvToken}
                  autoCapitalize="none"
                />
              </View>

              <Text style={s.label}>Full Name</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="user" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Your full name"
                  placeholderTextColor={C.g400}
                  value={invName}
                  onChangeText={setInvName}
                />
              </View>

              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="envelope" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Email used in your invitation"
                  placeholderTextColor={C.g400}
                  value={invEmail}
                  onChangeText={setInvEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Create a password"
                  placeholderTextColor={C.g400}
                  value={invPass}
                  onChangeText={setInvPass}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Confirm Password</Text>
              <View style={s.inputWrap}>
                <FontAwesome5 name="lock" size={14} color={C.g400} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Re-enter your password"
                  placeholderTextColor={C.g400}
                  value={invConfirm}
                  onChangeText={setInvConfirm}
                  secureTextEntry={!showConfirmPass}
                />
                <TouchableOpacity onPress={() => setShowConfirmPass(!showConfirmPass)} style={{ paddingRight: 14 }}>
                  <FontAwesome5 name={showConfirmPass ? 'eye-slash' : 'eye'} size={14} color={C.g400} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleAcceptInvite}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.white} />
                  : <>
                      <Text style={s.btnPrimaryTxt}>Activate Account</Text>
                      <FontAwesome5 name="user-check" size={14} color={C.white} style={{ marginLeft: 8 }} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── BIOMETRIC LOGIN ───────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: biometricAvailable ? '#FAF5FF' : C.g50, borderColor: biometricAvailable ? '#E9D5FF' : C.g200 }]}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={[s.iconBox, { width: 64, height: 64, borderRadius: 20, backgroundColor: C.white, marginBottom: 10 }]}>
              <FontAwesome5 name="fingerprint" size={28} color={biometricAvailable ? C.purple600 : C.g400} />
            </View>
            <Text style={s.cardTitle}>Quick Login</Text>
            <Text style={s.cardSub}>
              {biometricAvailable
                ? 'Use Face ID or fingerprint to sign in instantly'
                : 'Enable biometric login in Profile → Security Settings'}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.bioBtn, { width: '100%', justifyContent: 'center', gap: 10,
              backgroundColor: biometricAvailable ? C.purple600 : C.g200,
              opacity: biometricAvailable ? 1 : 0.6,
            }]}
            onPress={handleBiometricLogin}
            disabled={!biometricAvailable || bioLoading}
          >
            {bioLoading
              ? <ActivityIndicator color={biometricAvailable ? C.white : C.g400} />
              : <>
                  <FontAwesome5 name="fingerprint" size={20} color={biometricAvailable ? C.white : C.g400} />
                  <Text style={[s.bioBtnTxt, { color: biometricAvailable ? C.white : C.g400 }]}>
                    Sign in with Face ID / Touch ID
                  </Text>
                </>
            }
          </TouchableOpacity>
        </View>

        {/* ── SOCIAL LOGIN ──────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>Or continue with</Text>
            <View style={s.dividerLine} />
          </View>
          {[
            {
              icon: 'google',
              color: C.red600,
              label: 'Continue with Google',
              handler: () => handleOAuthLogin('google'),
            },
            {
              icon: 'windows',
              color: C.primary,
              label: 'Continue with Microsoft',
              handler: () => handleOAuthLogin('azure'),
            },
            {
              icon: 'apple',
              color: C.dark,
              label: 'Continue with Apple',
              handler: () => Alert.alert('Coming Soon', 'Apple login coming soon.'),
            },
          ].map((social, i) => (
            <TouchableOpacity
              key={i}
              style={s.socialBtn}
              onPress={social.handler}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={C.g400} />
                : <>
                    <FontAwesome name={social.icon} size={20} color={social.color} />
                    <Text style={s.socialBtnTxt}>{social.label}</Text>
                  </>
              }
            </TouchableOpacity>
          ))}
        </View>

        {/* ── NEW TO LEGALHUB ───────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: C.blue50, borderColor: C.blue100 }]}>
          <View style={s.row}>
            <View style={[s.iconBox, { backgroundColor: C.white }]}>
              <FontAwesome5 name="user-plus" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.cardTitle}>New to LegalHub?</Text>
              <Text style={[s.cardSub, { marginBottom: 10 }]}>
                Join your law office team and start managing cases efficiently
              </Text>
              <TouchableOpacity style={s.outlineBtn} onPress={() => setActiveTab('signup')}>
                <Text style={s.outlineBtnTxt}>Create Account</Text>
                <FontAwesome5 name="arrow-right" size={12} color={C.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── SECURITY ──────────────────────────────────────────────── */}
        <View style={s.card}>
          <View style={[s.row, { marginBottom: 14 }]}>
            <FontAwesome5 name="shield-alt" size={14} color={C.green600} />
            <Text style={[s.cardTitle, { marginLeft: 8 }]}>Security & Privacy</Text>
          </View>
          {SECURITY_FEATURES.map((f, i) => (
            <View key={i} style={[s.securityRow, { backgroundColor: f.bg }]}>
              <FontAwesome5 name={f.icon} size={16} color={f.iconColor} style={{ marginTop: 1 }} />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.secTitle}>{f.title}</Text>
                <Text style={s.secDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── SUPPORT ───────────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: C.indigo50, borderColor: '#C7D2FE' }]}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={[s.iconBox, { width: 64, height: 64, borderRadius: 20, backgroundColor: C.white, marginBottom: 10 }]}>
              <FontAwesome5 name="headset" size={26} color={C.indigo600} />
            </View>
            <Text style={s.cardTitle}>Need Help?</Text>
            <Text style={s.cardSub}>Our support team is here to assist you 24/7</Text>
          </View>
          <View style={s.supportGrid}>
            {SUPPORT_BTNS.map((b, i) => (
              <TouchableOpacity key={i} style={[s.supportBtn, { borderColor: '#C7D2FE' }]}>
                <FontAwesome5 name={b.icon} size={20} color={C.indigo600} />
                <Text style={[s.supportBtnTxt, { color: C.dark }]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── WHY LEGALHUB ──────────────────────────────────────────── */}
        <View style={[s.card, { backgroundColor: '#EEF2FF' }]}>
          <Text style={[s.cardTitle, { textAlign: 'center', marginBottom: 14 }]}>
            Why Lawyers Choose LegalHub
          </Text>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <View style={[s.featureIcon, { backgroundColor: f.gradientBg }]}>
                <FontAwesome5 name={f.icon} size={18} color={C.white} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── 2FA Challenge Modal ───────────────────────────────────────── */}
      <Modal visible={twoFAModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.blue100, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <FontAwesome5 name="shield-alt" size={24} color={C.primary} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: C.dark }}>Two-Factor Authentication</Text>
              <Text style={{ fontSize: 14, color: C.g500, marginTop: 6, textAlign: 'center' }}>
                Enter the 6-digit code from your authenticator app to continue.
              </Text>
            </View>

            <TextInput
              style={{
                borderWidth: 1.5, borderColor: C.g200, borderRadius: 12,
                padding: 14, fontSize: 24, letterSpacing: 8, textAlign: 'center',
                color: C.dark, fontWeight: '700', marginBottom: 20,
              }}
              placeholder="000000"
              placeholderTextColor={C.g400}
              keyboardType="number-pad"
              maxLength={6}
              value={twoFACode}
              onChangeText={setTwoFACode}
              returnKeyType="done"
              onSubmitEditing={handleComplete2FALogin}
              autoFocus
            />

            <TouchableOpacity
              style={{
                backgroundColor: twoFALoading ? C.g200 : C.primary,
                borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12,
              }}
              onPress={handleComplete2FALogin}
              disabled={twoFALoading}
            >
              {twoFALoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>Verify & Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={{ alignItems: 'center', padding: 10 }}
              onPress={() => { setTwoFAModal(false); setTwoFACode(''); }}
            >
              <Text style={{ color: C.g500, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: C.primary },
  scroll:          { flex: 1, backgroundColor: C.g50 },
  row:             { flexDirection: 'row', alignItems: 'center' },
  header:          { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  logoRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  logoCircle:      { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  appName:         { fontSize: 20, fontWeight: '800', color: C.white },
  appTagline:      { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  badgeSecure:     { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  badgeSecureTxt:  { fontSize: 11, fontWeight: '700', color: '#6EE7B7' },
  statsRow:        { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statItem:        { alignItems: 'center' },
  statVal:         { fontSize: 18, fontWeight: '800', color: C.white },
  statLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  card:            { backgroundColor: C.white, borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: C.g100, marginBottom: 14 },
  cardHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardTitle:       { fontSize: 15, fontWeight: '800', color: C.dark },
  cardSub:         { fontSize: 12, color: C.g500, marginTop: 2 },
  iconBox:         { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inputWrap:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.g50, borderWidth: 1, borderColor: C.g200, borderRadius: 16, marginBottom: 14 },
  inputIcon:       { paddingLeft: 14 },
  input:           { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 14, color: C.dark },
  infoBox:         { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, padding: 12, gap: 8 },
  infoTxt:         { flex: 1, fontSize: 12, color: C.g600 },
  label:           { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 6 },
  tabSwitch:       { flexDirection: 'row', backgroundColor: C.g100, borderRadius: 16, padding: 4, marginBottom: 20 },
  tabBtn:          { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabBtnActive:    { backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  tabBtnTxt:       { fontSize: 13, fontWeight: '600', color: C.g600 },
  tabBtnTxtActive: { color: C.primary, fontWeight: '700' },
  checkbox:        { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: C.g400, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
  checkLabel:      { fontSize: 13, color: C.g600, fontWeight: '500' },
  forgotTxt:       { fontSize: 13, fontWeight: '700', color: C.primary },
  typeCard:        { flex: 1, backgroundColor: C.g50, borderWidth: 2, borderColor: C.g200, borderRadius: 18, padding: 14, alignItems: 'center', gap: 6 },
  typeCardActive:  { borderColor: C.primary, backgroundColor: C.blue50 },
  typeIconBox:     { width: 48, height: 48, backgroundColor: C.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  typeName:        { fontSize: 13, fontWeight: '800', color: C.dark },
  typeSub:         { fontSize: 11, color: C.g500 },
  btnPrimary:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, paddingVertical: 16, borderRadius: 18, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  btnPrimaryTxt:   { fontSize: 15, fontWeight: '800', color: C.white },
  outlineBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: C.white, borderWidth: 2, borderColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  outlineBtnTxt:   { fontSize: 13, fontWeight: '700', color: C.primary },
  bioBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.white, borderWidth: 1, borderColor: '#E9D5FF', paddingVertical: 14, borderRadius: 16 },
  bioBtnTxt:       { fontSize: 13, fontWeight: '700', color: C.dark },
  dividerRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  dividerLine:     { flex: 1, height: 1, backgroundColor: C.g200 },
  dividerTxt:      { paddingHorizontal: 12, fontSize: 12, color: C.g500 },
  socialBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.white, borderWidth: 2, borderColor: C.g200, paddingVertical: 13, borderRadius: 16, marginBottom: 10, minHeight: 48 },
  socialBtnTxt:    { fontSize: 13, fontWeight: '700', color: C.dark },
  securityRow:     { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, padding: 12, marginBottom: 8 },
  secTitle:        { fontSize: 13, fontWeight: '700', color: C.dark, marginBottom: 2 },
  secDesc:         { fontSize: 11, color: C.g500 },
  supportGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  supportBtn:      { width: '47%', backgroundColor: C.white, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 6 },
  supportBtnTxt:   { fontSize: 12, fontWeight: '700' },
  featureRow:      { flexDirection: 'row', backgroundColor: C.white, borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, marginBottom: 10 },
  featureIcon:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureTitle:    { fontSize: 13, fontWeight: '800', color: C.dark, marginBottom: 3 },
  featureDesc:     { fontSize: 12, color: C.g500, lineHeight: 17 },
});