import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen          from '../screens/Profile/ProfileScreen';
import CabinetManagementScreen from '../screens/Cabinet/CabinetManagementScreen';

const Stack = createNativeStackNavigator();

export default function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain"       component={ProfileScreen} />
      <Stack.Screen name="CabinetManagement" component={CabinetManagementScreen} />
    </Stack.Navigator>
  );
}
