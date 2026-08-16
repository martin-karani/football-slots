import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

interface BottomNavigationProps {
  tabBarProps: any; // always provided by Tab.Navigator's tabBar prop
}

const NAV_ITEMS = [
  { name: "Home", icon: "home-outline" as const, activeIcon: "home" as const, label: "Home" },
  { name: "WalletTab", icon: "wallet-outline" as const, activeIcon: "wallet" as const, label: "Wallet" },
  { name: "Game", icon: null, activeIcon: null, label: "PLAY", special: true },
  { name: "Activity", icon: "time-outline" as const, activeIcon: "time" as const, label: "Activity" },
  { name: "SettingsTab", icon: "person-outline" as const, activeIcon: "person" as const, label: "Profile" },
];

/**
 * Custom bottom navigation bar.
 * Always receives tabBarProps from Tab.Navigator so no extra hooks needed.
 * Hidden on the Game tab (the slot machine screen).
 */
export function BottomNavigation({ tabBarProps }: BottomNavigationProps) {
  const { state, navigation } = tabBarProps;
  const currentRoute = state.routes[state.index]?.name;

  // Hide on the game (slot machine) screen
  if (currentRoute === "Game") return null;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {NAV_ITEMS.map((item) => {
          const isActive = currentRoute === item.name;

          if (item.special) {
            return (
              <TouchableOpacity
                key={item.name}
                style={styles.playWrapper}
                onPress={() => navigation.navigate(item.name)}
                activeOpacity={0.85}
              >
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={22} color="#070A12" />
                </View>
                <Text style={styles.playLabel}>{item.label}</Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={item.name}
              style={styles.navItem}
              onPress={() => navigation.navigate(item.name)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? (item.activeIcon as any) : (item.icon as any)}
                size={22}
                color={isActive ? theme.colors.gold : theme.colors.textDim}
              />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const { colors, fonts } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,208,0.12)",
    // Safe-area padding is handled by Tab.Navigator on iOS
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },

  /* Regular tab item */
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  navLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textDim,
    marginTop: 4,
  },
  navLabelActive: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
  },

  /* PLAY (center) button */
  playWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    paddingHorizontal: 8,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  playLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.gold,
    fontWeight: "700",
    marginTop: 5,
    letterSpacing: 0.8,
  },
});
