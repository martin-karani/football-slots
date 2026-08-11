import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useGame } from "../hooks/useGame";
import { useWallet } from "../hooks/useWallet";
import { WheelDisplay } from "../components/WheelDisplay";
import { PaytableModal } from "../components/PaytableModal";
import { WinCelebration } from "../components/WinCelebration";
import { authStorage } from "../api/client";
import {
  SYMBOLS,
  CHIP_VALUES,
  CurrencyType,
  toMinor,
  fromMinor,
  formatMinor,
  currencyLabel,
} from "../types";
import { useSound } from "../hooks/useSound";

// ─────────────────────────────────────────────────────────────────────────────
//  "ARCADE MACHINE" THEME
//  Inspired by the Fruit Slots reference: vibrant cherry-red body, thick brass
//  gold trim, rich purple header, bright warm colours throughout.
//  Every panel has 3D beveled edges (light top-left, dark bottom-right).
// ─────────────────────────────────────────────────────────────────────────────

export function GameScreen() {
  const isSpinning = useGameStore((s) => s.isSpinning);
  const lastSpin = useGameStore((s) => s.lastSpin);
  const currency = useGameStore((s) => s.currency);
  const setCurrency = useGameStore((s) => s.setCurrency);
  const clearBets = useGameStore((s) => s.clearBets);
  const totalStake = useGameStore((s) => s.getTotalStake());
  const balances = useGameStore((s) => s.balances);
  const currentBets = useGameStore((s) => s.currentBets);
  const selectedChip = useGameStore((s) => s.selectedChip);
  const setSelected = useGameStore((s) => s.setSelectedChip);
  const placeBet = useGameStore((s) => s.placeBet);
  const removeBet = useGameStore((s) => s.removeBet);
  const clearAuth = useGameStore((s) => s.clearAuth);
  const [showPaytable, setShowPaytable] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);

  const { spin, step } = useGame();
  const { fetchBalance } = useWallet();
  const { play: playSound } = useSound();
  const navigation = useNavigation<any>();

  useEffect(() => {
    fetchBalance();
  }, [currency]);

  const winAmount = lastSpin?.is_win ? lastSpin.gross_payout : 0;

  // Trigger celebration on new win
  useEffect(() => {
    if (lastSpin?.is_win && lastSpin.gross_payout > 0) {
      setShowCelebration(true);
    }
  }, [lastSpin?.round_id]);
  const balanceMinor = balances[currency];
  const isReal = currency === "real";
  const totalStakeDisplay = fromMinor(totalStake, currency);
  const winAmountDisplay = fromMinor(winAmount, currency);

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor="#3a0060" />

      {/* ══════════════════════════════════════════════════════════════════
          OUTER MACHINE BODY — cherry-red with thick brass gold border
       ══════════════════════════════════════════════════════════════════ */}
      <View style={st.machine}>
        {/* ═══════════════════════════════════════════════════════════
            HEADER — rich purple marquee bar
         ═══════════════════════════════════════════════════════════ */}
        <View style={st.header}>
          <Text style={st.headerTxt}>FOOTBALL SLOTS</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={st.menuBtn}
              onPress={() => setShowPaytable(true)}
            >
              <Text style={st.menuBtnTxt}>?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.menuBtn}
              onPress={() => setShowDropdownMenu(!showDropdownMenu)}
            >
              <Text style={st.menuBtnTxt}>≡</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            BALANCE BAR — dynamic mode differentiation
         ═══════════════════════════════════════════════════════════ */}
        <View style={[st.balBar, isReal ? st.balBarReal : st.balBarFun]}>
          <View style={st.balLeft}>
            <Text style={st.balCoin}>{isReal ? "💰" : "🎮"}</Text>
            <Text style={[st.balNum, isReal ? st.balNumReal : st.balNumFun]}>
              {formatMinor(balanceMinor, currency)}
            </Text>
            <Text style={[st.balCurr, isReal ? st.balCurrReal : st.balCurrFun]}>
              {currencyLabel(currency)}
            </Text>
          </View>

          <TouchableOpacity
            style={st.modeBadgePill}
            onPress={() => setShowDropdownMenu(true)}
            activeOpacity={0.8}
          >
            <Text style={st.modeBadgeTxt}>
              {isReal ? "💰 REAL MODE ▾" : "🎮 FUN MODE ▾"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            SLOT WHEEL BOARD
         ═══════════════════════════════════════════════════════════ */}
        <View style={st.wheelWrapper}>
          {/* Side brass light-rail pillars — only beside wheel */}
          <View style={st.railL} pointerEvents="none">
            {[...Array(8)].map((_, i) => (
              <View key={i} style={st.railDot} />
            ))}
          </View>
          <View style={st.railR} pointerEvents="none">
            {[...Array(8)].map((_, i) => (
              <View key={i} style={st.railDot} />
            ))}
          </View>
          <WheelDisplay step={step} isSpinning={isSpinning} isReal={isReal} />
        </View>

        {/* ═══════════════════════════════════════════════════════════
            CONTROL DECK — darker red machine bottom
         ═══════════════════════════════════════════════════════════ */}
        <View style={st.deck}>
          {/* ── ROW 1: INFO BAR (WIN / STAKE / GIFT) ───────────────── */}
          <View style={st.infoBar}>
            <View style={st.infoPiece}>
              <View style={st.winBadge}>
                <Text style={st.winBadgeTxt}>WIN</Text>
              </View>
              <Text style={st.infoVal}>{winAmountDisplay}</Text>
            </View>

            <View style={st.infoPiece}>
              <Text style={st.infoLabel}>Stake</Text>
              <Text style={st.infoVal}>{totalStakeDisplay}</Text>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity style={st.giftPill}>
              <Text style={st.giftTxt}>🎟 Gift</Text>
              <Text style={st.giftVal}>KSH 600 ›</Text>
            </TouchableOpacity>
          </View>

          {/* ── ROW 2: GO + CLEAR SHELF (CLEAR LEFT, METALLIC GO RIGHT) ── */}
          <View style={st.goShelf}>
            <TouchableOpacity
              style={st.clearBtn}
              onPress={clearBets}
              activeOpacity={0.7}
            >
              <Text style={st.clearTxt}>CLEAR</Text>
            </TouchableOpacity>

            {/* GO button in metallic 3D platform socket */}
            <View style={st.goPlatformSocket}>
              <TouchableOpacity
                style={[
                  st.goBtnBase,
                  isReal ? st.goBtnReal : st.goBtnFun,
                  (isSpinning || totalStake === 0) && st.goBtnOff,
                ]}
                onPress={spin}
                disabled={isSpinning || totalStake === 0}
                activeOpacity={0.8}
              >
                <Text style={st.goLabel}>{isSpinning ? "⏳" : "GO"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3D HORIZONTAL CLIFF LEDGE STEP (WITH RIVETS) ──────── */}
          <View style={st.cliffLedgeDivider}>
            <View style={st.rivetDotL} />
            <View style={st.rivetDotR} />
          </View>

          {/* -- ROW 3: CHIP SELECTORS SHELF -- */}
          <View style={st.chipShelf}>
            <View style={st.chipRow}>
              {CHIP_VALUES.slice()
                .reverse()
                .map((v, idx) => {
                  const isOn = selectedChip === v;
                  return (
                    <TouchableOpacity
                      key={`${v}-${idx}`}
                      style={[st.chip, isOn && st.chipOn]}
                      onPress={() => {
                        if (isOn) {
                          setSelected(0);
                          clearBets();
                        } else {
                          setSelected(v);
                        }
                      }}
                      activeOpacity={1}
                    >
                      <View style={[st.chipInnerRing, isOn && st.chipInnerRingOn]} />
                      <Text style={[st.chipTxt, isOn && st.chipTxtOn]}>{v}</Text>
                      {isOn && <View style={st.chipDot} />}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>

          {/* ── SHELF: CLUB LOGOS (deepest/darkest shelf) ──────────── */}
          <View style={st.clubShelf}>
            {SYMBOLS.map((sym) => {
              const betMinor = currentBets[sym.key] || 0;
              const betDisplay = fromMinor(betMinor, currency);
              const hasBet = betMinor > 0;
              return (
                <TouchableOpacity
                  key={sym.key}
                  style={[st.clubCard, hasBet && st.clubCardOn]}
                  onPress={() => {
                    if (hasBet) {
                      // Tapping a selected club unselects it automatically
                      removeBet(sym.key, betMinor);
                      playSound("bet_remove");
                    } else {
                      // Tapping an unselected club selects it with active stake chip (defaults to 10 if 0)
                      const chipToUse = selectedChip > 0 ? selectedChip : 10;
                      if (selectedChip === 0) {
                        setSelected(10);
                      }
                      placeBet(sym.key, toMinor(chipToUse, currency));
                      playSound("bet_place");
                    }
                  }}
                  onLongPress={() => {
                    if (hasBet) {
                      removeBet(sym.key, betMinor);
                      playSound("bet_remove");
                    }
                  }}
                  activeOpacity={0.75}
                >
                  {/* Warm top-left light bevel */}
                  <View pointerEvents="none" style={st.clubTiltHi} />
                  {/* Dark bottom-right shadow bevel */}
                  <View pointerEvents="none" style={st.clubTiltLo} />

                  {/* Gold active top bar indicator */}
                  {hasBet && (
                    <View pointerEvents="none" style={st.clubActiveBar} />
                  )}

                  {sym.icon && <sym.icon width={28} height={28} />}
                  <Text style={[st.clubBet, hasBet && st.clubBetOn]}>
                    {hasBet ? betDisplay : "00"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <PaytableModal
        visible={showPaytable}
        onClose={() => setShowPaytable(false)}
      />
      <WinCelebration
        visible={showCelebration}
        winAmountMinor={lastSpin?.gross_payout || 0}
        stakeMinor={lastSpin?.total_stake || 0}
        symbol={lastSpin?.symbol_display || ""}
        multiplier={lastSpin?.multiplier || 0}
        currency={currency}
        onDone={() => setShowCelebration(false)}
      />

      {/* ── Settings Dropdown Modal ── */}
      <Modal
        visible={showDropdownMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdownMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDropdownMenu(false)}>
          <View style={st.dropdownOverlay}>
            <TouchableWithoutFeedback>
              <View style={st.dropdownCard}>
                {/* Active Mode Banner */}
                <View style={[st.dropdownModeHeader, isReal ? st.dropdownModeHeaderReal : st.dropdownModeHeaderFun]}>
                  <Text style={st.dropdownModeBadge}>
                    {isReal ? "💰 REAL MODE ACTIVE" : "🎮 FUN MODE ACTIVE"}
                  </Text>
                  <Text style={st.dropdownModeSub}>
                    {isReal ? "Playing with M-Pesa KES" : "Free Play Credits"}
                  </Text>
                </View>

                {/* Switch Mode Action Item */}
                <TouchableOpacity
                  style={st.dropdownSwitchBtn}
                  onPress={() => {
                    setCurrency(isReal ? "virtual" : "real");
                    setShowDropdownMenu(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={st.dropdownSwitchTxt}>
                    {isReal ? "🎮  Switch to FUN Mode" : "💰  Switch to REAL Mode (KES)"}
                  </Text>
                </TouchableOpacity>

                <View style={st.dropdownDivider} />

                {/* Navigation Items */}
                <TouchableOpacity
                  style={st.dropdownItem}
                  onPress={() => {
                    setShowDropdownMenu(false);
                    navigation.navigate("Wallet");
                  }}
                >
                  <Text style={st.dropdownItemIcon}>👛</Text>
                  <Text style={st.dropdownItemTxt}>Wallet &amp; Deposit</Text>
                  <Text style={st.dropdownItemArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.dropdownItem}
                  onPress={() => {
                    setShowDropdownMenu(false);
                    navigation.navigate("History");
                  }}
                >
                  <Text style={st.dropdownItemIcon}>📜</Text>
                  <Text style={st.dropdownItemTxt}>Bet History</Text>
                  <Text style={st.dropdownItemArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.dropdownItem}
                  onPress={() => {
                    setShowDropdownMenu(false);
                    setShowPaytable(true);
                  }}
                >
                  <Text style={st.dropdownItemIcon}>📋</Text>
                  <Text style={st.dropdownItemTxt}>Rules &amp; Paytable</Text>
                  <Text style={st.dropdownItemArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.dropdownItem}
                  onPress={() => {
                    setShowDropdownMenu(false);
                    navigation.navigate("Settings");
                  }}
                >
                  <Text style={st.dropdownItemIcon}>⚙️</Text>
                  <Text style={st.dropdownItemTxt}>Profile &amp; Settings</Text>
                  <Text style={st.dropdownItemArrow}>›</Text>
                </TouchableOpacity>

                <View style={st.dropdownDivider} />

                <TouchableOpacity
                  style={[st.dropdownItem, st.dropdownLogoutItem]}
                  onPress={() => {
                    setShowDropdownMenu(false);
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
                  }}
                >
                  <Text style={st.dropdownItemIcon}>🚪</Text>
                  <Text style={[st.dropdownItemTxt, { color: "#ff6666" }]}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  // ── Root background (deep purple like Fruit Slots) ────────────────────────
  root: {
    flex: 1,
    backgroundColor: "#2a0048", // deep purple behind the machine
  },

  // ── Machine body — BRIGHT cherry-red, thick wood border ───────────────────
  machine: {
    flex: 1,
    backgroundColor: "#b01020",
    marginHorizontal: 3,
    marginVertical: 2,
    borderRadius: 16,
    borderWidth: 5,
    borderTopColor: "#a06030",
    borderLeftColor: "#a06030",
    borderBottomColor: "#5c3a21",
    borderRightColor: "#5c3a21",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 20,
    position: "relative",
  },

  // ── Wheel wrapper (anchors side-rails to wheel height only) ────────────
  wheelWrapper: {
    position: "relative",
    width: "100%",
  },

  // ── Side wood light-rails ────────────────────────────────────────────────
  railL: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: "#8a1020",
    borderRightWidth: 2,
    borderRightColor: "#8b5a2b",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    zIndex: 100,
  },
  railR: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: "#8a1020",
    borderLeftWidth: 2,
    borderLeftColor: "#8b5a2b",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    zIndex: 100,
  },
  railDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffe866",
    borderWidth: 1,
    borderColor: "#fff",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 5,
  },

  // ── Header — rich purple marquee ──────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#5c0090",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: "#8b5a2b",
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  headerTxt: {
    flex: 1,
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "#ffd700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#7a00b8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderTopColor: "#aa44ee",
    borderLeftColor: "#aa44ee",
    borderBottomColor: "#440066",
    borderRightColor: "#440066",
  },
  menuBtnTxt: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22,
  },

  // ── Balance bar — Dynamic ───────────────────────────────────────────
  balBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: "#f0c050",
  },
  balBarReal: {
    backgroundColor: "#901020",
  },
  balBarFun: {
    backgroundColor: "#400080",
  },
  balLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  balCoin: { fontSize: 16 },
  balNum: {
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: 0.5,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  balNumReal: {
    color: "#ffd700",
    textShadowColor: "#000",
  },
  balNumFun: {
    color: "#ffffff",
    textShadowColor: "#8800ff",
  },
  balCurr: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1,
  },
  balCurrReal: {
    color: "#ffcc80",
  },
  balCurrFun: {
    color: "#d0b0ff",
  },
  modePill: {
    flexDirection: "row",
    backgroundColor: "#700818",
    borderRadius: 20,
    padding: 2,
    borderWidth: 2,
    borderTopColor: "#cc3344",
    borderLeftColor: "#cc3344",
    borderBottomColor: "#440010",
    borderRightColor: "#440010",
    gap: 2,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 17,
  },
  modeBtnOnReal: {
    backgroundColor: "#ffd700",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  modeBtnOnFun: {
    backgroundColor: "#00ffff",
    shadowColor: "#00ffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  modeTxt: {
    color: "#ffaa88",
    fontWeight: "800",
    fontSize: 11,
  },
  modeTxtOnReal: {
    color: "#4a0008",
    fontWeight: "900",
  },
  modeTxtOnFun: {
    color: "#002244",
    fontWeight: "900",
  },

  // ── Control Deck — darker red machine bottom (STRONG 3D SHELF CASCADE) ──
  deck: {
    backgroundColor: "#8a1420",
    borderTopWidth: 6,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderTopColor: "#e85a3c",
    borderLeftColor: "#d04428",
    borderRightColor: "#3a0810",
    borderBottomColor: "#200306",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 14,
    position: "relative",
    paddingTop: 6,
    paddingBottom: 0,
    paddingHorizontal: 6,
  },
  watermarkContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
    opacity: 0.1,
  },
  watermarkTxt: {
    fontSize: 42,
    fontWeight: "900",
    transform: [{ rotate: "-10deg" }],
  },
  watermarkTxtReal: {
    color: "#fff",
  },
  watermarkTxtFun: {
    color: "#00ffff",
  },

  // ── Info Bar (WIN / STAKE / GIFT) — RECESSED DISH ────────────────────────
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3a020a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 3,
    borderTopColor: "#1a0104",
    borderLeftColor: "#200105",
    borderBottomColor: "#8a2a38",
    borderRightColor: "#702230",
    borderRadius: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 5,
  },
  infoPiece: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  winBadge: {
    backgroundColor: "#d6982b",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 2,
    borderTopColor: "#ffe480",
    borderLeftColor: "#ffd060",
    borderBottomColor: "#8a5a10",
    borderRightColor: "#a06a18",
    shadowColor: "#ffaa00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  winBadgeTxt: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 0.5, height: 0.5 },
  },
  infoLabel: {
    color: "#ffe8b0",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  infoVal: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  giftPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,200,50,0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderTopColor: "rgba(255,220,100,0.35)",
    borderLeftColor: "rgba(255,220,100,0.35)",
    borderBottomColor: "rgba(0,0,0,0.4)",
    borderRightColor: "rgba(0,0,0,0.4)",
  },
  giftTxt: {
    color: "#ffd678",
    fontWeight: "800",
    fontSize: 10,
  },
  giftVal: {
    color: "#ffe866",
    fontWeight: "800",
    fontSize: 10,
  },

  // ── GO + CLEAR shelf — RAISED PLATFORM 1 ────────────────────────────────
  goShelf: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#a01828",
    borderRadius: 10,
    borderWidth: 3,
    borderTopColor: "#ff5a3a",
    borderLeftColor: "#e03a1a",
    borderBottomColor: "#30040a",
    borderRightColor: "#400812",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 5,
    elevation: 8,
    marginBottom: 3,
  },
  clearBtn: {
    backgroundColor: "#e67e22",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 3,
    borderTopColor: "#ffcc44",
    borderLeftColor: "#ffaa33",
    borderBottomColor: "#8a3a00",
    borderRightColor: "#a04800",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.65,
    shadowRadius: 4,
    elevation: 8,
  },
  clearTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Right Metallic 3D Platform Socket for GO Button (HEAVY METAL TRAY)
  goPlatformSocket: {
    backgroundColor: "#707070",
    borderRadius: 10,
    padding: 3,
    borderWidth: 2,
    borderTopColor: "#f0f0f0",
    borderLeftColor: "#d0d0d0",
    borderBottomColor: "#202020",
    borderRightColor: "#2a2a2a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.75,
    shadowRadius: 5,
    elevation: 8,
  },
  goBtnBase: {
    borderRadius: 8,
    width: 100,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 12,
  },
  goBtnFun: {
    backgroundColor: "#e82020",
    borderTopColor: "#ff8888",
    borderLeftColor: "#ff6666",
    borderBottomColor: "#700000",
    borderRightColor: "#900000",
    shadowColor: "#ff0000",
  },
  goBtnReal: {
    backgroundColor: "#22a848",
    borderTopColor: "#66ff99",
    borderLeftColor: "#44ee77",
    borderBottomColor: "#0a5018",
    borderRightColor: "#0e6020",
    shadowColor: "#00ff33",
  },
  goBtnOff: { opacity: 0.4 },
  goLabel: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    lineHeight: 24,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  goSub: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
    marginTop: 1,
  },

  // ── 3D Horizontal Cliff Ledge Divider with Rivets (THICK STEP) ─────────
  cliffLedgeDivider: {
    height: 8,
    backgroundColor: "#b01828",
    borderTopWidth: 2,
    borderTopColor: "#ff7050",
    borderBottomWidth: 3,
    borderBottomColor: "#200205",
    position: "relative",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
    marginVertical: 1,
  },
  rivetDotL: {
    position: "absolute",
    left: 14,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d8a058",
    borderWidth: 1,
    borderTopColor: "#fff0c0",
    borderLeftColor: "#ffe0a0",
    borderBottomColor: "#805820",
    borderRightColor: "#90682a",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 1 },
  },
  rivetDotR: {
    position: "absolute",
    right: 14,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d8a058",
    borderWidth: 1,
    borderTopColor: "#fff0c0",
    borderLeftColor: "#ffe0a0",
    borderBottomColor: "#805820",
    borderRightColor: "#90682a",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 1 },
  },

  // ── Middle Shelf ──────────────────────────────────────────────────────────
  deckMiddleShelf: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#600814",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#3a060d",
  },

  // ── Chip shelf (stake input shelf - DEEP RECESSED TRAY) ──────────────────
  chipShelf: {
    backgroundColor: "#1e0208",
    borderRadius: 8,
    borderWidth: 2,
    borderTopColor: "#3a0810",
    borderLeftColor: "#300608",
    borderBottomColor: "#6a2818",
    borderRightColor: "#502010",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.55,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 0,
    paddingBottom: 6,
  },
  chipShelfLabel: {
    color: "rgba(255,200,100,0.4)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    textAlign: "center",
    paddingTop: 5,
    paddingBottom: 2,
  },
  chipRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 2,
    gap: 5,
    alignItems: "center",
    justifyContent: "space-between",
  },
  // ── Chip coin base ──
  chip: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    maxHeight: 42,
    borderRadius: 100,
    backgroundColor: "#1a0c02",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#3a2208",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.7,
    shadowRadius: 3,
    elevation: 3,
    overflow: "visible",
  },
  // ── Selected chip coin ──
  chipOn: {
    backgroundColor: "#7a4a00",
    borderColor: "#FFD700",
    borderWidth: 2,
    shadowColor: "#FFD700",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  // Subtle inner ring etched on coin face
  chipInnerRing: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,200,80,0.15)",
  },
  chipInnerRingOn: {
    borderColor: "rgba(255,220,80,0.55)",
  },
  // Gold dot indicator below active chip
  chipDot: {
    position: "absolute",
    bottom: -7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FFD700",
    shadowColor: "#FFD700",
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  chipTxt: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  chipTxtOn: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.2,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  // ── Club logos shelf (DEEPEST RECESSED ARCADE KEYPAD TRAY) ───────────────
  clubShelf: {
    flexDirection: "row",
    backgroundColor: "#701020",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 4,
    borderRadius: 10,
    borderWidth: 3,
    borderTopColor: "#a02830",
    borderLeftColor: "#902028",
    borderBottomColor: "#180206",
    borderRightColor: "#280408",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 5,
    elevation: 3,
    gap: 5,
  },
  clubCard: {
    flex: 1,
    height: 66,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3d0810",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#280410",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: "hidden",
  },
  // ── SELECTED state: gold glow + lifted card ──
  clubCardOn: {
    backgroundColor: "#6a1420",
    borderWidth: 1.5,
    borderColor: "#FFD700",
    shadowColor: "#FFD700",
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  // Gold top bar that appears on active club
  clubActiveBar: {
    position: "absolute",
    top: 0,
    left: 4,
    right: 4,
    height: 2.5,
    backgroundColor: "#FFD700",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    shadowColor: "#FFD700",
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 10,
  },
  clubTiltHi: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,160,100,0.07)",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  clubTiltLo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(0,0,0,0.30)",
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  clubTiltLightStrip: {},
  clubTiltDarkStrip: {},
  clubBet: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "normal",
    marginTop: 3,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  clubBetOn: {
    color: "#FFFFFF",
    fontWeight: "normal",
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  modeBadgePill: {
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  modeBadgeTxt: {
    color: "#FFE566",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 55,
    paddingRight: 12,
  },
  dropdownCard: {
    width: 250,
    backgroundColor: "#220038",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FFD700",
    padding: 10,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
  },
  dropdownModeHeader: {
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  dropdownModeHeaderFun: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "#22c55e",
    borderWidth: 1,
  },
  dropdownModeHeaderReal: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
    borderWidth: 1,
  },
  dropdownModeBadge: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  dropdownModeSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    marginTop: 2,
  },
  dropdownSwitchBtn: {
    backgroundColor: "#400070",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#aa44ee",
    alignItems: "center",
    marginBottom: 4,
  },
  dropdownSwitchTxt: {
    color: "#FFE566",
    fontWeight: "900",
    fontSize: 11,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginVertical: 6,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  dropdownItemIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  dropdownItemTxt: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dropdownItemArrow: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 16,
    fontWeight: "900",
  },
  dropdownLogoutItem: {
    backgroundColor: "rgba(220, 53, 69, 0.1)",
  },
});
