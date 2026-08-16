import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  Animated,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useWallet } from "../hooks/useWallet";
import { authStorage } from "../api/client";
import { useState, useRef, useEffect } from "react";
import { theme } from "../components/theme";
import { SettingsRow } from "../components/SettingsRow";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Animated toggle switch */
function ToggleSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const knobTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 23],
  });
  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.08)", "#7a00b8"],
  });

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => onValueChange(!value)}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: bgColor as any }]}>
        <Animated.View
          style={[styles.toggleKnob, { transform: [{ translateX: knobTranslate }] }]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const currency = useGameStore((state) => state.currency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const phoneNumber = useGameStore((state) => state.phoneNumber);
  const soundEnabled = useGameStore((state) => state.soundEnabled);
  const setSoundEnabled = useGameStore((state) => state.setSoundEnabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const kycStatus = useGameStore((state) => state.kycStatus);
  const { topupVirtual } = useWallet();

  const isReal = currency === "real" || currency === "bonus";

  // Derive initials from phone number for avatar
  const initials = phoneNumber
    ? phoneNumber.replace(/\D/g, "").slice(-4, -2)
    : "KE";

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await authStorage.clearToken();
          clearAuth();
        },
      },
    ]);
  };

  const kycBadgeStyle =
    kycStatus === "verified"
      ? { bg: "rgba(34,197,94,0.18)", fg: "#22c55e", label: "VERIFIED" }
      : kycStatus === "pending"
      ? { bg: "rgba(255,215,0,0.14)", fg: "#FFD700", label: "PENDING" }
      : { bg: "rgba(255,102,102,0.14)", fg: "#ff6666", label: "UNVERIFIED" };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5c0090" />

      {/* ── Marquee Header ── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Game"))}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROFILE</Text>
        <View style={styles.backBtn} />{/* spacer to centre title */}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar / Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            {kycStatus === "verified" && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={11} color="#fff" />
              </View>
            )}
          </View>

          <View style={styles.profileMeta}>
            <Text style={styles.profilePhone}>{phoneNumber || "—"}</Text>
            <Text style={styles.profileSub}>Football Slots Player</Text>
            <View style={[styles.kycPill, { backgroundColor: kycBadgeStyle.bg }]}>
              <Text style={[styles.kycPillText, { color: kycBadgeStyle.fg }]}>
                {kycBadgeStyle.label}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Quick Actions / Wallet ── */}
        <Text style={styles.sectionTitle}>Wallet &amp; Activity</Text>
        <View style={styles.menuGroup}>
          <SettingsRow
            icon="wallet-outline"
            label="Wallet"
            onPress={() => navigation.navigate("Wallet" as never)}
          />
          <SettingsRow
            icon="receipt-outline"
            label="Transactions"
            onPress={() => navigation.navigate("Transactions" as never)}
          />
          {!isReal && (
            <SettingsRow
              icon="refresh-outline"
              label="Free DEMO Refill"
              onPress={topupVirtual}
            />
          )}
        </View>

        {/* ── Game links ── */}
        <Text style={styles.sectionTitle}>Game</Text>
        <View style={styles.menuGroup}>
          <SettingsRow
            icon="time-outline"
            label="Bet History"
            onPress={() => navigation.navigate("History" as never)}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="Rules & Paytable"
            onPress={() => navigation.navigate("Paytable" as never)}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Provably Fair"
            onPress={() =>
              Alert.alert(
                "Provably Fair",
                "Each spin uses HMAC-SHA256 with your client seed + our server seed. Results are independently verifiable."
              )
            }
          />
        </View>

        {/* ── Preferences ── */}
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.menuGroup}>
          <View style={styles.prefRow}>
            <View style={styles.prefRowLeft}>
              <View style={styles.prefIcon}>
                <Ionicons
                  name={soundEnabled ? "volume-high-outline" : "volume-mute-outline"}
                  size={18}
                  color="#FFE566"
                />
              </View>
              <Text style={styles.prefLabel}>Sounds & Haptics</Text>
            </View>
            <ToggleSwitch value={soundEnabled} onValueChange={setSoundEnabled} />
          </View>

          <View style={[styles.prefRow, styles.prefRowBorder]}>
            <View style={styles.prefRowLeft}>
              <View style={styles.prefIcon}>
                <Ionicons
                  name={notificationsEnabled ? "notifications-outline" : "notifications-off-outline"}
                  size={18}
                  color="#FFE566"
                />
              </View>
              <Text style={styles.prefLabel}>Notifications</Text>
            </View>
            <ToggleSwitch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
          </View>
        </View>

        {/* ── Danger zone ── */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menuGroup}>
          <SettingsRow
            icon="log-out-outline"
            label="Log Out"
            onPress={handleLogout}
            danger
            showChevron={false}
          />
        </View>

        <Text style={styles.version}>Football Slots v1.0 · Provably Fair RNG · BCLB Licensed</Text>
      </ScrollView>
    </View>
  );
}

