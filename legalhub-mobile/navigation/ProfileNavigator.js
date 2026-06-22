import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen           from '../screens/Profile/ProfileScreen';
import CabinetManagementScreen from '../screens/Cabinet/CabinetManagementScreen';
import FirmStaffScreen         from '../screens/Cabinet/FirmStaffScreen';

const Stack = createNativeStackNavigator();

export default function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain"       component={ProfileScreen} />
      <Stack.Screen name="CabinetManagement" component={CabinetManagementScreen} />
      <Stack.Screen name="FirmStaff"         component={FirmStaffScreen} />
    </Stack.Navigator>
  );
}
