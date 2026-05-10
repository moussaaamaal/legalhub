import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { AppPrefsProvider } from './context/AppPrefsContext';
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AuthProvider>
          <AppPrefsProvider>
            <AppNavigator />
          </AppPrefsProvider>
        </AuthProvider>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });