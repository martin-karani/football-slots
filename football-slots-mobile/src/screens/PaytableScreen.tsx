import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { SYMBOLS, PaytableRow as PaytableRowType, formatMinor } from "../types";
import { gameApi } from "../api/client";
import { theme } from "../components/theme";
import { PaytableRow } from "../components/PaytableRow";
import { useGameStore } from "../store/GameProvider";
import { useAppNavigation, useGoBack } from "../navigation/types";

export function PaytableScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const goBack = useGoBack();
  const [rows, setRows] = useState<PaytableRowType[]>([]);
  const balances = useGameStore((state) => state.balances);
  const currency = useGameStore((state) => state.currency);
  const isReal = currency === "real";

  useEffect(() => {
    gameApi
      .paytable()
      .then((res) => setRows(res.data.symbols))
      .catch(() => setRows([]));
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5c0090" />

      {/* ── Marquee Header ── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#FFE566" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PAYTABLE & RULES</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Stats Strip ── */}
        <View style={styles.heroStrip}>
          <View style={[styles.heroCol, styles.heroColBorder]}>
            <Text style={styles.heroVal}>95.24%</Text>
            <Text style={styles.heroLbl}>RTP Rate</Text>
          </View>
          <View style={[styles.heroCol, styles.heroColBorder]}>
            <Text style={[styles.heroVal, { color: "#FFD700" }]}>×100</Text>
            <Text style={styles.heroLbl}>Max Win</Text>
          </View>
          <View style={styles.heroCol}>
            <Text style={[styles.heroVal, { color: "#22c55e" }]}>8</Text>
            <Text style={styles.heroLbl}>Clubs</Text>
          </View>
        </View>

        {/* ── Wallet Quick Access Strip ── */}
        <View style={styles.walletCard}>
          <View style={styles.walletLeft}>
            <Text style={styles.walletLabel}>
              {isReal ? "REAL BALANCE" : "DEMO BALANCE"}
            </Text>
            <Text style={styles.walletBalance}>
              {isReal ? "KES " : ""}
              {isReal
                ? formatMinor(balances.real, "real")
                : formatMinor(balances.virtual, "virtual")}
            </Text>
          </View>
          <View style={styles.walletActions}>
            <TouchableOpacity
              style={styles.walletDepositBtn}
              onPress={() => navigation.navigate("Wallet")}
              activeOpacity={0.8}
            >
              <Ionicons name="wallet-outline" size={14} color="#1a0033" />
              <Text style={styles.walletDepositTxt}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.walletPlayBtn}
              onPress={() => navigation.navigate("Game")}
              activeOpacity={0.8}
            >
              <Text style={styles.walletPlayTxt}>Play</Text>
              <Ionicons name="play" size={12} color="#FFD700" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tier Legend ── */}
        <View style={styles.tierRow}>
          <View style={[styles.tierPill, { backgroundColor: "rgba(255, 255, 255, 0.08)" }]}>
            <Text style={[styles.tierPillText, { color: "rgba(255, 255, 255, 0.6)" }]}>COMMON ×5</Text>
          </View>
          <View style={[styles.tierPill, { backgroundColor: "rgba(76, 141, 255, 0.18)" }]}>
            <Text style={[styles.tierPillText, { color: "#4c8dff" }]}>MID ×10</Text>
          </View>
          <View style={[styles.tierPill, { backgroundColor: "rgba(168, 85, 247, 0.18)" }]}>
            <Text style={[styles.tierPillText, { color: "#a855f7" }]}>RARE ×25</Text>
          </View>
          <View style={[styles.tierPill, { backgroundColor: "rgba(255, 215, 0, 0.18)" }]}>
            <Text style={[styles.tierPillText, { color: "#FFD700" }]}>JACKPOT ×100</Text>
          </View>
        </View>

        {/* ── Symbols & Multipliers ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy-outline" size={16} color="#FFD700" />
            <Text style={styles.sectionTitle}>Club Multipliers & Hit Probabilities</Text>
          </View>

          {SYMBOLS.map((sym) => {
            const row = rows.find((r) => r.symbol === sym.key);
            const multiplier = row ? row.multiplier : sym.multiplier;
            const probability = row ? (row.probability * 100).toFixed(2) : null;
            return (
              <PaytableRow
                key={sym.key}
                name={sym.name}
                tier={sym.tier.toUpperCase()}
                probability={probability ? `${probability}%` : "—"}
                multiplier={multiplier}
                color={sym.color}
                icon={sym.icon}
              />
            );
          })}
        </View>

        {/* ── How to Play ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="football-outline" size={16} color="#FFE566" />
            <Text style={styles.sectionTitle}>How to Play</Text>
          </View>
          {[
            "Select your bet chip value (KES 10, 20, 50, 100, 200, 500, 1000).",
            "Tap on one or multiple club logos on the shelf below the wheel to place bets.",
            "Press the gold GO button to spin the 24-slot multiplier wheel.",
            "If the wheel stops on your chosen club, you win Stake × Multiplier instantly.",
            "Tap a placed bet again or long-press to remove your chip.",
          ].map((rule, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot}>
                <Text style={styles.bulletIndex}>{i + 1}</Text>
              </View>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* ── Tips & Strategies ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb-outline" size={16} color="#FFD700" />
            <Text style={styles.sectionTitle}>Winning Tips</Text>
          </View>
          {[
            "Spread your bets across multiple clubs to maximize hit frequency.",
            "Common clubs (Barca, Real, City, Liverpool) hit 19% each with ×5 payout.",
            "The UCL Trophy jackpot (×100) hits ~0.95% of the time.",
            "Play responsibly. Check your bet history to track performance.",
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipIcon}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* ── Provably Fair ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#22c55e" />
            <Text style={styles.sectionTitle}>Provably Fair System</Text>
          </View>
          <Text style={styles.pfDesc}>
            Every spin outcome is generated deterministically using HMAC-SHA256
            cryptographic hashing. The hash combines our unrevealed Server Seed,
            your Client Seed, and an incremental Nonce.
          </Text>
          <View style={styles.pfBadgeRow}>
            <View style={styles.pfBadge}>
              <Ionicons name="lock-closed-outline" size={12} color="#22c55e" />
              <Text style={styles.pfBadgeTxt}>HMAC-SHA256</Text>
            </View>
            <View style={styles.pfBadge}>
              <Ionicons name="checkmark-circle-outline" size={12} color="#22c55e" />
              <Text style={styles.pfBadgeTxt}>Auditable Nonces</Text>
            </View>
            <View style={styles.pfBadge}>
              <Ionicons name="ribbon-outline" size={12} color="#22c55e" />
              <Text style={styles.pfBadgeTxt}>BCLB Certified</Text>
            </View>
          </View>
        </View>

        <Text style={styles.versionText}>
          Football Slots · RNG Engine v2.4 · All rights reserved
        </Text>
      </ScrollView>
    </View>
  );
}

const { fonts } = theme;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#2a0048",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#5c0090",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: "#8b5a2b",
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 100,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.marquee,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSpacer: {
    width: 38,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },

  /* ── Hero stats strip ── */
  heroStrip: {
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: "#220538",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
    overflow: "hidden",
    marginBottom: 12,
  },
  heroCol: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heroColBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 215, 0, 0.15)",
  },
  heroVal: {
    fontFamily: fonts.numbers,
    fontWeight: "700",
    fontSize: 18,
    color: "#FFFFFF",
  },
  heroLbl: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 2,
  },

  /* ── Wallet Card ── */
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#220538",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    padding: 14,
    marginBottom: 12,
  },
  walletLeft: {
    flex: 1,
  },
  walletLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: "rgba(255, 255, 255, 0.45)",
  },
  walletBalance: {
    fontFamily: fonts.numbers,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFD700",
    marginTop: 2,
  },
  walletActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walletDepositBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFD700",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  walletDepositTxt: {
    fontFamily: fonts.button,
    fontWeight: "800",
    fontSize: 12,
    color: "#1a0033",
  },
  walletPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  walletPlayTxt: {
    fontFamily: fonts.button,
    fontWeight: "700",
    fontSize: 12,
    color: "#FFD700",
  },

  /* ── Tier Legend ── */
  tierRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  tierPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tierPillText: {
    fontFamily: fonts.button,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.5,
  },

  /* ── Section Cards ── */
  sectionCard: {
    backgroundColor: "#220538",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    padding: 14,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  /* ── How to play list ── */
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  bulletIndex: {
    fontFamily: fonts.numbers,
    fontSize: 10,
    fontWeight: "700",
    color: "#FFD700",
  },
  ruleText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 18,
  },

  /* ── Tips ── */
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 7,
  },
  tipIcon: {
    color: "#FFD700",
    fontSize: 14,
    lineHeight: 18,
  },
  tipText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 18,
  },

  /* ── Provably Fair ── */
  pfDesc: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 0.65)",
    lineHeight: 18,
    marginBottom: 10,
  },
  pfBadgeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  pfBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  pfBadgeTxt: {
    fontFamily: fonts.button,
    fontSize: 10,
    fontWeight: "600",
    color: "#22c55e",
  },

  versionText: {
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.3)",
    marginTop: 8,
    marginBottom: 10,
  },
});
