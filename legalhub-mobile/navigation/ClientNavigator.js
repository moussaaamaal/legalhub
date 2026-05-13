import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';

import ClientDashboard              from '../screens/Client/ClientDashboard';
import ClientCasesScreen            from '../screens/Client/ClientCasesScreen';
import ClientCaseDetailScreen       from '../screens/Client/ClientCaseDetailScreen';
import ClientInvoicesScreen         from '../screens/Client/ClientInvoicesScreen';
import ClientInvoiceDetailScreen    from '../screens/Client/ClientInvoiceDetailScreen';
import ClientDocumentsScreen        from '../screens/Client/ClientDocumentsScreen';
import ClientAppointmentsScreen     from '../screens/Client/ClientAppointmentsScreen';
import ClientProfileScreen          from '../screens/Client/ClientProfileScreen';
import ClientEditProfileScreen      from '../screens/Client/ClientEditProfileScreen';
import ClientSettingsScreen         from '../screens/Client/ClientSettingsScreen';
import ClientNotificationsScreen    from '../screens/Client/ClientNotificationsScreen';
import ClientActivityScreen         from '../screens/Client/ClientActivityScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const PRIMARY  = '#1E40AF';
const BLUE_50  = '#EFF6FF';
const GRAY_200 = '#E5E7EB';
const GRAY_400 = '#9CA3AF';

// ─── Stacks ──────────────────────────────────────────────────────────────────

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientDashboard"       component={ClientDashboard} />
      <Stack.Screen name="ClientNotifications"   component={ClientNotificationsScreen} />
      <Stack.Screen name="ClientActivity"        component={ClientActivityScreen} />
      <Stack.Screen name="ClientDocuments"       component={ClientDocumentsScreen} />
    </Stack.Navigator>
  );
}

function CasesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientCasesList"   component={ClientCasesScreen} />
      <Stack.Screen name="ClientCaseDetail"  component={ClientCaseDetailScreen} />
    </Stack.Navigator>
  );
}

function InvoicesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientInvoicesList"  component={ClientInvoicesScreen} />
      <Stack.Screen name="ClientInvoiceDetail" component={ClientInvoiceDetailScreen} />
    </Stack.Navigator>
  );
}

function AppointmentsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientAppointmentsList" component={ClientAppointmentsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientProfileMain"  component={ClientProfileScreen} />
      <Stack.Screen name="ClientEditProfile"  component={ClientEditProfileScreen} />
      <Stack.Screen name="ClientSettings"     component={ClientSettingsScreen} />
    </Stack.Navigator>
  );
}

// ─── Tab Icon ─────────────────────────────────────────────────────────────────

function TabIcon({ routeName, focused }) {
  const color = focused ? PRIMARY : GRAY_400;
  switch (routeName) {
    case 'ClientHome':
      return <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />;
    case 'ClientCases':
      return <FontAwesome5 name="briefcase" size={20} color={color} />;
    case 'ClientInvoices':
      return <FontAwesome5 name="file-invoice-dollar" size={20} color={color} />;
    case 'ClientAppointments':
      return <FontAwesome5 name="calendar-alt" size={20} color={color} />;
    case 'ClientProfile':
      return <FontAwesome5 name="user" size={20} color={color} />;
    default:
      return null;
  }
}

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────

function ClientTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'function'
            ? options.tabBarLabel()
            : options.tabBarLabel || route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={styles.tabItem} activeOpacity={0.7}>
            {isFocused ? (
              <View style={styles.activeIconWrap}>
                <TabIcon routeName={route.name} focused={true} />
              </View>
            ) : (
              <TabIcon routeName={route.name} focused={false} />
            )}
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Client Navigator ────────────────────────────────────────────────────

export default function ClientNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <ClientTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="ClientHome"         component={HomeStack}         options={{ tabBarLabel: 'Home'         }} />
      <Tab.Screen name="ClientCases"        component={CasesStack}        options={{ tabBarLabel: 'Cases'        }} />
      <Tab.Screen name="ClientInvoices"     component={InvoicesStack}     options={{ tabBarLabel: 'Invoices'     }} />
      <Tab.Screen name="ClientAppointments" component={AppointmentsStack} options={{ tabBarLabel: 'Appointments' }} />
      <Tab.Screen name="ClientProfile"      component={ProfileStack}      options={{ tabBarLabel: 'Profile'      }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: GRAY_200,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  tabItem:        { flex: 1, alignItems: 'center', paddingVertical: 4 },
  activeIconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: BLUE_50, alignItems: 'center', justifyContent: 'center' },
  tabLabel:       { fontSize: 10, fontWeight: '500', color: GRAY_400, marginTop: 2 },
  tabLabelActive: { color: PRIMARY, fontWeight: '700' },
});
