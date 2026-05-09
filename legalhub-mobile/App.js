import React from "react";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { AppPrefsProvider } from './context/AppPrefsContext';
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppPrefsProvider>
          <AppNavigator />
        </AppPrefsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}