const { fonts } = theme;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#2a0048" },
  scroll: { flex: 1 },
  content: { paddingBottom: 52 },

  /* ── Marquee Header ── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#5c0090",
    paddingHorizontal: 12,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: "#8b5a2b",
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.marquee,
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 2,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  /* ── Profile card ── */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginHorizontal: 14,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: "#220538",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.25)",
  },
  avatarOuter: {
    position: "relative",
    width: 60,
    height: 60,
  },
  avatarInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(122,0,184,0.35)",
    borderWidth: 2,
    borderColor: "rgba(255,215,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    fontFamily: fonts.numbers,
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "700",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#220538",
    justifyContent: "center",
    alignItems: "center",
  },
  profileMeta: { flex: 1, gap: 4 },
  profilePhone: {
    fontFamily: fonts.numbersRegular,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  profileSub: {
    fontFamily: fonts.body,
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  kycPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  kycPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
    fontWeight: "700",
  },

  /* ── Balance panel ── */
  balancePanel: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  balancePanelReal: {
    backgroundColor: "rgba(255,215,0,0.10)",
    borderColor: "rgba(255,215,0,0.35)",
  },
  balancePanelDemo: {
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: "rgba(34,197,94,0.35)",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balancePanelLabel: {
    fontFamily: fonts.button,
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  balancePanelAmount: {
    fontFamily: fonts.numbers,
    fontSize: 30,
  },
  amountReal: { color: "#FFD700" },
  amountDemo: { color: "#22c55e" },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  modePillReal: { backgroundColor: "rgba(255,215,0,0.15)", borderWidth: 1, borderColor: "rgba(255,215,0,0.4)" },
  modePillDemo: { backgroundColor: "rgba(34,197,94,0.15)", borderWidth: 1, borderColor: "rgba(34,197,94,0.4)" },
  modePillText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, fontWeight: "700" },
  modePillTextReal: { color: "#FFD700" },
  modePillTextDemo: { color: "#22c55e" },

  bonusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  bonusRowLabel: {
    fontFamily: fonts.body,
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    flex: 1,
  },
  bonusRowValue: {
    fontFamily: fonts.numbers,
    color: "#a855f7",
    fontSize: 13,
  },

  /* ── Section ── */
  sectionTitle: {
    fontFamily: fonts.button,
    color: "#D0B0FF",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  menuGroup: {
    marginHorizontal: 14,
    backgroundColor: "#220538",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.2)",
    overflow: "hidden",
  },

  /* ── Preferences row ── */
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  prefRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 215, 0, 0.1)",
  },
  prefRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  prefIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  prefLabel: {
    fontFamily: fonts.bodyMedium,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  prefSub: {
    fontFamily: fonts.body,
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginTop: 1,
  },

  /* ── Animated toggle ── */
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
  },
  toggleKnob: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },

  version: {
    fontFamily: fonts.body,
    textAlign: "center",
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    marginTop: 24,
    marginBottom: 8,
  },
});
