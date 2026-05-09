import React from "react";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import Entypo from "@expo/vector-icons/Entypo";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  ActivityIndicator,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import AuthScreen     from "../screens/AuthScreen";
import HomeScreen     from "../screens/HomeScreen";
import CaseManagement from "../screens/Cases/CaseManagement";
import CalendarScreen from "../screens/Calender/CalendarScreen";
import ProfileScreen  from "../screens/Profile/ProfileScreen";
import QuickAddScreen from "../screens/QuickAddScreen";
import ClientNavigator from "./ClientNavigator";

const Tab = createBottomTabNavigator();

const PRIMARY  = "#1E40AF";
const BLUE_50  = "#EFF6FF";
const GRAY_200 = "#E5E7EB";
const GRAY_400 = "#9CA3AF";

export default function AppNavigator() {
  const { user, loading } = useAuth();

  // Splash while restoring token from storage
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  // Not authenticated → show auth screen
  if (!user) {
    return <AuthScreen />;
  }

  // CLIENT → espace portail client dédié
  if (user.role === "CLIENT") {
    return (
      <NavigationContainer>
        <ClientNavigator />
      </NavigationContainer>
    );
  }

  // LAWYER / FIRM_ADMIN → tab navigator complet
  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarLabel: "Home"     }} />
        <Tab.Screen name="Cases"    component={CaseManagement} options={{ tabBarLabel: "Cases"    }} />
        <Tab.Screen name="Add"      component={QuickAddScreen} options={{ tabBarButton: () => null }} />
        <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: "Calendar" }} />
        <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ tabBarLabel: "Profile"  }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ─── Tab icons ────────────────────────────────────────────────────────────
function TabIcon({ routeName, focused }) {
  const color = focused ? PRIMARY : GRAY_400;
  switch (routeName) {
    case "Home":
      return <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />;
    case "Cases":
      return <FontAwesome5 name="briefcase" size={22} color={color} />;
    case "Calendar":
      return <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />;
    case "Profile":
      return <FontAwesome5 name="user" size={22} color={color} />;
    default:
      return null;
  }
}

// ─── Custom tab bar ───────────────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        // FAB centre button
        if (route.name === "Add") {
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.fabWrapper}
              onPress={() => navigation.navigate("Add")}
              activeOpacity={0.85}
            >
              <View style={styles.fab}>
                <Entypo name="plus" size={30} color="white" />
              </View>
            </TouchableOpacity>
          );
        }

        const label =
          typeof options.tabBarLabel === "function"
            ? options.tabBarLabel()
            : options.tabBarLabel || route.name;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
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

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: GRAY_200,
    paddingVertical: 8,
    paddingHorizontal: 8,
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  tabItem:        { flex: 1, alignItems: "center", paddingVertical: 4 },
  activeIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: BLUE_50, alignItems: "center", justifyContent: "center" },
  tabLabel:       { fontSize: 11, fontWeight: "500", color: GRAY_400, marginTop: 2 },
  tabLabelActive: { color: PRIMARY, fontWeight: "700" },
  fabWrapper:     { flex: 1, alignItems: "center", marginTop: -24 },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: PRIMARY,
    justifyContent: "center", alignItems: "center",
    ...Platform.select({
      ios:     { shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
});
