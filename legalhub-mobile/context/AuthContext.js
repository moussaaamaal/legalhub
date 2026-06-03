// context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

const KEYS = {
  ACCESS:        'lh_access_token',
  REFRESH:       'lh_refresh_token',
  USER:          'lh_user',
  REMEMBERED_EMAIL: 'lh_remembered_email',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState(null);
  const [loading, setLoading]     = useState(true); // initial hydration

  // ── Hydrate from storage on mount ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(KEYS.ACCESS),
          AsyncStorage.getItem(KEYS.USER),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (_) {
        // corrupted storage — start fresh
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Called after successful login/register ─────────────────────────────
  // remember=true  → persist session in AsyncStorage (survives app restart)
  // remember=false → memory only, cleared when app is killed
  const signIn = async (accessToken, refreshToken, userData, remember = true) => {
    if (remember) {
      await Promise.all([
        AsyncStorage.setItem(KEYS.ACCESS,  accessToken),
        AsyncStorage.setItem(KEYS.REFRESH, refreshToken),
        AsyncStorage.setItem(KEYS.USER,    JSON.stringify(userData)),
        AsyncStorage.setItem(KEYS.REMEMBERED_EMAIL, userData.email ?? ''),
      ]);
    } else {
      // Clear any previously persisted session
      await Promise.all([
        AsyncStorage.removeItem(KEYS.ACCESS),
        AsyncStorage.removeItem(KEYS.REFRESH),
        AsyncStorage.removeItem(KEYS.USER),
        AsyncStorage.removeItem(KEYS.REMEMBERED_EMAIL),
      ]);
    }
    setToken(accessToken);
    setUser(userData);
  };

  // ── Called on logout ───────────────────────────────────────────────────
  const signOut = async () => {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.ACCESS),
      AsyncStorage.removeItem(KEYS.REFRESH),
      AsyncStorage.removeItem(KEYS.USER),
    ]);
    setToken(null);
    setUser(null);
  };

  // ── Update stored user (e.g. after profile edit) ───────────────────────
  const updateUser = async (updatedUser) => {
    const merged = { ...user, ...updatedUser };
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(merged));
    setUser(merged);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// ── Helpers (used by api.js outside of React tree) ────────────────────────
export const getStoredToken     = () => AsyncStorage.getItem(KEYS.ACCESS);
export const getStoredRefresh   = () => AsyncStorage.getItem(KEYS.REFRESH);
export const getRememberedEmail = () => AsyncStorage.getItem(KEYS.REMEMBERED_EMAIL);
export const storeTokens = (access, refresh) =>
  Promise.all([
    AsyncStorage.setItem(KEYS.ACCESS,  access),
    AsyncStorage.setItem(KEYS.REFRESH, refresh),
  ]);
