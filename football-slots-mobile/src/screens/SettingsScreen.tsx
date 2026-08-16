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
import { formatMinor } from "../types";
import { theme } from "../components/theme";
import { SettingsRow } from "../components/SettingsRow";
import { Ionicons } from "@react-native-vector-icons/ionicons";

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
    outputRange: [theme.colors.glassMedium, theme.colors.blue],
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
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const clearAuth = useGameStore((state) => state.clearAuth);
  const phoneNumber = useGameStore((state) => state.phoneNumber);
  const soundEnabled = useGameStore((state) => state.soundEnabled);
  const setSoundEnabled = useGameStore((state) => state.setSoundEnabled);
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
      ? { bg: theme.colors.successBg, fg: theme.colors.success, label: "VERIFIED" }
      : kycStatus === "pending"
      ? { bg: theme.colors.warningBg, fg: theme.colors.warning, label: "PENDING" }
      : { bg: theme.colors.errorBg, fg: theme.colors.error, label: "UNVERIFIED" };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.surface} />

      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar / Profile card ── */}
        <View style={styles.profileCard}>
          {/* Gradient-style avatar circle */}
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            {/* Verified tick */}
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

        {/* ── Balance panel ── */}
        <View
          style={[
            styles.balancePanel,
            isReal ? styles.balancePanelReal : styles.balancePanelDemo,
          ]}
        >
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balancePanelLabel}>
                {isReal ? "REAL BALANCE · KES" : "DEMO CREDITS"}
              </Text>
              <Text
                style={[
                  styles.balancePanelAmount,
                  isReal ? styles.amountReal : styles.amountDemo,
                ]}
              >
                {isReal
                  ? formatMinor(balances.real, "real")
                  : formatMinor(balances.virtual, "virtual")}
              </Text>
            </View>
            <View
              style={[
                styles.modePill,
                isReal ? styles.modePillReal : styles.modePillDemo,
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  isReal ? styles.modePillTextReal : styles.modePillTextDemo,
                ]}
              >
                {isReal ? "REAL" : "DEMO"}
              </Text>
            </View>
          </View>

          {balances.bonus > 0 && (
            <View style={styles.bonusRow}>
              <Ionicons name="gift-outline" size={13} color={theme.colors.bonusAccent} />
              <Text style={styles.bonusRowLabel}>Bonus Credits</Text>
              <Text style={styles.bonusRowValue}>
                {formatMinor(balances.bonus, "bonus")}
              </Text>
            </View>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.menuGroup}>
          {isReal ? (
            <>
              <SettingsRow
                icon="card-outline"
                label="Deposit via M-Pesa"
                sublabel="Add real money to your account"
                onPress={() => navigation.navigate("Main" as never, { screen: "WalletTab" } as never)}
              />
              <SettingsRow
                icon="arrow-up-circle-outline"
                label="Withdraw Winnings"
                sublabel="Send your balance to M-Pesa"
                onPress={() => navigation.navigate("Main" as never, { screen: "WalletTab" } as never)}
              />
            </>
          ) : (
            <SettingsRow
              icon="refresh-outline"
              label="Free DEMO Refill"
              sublabel="Get 1,000 free DEMO credits instantly"
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
            sublabel="View your past spins and results"
            onPress={() => navigation.navigate("Main" as never, { screen: "Activity" } as never)}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="Rules & Paytable"
            sublabel="Learn how to play"
            onPress={() =>
              Alert.alert("Coming Soon", "Rules & Paytable will be available soon.")
            }
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Provably Fair"
            sublabel="Verify every spin is genuinely random"
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
                  size={17}
                  color={theme.colors.textSecondary}
                />
              </View>
              <View>
                <Text style={styles.prefLabel}>Sound Effects</Text>
                <Text style={styles.prefSub}>
                  {soundEnabled ? "Sounds are on" : "Sounds are off"}
                </Text>
              </View>
            </View>
            <ToggleSwitch value={soundEnabled} onValueChange={setSoundEnabled} />
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

const { colors, radius, spacing, fonts } = theme;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 52 },

  /* Page header */
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: 56,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    color: colors.textPrimary,
    fontSize: 22,
    letterSpacing: 0.5,
  },

  /* Profile card */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
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
    backgroundColor: "rgba(76,141,255,0.22)",
    borderWidth: 2,
    borderColor: colors.blue + "66",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    fontFamily: fonts.numbers,
    color: colors.blue,
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
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  profileMeta: { flex: 1, gap: 4 },
  profilePhone: {
    fontFamily: fonts.numbersRegular,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  profileSub: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
  },
  kycPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginTop: 2,
  },
  kycPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
    fontWeight: "700",
  },

  /* Balance panel */
  balancePanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  balancePanelReal: {
    backgroundColor: colors.realLight,
    borderColor: colors.realBorder,
  },
  balancePanelDemo: {
    backgroundColor: colors.demoLight,
    borderColor: colors.demoBorder,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balancePanelLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.textDim,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  balancePanelAmount: {
    fontFamily: fonts.numbers,
    fontSize: 30,
  },
  amountReal: { color: colors.gold },
  amountDemo: { color: colors.success },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  modePillReal: { backgroundColor: colors.realLight, borderWidth: 1, borderColor: colors.realBorder },
  modePillDemo: { backgroundColor: colors.demoLight, borderWidth: 1, borderColor: colors.demoBorder },
  modePillText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, fontWeight: "700" },
  modePillTextReal: { color: colors.gold },
  modePillTextDemo: { color: colors.success },

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
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  bonusRowValue: {
    fontFamily: fonts.numbers,
    color: colors.bonusAccent,
    fontSize: 13,
  },

  /* Section */
  sectionTitle: {
    fontFamily: fonts.bodyMedium,
    color: colors.textDim,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: 8,
  },
  menuGroup: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    overflow: "hidden",
  },

  /* Preferences row */
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
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
    backgroundColor: colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
  },
  prefLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  prefSub: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },

  /* Animated toggle */
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
    color: colors.textDim,
    fontSize: 10,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
