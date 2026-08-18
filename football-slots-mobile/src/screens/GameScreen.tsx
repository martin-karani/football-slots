import { useEffect, useRef, useState, useCallback } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  withSpring,
} from "react-native-reanimated";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppNavigation } from "../navigation/types";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "../components/theme";
import { useGameStore } from "../store/GameProvider";
import { useGame } from "../hooks/useGame";
import { useWallet } from "../hooks/useWallet";

import { WheelDisplay } from "../components/WheelDisplay";
// WinCelebration modal removed — replaced with rail-dot flash animation
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
// ─────────────────────────────────────────────────────────────────────────────

// ─── Flashing rail dot — owns its own animation shared value ─────────────────
function FlashingRailDot({
  style,
  dotIndex,
  flashTick,
}: {
  style: object;
  dotIndex: number;
  flashTick: number;
}) {
  const brightness = useSharedValue(0.3);
  const prevTick = useRef(0);

  useEffect(() => {
    if (flashTick === 0) return;
    if (flashTick === prevTick.current) return;
    prevTick.current = flashTick;

    const CHASE_INTERVAL = 120;
    const FLASH_ON = 200;
    const CYCLE = CHASE_INTERVAL * 8;
    const FLASH_OFF = CYCLE - FLASH_ON;
    const delayMs = dotIndex * CHASE_INTERVAL;

    brightness.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: FLASH_ON }),
          withTiming(0.3, { duration: FLASH_OFF })
        ),
        -1,
        false
      )
    );

    const stopTimer = setTimeout(() => {
      cancelAnimation(brightness);
      brightness.value = withTiming(0.3, { duration: 400 });
    }, 3000 + delayMs);

    return () => clearTimeout(stopTimer);
  }, [flashTick]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: brightness.value,
    transform: [{ scale: 0.8 + brightness.value * 0.5 }],
  }));

  return <Animated.View style={[style, animStyle]} />;
}

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
  const setLastSpin = useGameStore((s) => s.setLastSpin);

  // winFlashTick increments on each win to trigger rail-dot chase flash
  const [winFlashTick, setWinFlashTick] = useState(0);
  const [showDropdownMenu, setShowDropdownMenu] = useState(false);
  // Track where the ≡ menu button is on-screen so the dropdown opens right below it
  const menuBtnRef = useRef<any>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 60, right: 12 });

  // Mode Selection Dropdown state & positioning
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeBtnRef = useRef<any>(null);
  const [modeDropdownPos, setModeDropdownPos] = useState({
    top: 120,
    right: 12,
    dropdownOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
  });

  // ── Balance deduction animation (shake + red flash) ──────────────────
  const balanceShakeX = useSharedValue(0);
  const balanceFlashColor = useSharedValue(0); // 0=normal 1=red flash
  // ── Win animation (gold glow pulse on balance bar) ────────────────────
  const winGlowOpacity = useSharedValue(0);
  const winGlowScale = useSharedValue(1);

  const onStakeDeducted = useCallback(() => {
    // Shake left-right
    balanceShakeX.value = withSequence(
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(-4, { duration: 50 }),
      withTiming(4, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
    // Flash red briefly
    balanceFlashColor.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 400 })
    );
  }, []);

  const onWin = useCallback(() => {
    winGlowOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 250 }),
          withTiming(1, { duration: 250 })
        ),
        4,
        false
      ),
      withTiming(0, { duration: 400 })
    );
    winGlowScale.value = withSequence(
      withSpring(1.04, { damping: 8, stiffness: 200 }),
      withTiming(1, { duration: 500 })
    );
  }, []);

  const balanceShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: balanceShakeX.value }],
  }));
  const balanceFlashStyle = useAnimatedStyle(() => ({
    color: balanceFlashColor.value > 0.5 ? "#FF4444" : undefined,
  }));
  const winGlowStyle = useAnimatedStyle(() => ({
    opacity: winGlowOpacity.value,
    transform: [{ scaleX: winGlowScale.value }, { scaleY: winGlowScale.value }],
  }));

  const { spin, step } = useGame({ onStakeDeducted, onWin });
  const { fetchBalance } = useWallet();
  const { play: playSound } = useSound();
  const navigation = useAppNavigation();

  useEffect(() => {
    fetchBalance();
  }, [currency]);

  const winAmount = lastSpin?.is_win ? lastSpin.gross_payout : 0;

  // Trigger rail flash on new win
  useEffect(() => {
    if (lastSpin?.is_win && lastSpin.gross_payout > 0) {
      setWinFlashTick((t) => t + 1);
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
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TouchableOpacity
              style={st.menuBtn}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              activeOpacity={0.7}
              onPress={() => setShowDropdownMenu(true)}
            >
              <Ionicons name="menu-outline" size={22} color="#FFE566" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            BALANCE BAR — dynamic mode differentiation
         ═══════════════════════════════════════════════════════════ */}
        <View style={[st.balBar, isReal ? st.balBarReal : st.balBarDemo]}>
          {/* Win glow overlay */}
          <Animated.View
            style={[st.winGlowOverlay, winGlowStyle]}
            pointerEvents="none"
          />
          <View style={st.balLeft}>
            <Text style={st.balCoin}>{isReal ? "💰" : "🎮"}</Text>
            <Animated.View style={balanceShakeStyle}>
              <Animated.Text
                style={[
                  st.balNum,
                  isReal ? st.balNumReal : st.balNumDemo,
                  balanceFlashStyle,
                ]}
              >
                {formatMinor(balanceMinor, currency)}
              </Animated.Text>
            </Animated.View>
            <Text
              style={[st.balCurr, isReal ? st.balCurrReal : st.balCurrDemo]}
            >
              {currencyLabel(currency)}
            </Text>
          </View>

          <TouchableOpacity
            ref={modeBtnRef}
            style={st.modeBadgePill}
            onPress={() => {
              if (modeBtnRef.current) {
                modeBtnRef.current.measure(
                  (
                    _x: number,
                    _y: number,
                    width: number,
                    height: number,
                    pageX: number,
                    pageY: number
                  ) => {
                    setModeDropdownPos({ top: pageY + height + 6, right: 12 });
                    setShowModeDropdown(true);
                  }
                );
              } else {
                setShowModeDropdown(!showModeDropdown);
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={st.modeBadgeTxt}>
              {isReal ? "💰 REAL MODE ▾" : "🎮 DEMO MODE ▾"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            SLOT WHEEL BOARD
         ═══════════════════════════════════════════════════════════ */}
        <View style={st.wheelWrapper}>
          {/* Side brass light-rail pillars — chase flash on win */}
          <View style={st.railL} pointerEvents="none">
            {[...Array(8)].map((_, i) => (
              <FlashingRailDot
                key={i}
                style={st.railDot}
                dotIndex={i}
                flashTick={winFlashTick}
              />
            ))}
          </View>
          <View style={st.railR} pointerEvents="none">
            {[...Array(8)].map((_, i) => (
              <FlashingRailDot
                key={i}
                style={st.railDot}
                dotIndex={i}
                flashTick={winFlashTick}
              />
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
              onPress={() => {
                playSound("button_press");
                clearBets();
              }}
              activeOpacity={0.7}
            >
              <Text style={st.clearTxt}>CLEAR</Text>
            </TouchableOpacity>

            {/* GO button in metallic 3D platform socket */}
            <View style={st.goPlatformSocket}>
              <TouchableOpacity
                style={[
                  st.goBtnBase,
                  isReal ? st.goBtnReal : st.goBtnDemo,
                  (isSpinning || totalStake === 0) && st.goBtnOff,
                ]}
                onPress={() => {
                  playSound("spin_click");
                  spin();
                }}
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
                          playSound("bet_remove");
                        } else {
                          setSelected(v);
                          clearBets(); // reset club selections for new chip price
                          setLastSpin(null); // reset win/loss display
                          playSound("chip_select");
                        }
                      }}
                      activeOpacity={1}
                    >
                      <View
                        style={[st.chipInnerRing, isOn && st.chipInnerRingOn]}
                      />
                      <Text style={[st.chipTxt, isOn && st.chipTxtOn]}>
                        {v}
                      </Text>
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
                      setLastSpin(null); // reset win/loss display on new bet
                      placeBet(sym.key, toMinor(chipToUse, currency));
                      playSound("chip_select");
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

                  <View
                    style={[
                      st.clubIconBadge,
                      {
                        backgroundColor: sym.color + "25",
                        borderColor: sym.color + "55",
                      },
                    ]}
                  >
                    {sym.icon && <sym.icon width={22} height={22} />}
                  </View>
                  <Text style={[st.clubBet, hasBet && st.clubBetOn]}>
                    {hasBet ? betDisplay : "00"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Win celebration is handled by rail-dot flash animation (no overlay modal) */}

      {/* ── Dedicated Mode Selection Dropdown Modal ── */}
      <Modal
        visible={showModeDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModeDropdown(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowModeDropdown(false)}>
          <View style={st.dropdownOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  st.modeDropdownCard,
                  {
                    position: "absolute",
                    top: modeDropdownPos.top,
                    right: modeDropdownPos.right,
                  },
                ]}
              >
                <Text style={st.modeDropdownTitle}>SELECT GAME MODE</Text>

                {/* Option 1: DEMO MODE */}
                <TouchableOpacity
                  style={[
                    st.modeOptionItem,
                    !isReal && st.modeOptionItemActiveDemo,
                  ]}
                  onPress={() => {
                    setCurrency("virtual");
                    setShowModeDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={st.modeOptionLeft}>
                    <Text style={st.modeOptionIcon}>🎮</Text>
                    <View style={st.modeOptionTextGroup}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={st.modeOptionName}>DEMO MODE</Text>
                        {!isReal && (
                          <Text style={st.modeActiveBadgeDemo}>ACTIVE</Text>
                        )}
                      </View>
                      <Text style={st.modeOptionDesc}>
                        Play with free virtual credits
                      </Text>
                    </View>
                  </View>
                  {!isReal && <Text style={st.modeCheckmark}>✓</Text>}
                </TouchableOpacity>

                {/* Option 2: REAL MODE */}
                <TouchableOpacity
                  style={[
                    st.modeOptionItem,
                    isReal && st.modeOptionItemActiveReal,
                  ]}
                  onPress={() => {
                    setCurrency("real");
                    setShowModeDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={st.modeOptionLeft}>
                    <Text style={st.modeOptionIcon}>💰</Text>
                    <View style={st.modeOptionTextGroup}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={st.modeOptionName}>REAL MODE (KES)</Text>
                        {isReal && (
                          <Text style={st.modeActiveBadgeReal}>ACTIVE</Text>
                        )}
                      </View>
                      <Text style={st.modeOptionDesc}>
                        Play with real M-Pesa balance
                      </Text>
                    </View>
                  </View>
                  {isReal && <Text style={st.modeCheckmark}>✓</Text>}
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Game Menu Bottom Sheet Modal (Design from HTML Section 05) ── */}
      <Modal
        visible={showDropdownMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDropdownMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDropdownMenu(false)}>
          <View style={st.menuSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={st.menuSheetContainer}>
                {/* Pull handle indicator */}
                <View style={st.menuSheetHandle} />

                {/* Title */}
                <Text style={st.menuSheetTitle}>Menu</Text>

                {/* Menu items list */}
                <View style={st.menuSheetList}>
                  {/* 1. Wallet */}
                  <TouchableOpacity
                    style={st.menuSheetItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowDropdownMenu(false);
                      navigation.navigate("Wallet");
                    }}
                  >
                    <View
                      style={[
                        st.menuItemIconBox,
                        { backgroundColor: "rgba(255, 229, 102, 0.18)" },
                      ]}
                    >
                      <Ionicons
                        name="wallet-outline"
                        size={20}
                        color="#FFE566"
                      />
                    </View>
                    <Text style={st.menuItemTitle}>Wallet</Text>
                    <Text style={st.menuItemWalletBalance}>
                      KES {formatMinor(balances.real, "real")}
                    </Text>
                  </TouchableOpacity>

                  {/* 2. Bet History */}
                  <TouchableOpacity
                    style={st.menuSheetItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowDropdownMenu(false);
                      navigation.navigate("History");
                    }}
                  >
                    <View
                      style={[
                        st.menuItemIconBox,
                        { backgroundColor: "rgba(196, 162, 255, 0.18)" },
                      ]}
                    >
                      <Ionicons
                        name="stats-chart-outline"
                        size={20}
                        color="#D0A0FF"
                      />
                    </View>
                    <Text style={st.menuItemTitle}>Bet history</Text>
                    <Text style={st.menuItemChevron}>›</Text>
                  </TouchableOpacity>

                  {/* 3. Rules & Paytable */}
                  <TouchableOpacity
                    style={st.menuSheetItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowDropdownMenu(false);
                      navigation.navigate("Paytable");
                    }}
                  >
                    <View
                      style={[
                        st.menuItemIconBox,
                        { backgroundColor: "rgba(196, 162, 255, 0.18)" },
                      ]}
                    >
                      <Ionicons
                        name="trophy-outline"
                        size={20}
                        color="#D0A0FF"
                      />
                    </View>
                    <Text style={st.menuItemTitle}>Rules &amp; paytable</Text>
                    <Text style={st.menuItemChevron}>›</Text>
                  </TouchableOpacity>

                  {/* 4. Profile & Settings */}
                  <TouchableOpacity
                    style={st.menuSheetItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowDropdownMenu(false);
                      navigation.navigate("Profile");
                    }}
                  >
                    <View
                      style={[
                        st.menuItemIconBox,
                        { backgroundColor: "rgba(196, 162, 255, 0.18)" },
                      ]}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color="#D0A0FF"
                      />
                    </View>
                    <Text style={st.menuItemTitle}>Profile &amp; settings</Text>
                    <Text style={st.menuItemChevron}>›</Text>
                  </TouchableOpacity>

                  {/* 5. Log out */}
                  <TouchableOpacity
                    style={[st.menuSheetItem, st.menuLogoutItem]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowDropdownMenu(false);
                      Alert.alert(
                        "Log Out",
                        "Are you sure you want to log out?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Log Out",
                            style: "destructive",
                            onPress: async () => {
                              await authStorage.clearToken();
                              clearAuth();
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View
                      style={[
                        st.menuItemIconBox,
                        { backgroundColor: "rgba(255, 84, 104, 0.18)" },
                      ]}
                    >
                      <Ionicons
                        name="log-out-outline"
                        size={20}
                        color="#FF5468"
                      />
                    </View>
                    <Text style={[st.menuItemTitle, { color: "#FF5468" }]}>
                      Log out
                    </Text>
                    <Text style={[st.menuItemChevron, { color: "#FF5468" }]}>
                      ›
                    </Text>
                  </TouchableOpacity>
                </View>
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
    fontFamily: theme.fonts.marquee,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#7a00b8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderTopColor: "#ffe566",
    borderLeftColor: "#aa44ee",
    borderBottomColor: "#3a0050",
    borderRightColor: "#3a0050",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  menuBtnTxt: {
    fontFamily: theme.fonts.button,
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
    position: "relative",
    overflow: "hidden",
  },
  balBarReal: {
    backgroundColor: "#901020",
  },
  balBarDemo: {
    backgroundColor: "#400080",
  },
  winGlowOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 215, 0, 0.35)",
    borderRadius: 0,
  },
  balLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  balCoin: { fontSize: 16 },
  balNum: {
    fontFamily: theme.fonts.digitalRegular,
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
  balNumDemo: {
    color: "#ffffff",
    textShadowColor: "#8800ff",
  },
  balCurr: {
    fontFamily: theme.fonts.bodyBold,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1,
  },
  balCurrReal: {
    color: "#ffcc80",
  },
  balCurrDemo: {
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
  modeBtnOnDemo: {
    backgroundColor: "#00ffff",
    shadowColor: "#00ffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  modeTxt: {
    fontFamily: theme.fonts.button,
    color: "#ffaa88",
    fontWeight: "800",
    fontSize: 11,
  },
  modeTxtOnReal: {
    color: "#4a0008",
    fontWeight: "900",
  },
  modeTxtOnDemo: {
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
    fontFamily: theme.fonts.marquee,
    fontSize: 42,
    fontWeight: "900",
    transform: [{ rotate: "-10deg" }],
  },
  watermarkTxtReal: {
    color: "#fff",
  },
  watermarkTxtDemo: {
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
    fontFamily: theme.fonts.button,
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 0.5, height: 0.5 },
  },
  infoLabel: {
    fontFamily: theme.fonts.bodyBold,
    color: "#ffe8b0",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  infoVal: {
    fontFamily: theme.fonts.digitalRegular,
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
    fontFamily: theme.fonts.bodyBold,
    color: "#ffd678",
    fontWeight: "800",
    fontSize: 10,
  },
  giftVal: {
    fontFamily: theme.fonts.digitalRegular,
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
    fontFamily: theme.fonts.button,
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
  goBtnDemo: {
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
    fontFamily: theme.fonts.button,
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    lineHeight: 24,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  goSub: {
    fontFamily: theme.fonts.body,
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
    fontFamily: theme.fonts.bodyBold,
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
    fontFamily: theme.fonts.digitalRegular,
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  chipTxtOn: {
    fontFamily: theme.fonts.digitalRegular,
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
    borderRadius: 10,
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
  clubIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 2,
  },
  clubTiltHi: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,160,100,0.07)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  clubTiltLo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(0,0,0,0.30)",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  clubTiltLightStrip: {},
  clubTiltDarkStrip: {},
  clubBet: {
    fontFamily: theme.fonts.digitalRegular,
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
    fontFamily: theme.fonts.button,
    color: "#FFE566",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  menuSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 0, 40, 0.85)",
    justifyContent: "flex-end",
  },
  menuSheetContainer: {
    backgroundColor: "#1e0438", // deep purple matching root bg
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 2,
    borderTopColor: "#8b5a2b", // same wood-gold border as header
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    shadowColor: "#8800dd",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 24,
  },
  menuSheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 229, 102, 0.35)", // gold tint handle
    alignSelf: "center",
    marginBottom: 18,
  },
  menuSheetTitle: {
    fontFamily: theme.fonts.heading,
    fontSize: 18,
    color: "#FFE566", // same gold as header text
    letterSpacing: 2,
    textShadowColor: "#ffd700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  menuSheetList: {
    gap: 8,
  },
  menuSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#2e0550", // slightly lighter purple card
    borderWidth: 1,
    borderColor: "rgba(139, 90, 43, 0.5)", // wood-gold border
  },
  menuItemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    color: "#F0E0FF", // soft lavender-white
  },
  menuItemWalletBalance: {
    fontFamily: theme.fonts.numbers,
    fontSize: 14,
    color: "#FFE566", // gold
  },
  menuItemChevron: {
    fontFamily: theme.fonts.body,
    fontSize: 20,
    color: "rgba(255, 229, 102, 0.45)", // dim gold chevron
  },
  menuLogoutItem: {
    backgroundColor: "rgba(255, 84, 104, 0.12)",
    borderColor: "rgba(255, 84, 104, 0.35)",
    marginTop: 4,
  },
  dropdownSectionHeader: {
    fontFamily: theme.fonts.button,
    color: "#D0B0FF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 4,
  },
  dropdownGameItemActive: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderColor: "rgba(255, 215, 0, 0.4)",
    borderWidth: 1,
  },
  dropdownActiveTag: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dropdownActiveTagTxt: {
    fontFamily: theme.fonts.button,
    color: "#1a0033",
    fontSize: 8,
    fontWeight: "900",
  },
  dropdownSoonTag: {
    fontFamily: theme.fonts.button,
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 8,
    fontWeight: "900",
  },
  modeDropdownCard: {
    width: 260,
    backgroundColor: "#1e0430",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.35)",
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 16,
  },
  modeDropdownTitle: {
    fontFamily: theme.fonts.marquee,
    color: "#FFE566",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: "center",
  },
  modeOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 8,
  },
  modeOptionItemActiveDemo: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.5)",
  },
  modeOptionItemActiveReal: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderColor: "rgba(255, 215, 0, 0.5)",
  },
  modeOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  modeOptionIcon: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 22,
  },
  modeOptionTextGroup: {
    flex: 1,
  },
  modeOptionName: {
    fontFamily: theme.fonts.bodyBold,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  modeOptionDesc: {
    fontFamily: theme.fonts.body,
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 9,
    marginTop: 2,
  },
  modeActiveBadgeDemo: {
    fontFamily: theme.fonts.button,
    backgroundColor: "#22c55e",
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  modeActiveBadgeReal: {
    fontFamily: theme.fonts.button,
    backgroundColor: "#FFD700",
    color: "#1a0033",
    fontSize: 8,
    fontWeight: "900",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  modeCheckmark: {
    fontFamily: theme.fonts.bodyBold,
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "900",
    marginLeft: 6,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 6,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dropdownItemIcon: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    marginRight: 10,
  },
  dropdownItemTxt: {
    fontFamily: theme.fonts.bodyBold,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  dropdownItemSub: {
    fontFamily: theme.fonts.body,
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 9,
    marginTop: 1,
  },
  dropdownItemArrow: {
    fontFamily: theme.fonts.bodyBold,
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: 16,
    fontWeight: "900",
  },
  dropdownLogoutItem: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
});
