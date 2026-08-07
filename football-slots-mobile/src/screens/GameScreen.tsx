import { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useGameStore } from "../store/GameProvider";
import { useGame } from "../hooks/useGame";
import { useWallet } from "../hooks/useWallet";
import { WheelDisplay } from "../components/WheelDisplay";
import { GambleModal } from "../components/GambleModal";
import { SYMBOLS, CHIP_VALUES, CurrencyType } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
//  "ARCADE MACHINE" THEME
//  Inspired by the Fruit Slots reference: vibrant cherry-red body, thick brass
//  gold trim, rich purple header, bright warm colours throughout.
//  Every panel has 3D beveled edges (light top-left, dark bottom-right).
// ─────────────────────────────────────────────────────────────────────────────

export function GameScreen() {
  const isSpinning     = useGameStore((s) => s.isSpinning);
  const lastSpin       = useGameStore((s) => s.lastSpin);
  const currency       = useGameStore((s) => s.currency);
  const setCurrency    = useGameStore((s) => s.setCurrency);
  const showGamble     = useGameStore((s) => s.showGambleModal);
  const setShowGamble  = useGameStore((s) => s.setShowGambleModal);
  const clearBets      = useGameStore((s) => s.clearBets);
  const totalStake     = useGameStore((s) => s.getTotalStake());
  const balances       = useGameStore((s) => s.balances);
  const currentBets    = useGameStore((s) => s.currentBets);
  const selectedChip   = useGameStore((s) => s.selectedChip);
  const setSelected    = useGameStore((s) => s.setSelectedChip);
  const placeBet       = useGameStore((s) => s.placeBet);
  const removeBet      = useGameStore((s) => s.removeBet);

  const { spin, gamble, step } = useGame();
  const { fetchBalance } = useWallet();
  const navigation = useNavigation<any>();

  useEffect(() => { fetchBalance(); }, [currency]);

  const winAmount      = lastSpin?.is_win ? lastSpin.gross_payout : 0;
  const balance        = balances[currency];
  const chipMultiplier = currency === "real" ? 100 : 1;
  const fmtBal         = (n: number) => (n / 100).toFixed(2);
  const currLabel      = currency === "real" ? "KES" : currency === "bonus" ? "BONUS" : "FUN";
  const isReal         = currency === "real";

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor="#3a0060" />

      {/* ══════════════════════════════════════════════════════════════════
          OUTER MACHINE BODY — cherry-red with thick brass gold border
       ══════════════════════════════════════════════════════════════════ */}
      <View style={st.machine}>

        {/* Side brass light-rail pillars */}
        <View style={st.railL} pointerEvents="none">
          {[...Array(14)].map((_, i) => <View key={i} style={st.railDot} />)}
        </View>
        <View style={st.railR} pointerEvents="none">
          {[...Array(14)].map((_, i) => <View key={i} style={st.railDot} />)}
        </View>

        {/* ═══════════════════════════════════════════════════════════
            HEADER — rich purple marquee bar
         ═══════════════════════════════════════════════════════════ */}
        <View style={st.header}>
          <Text style={st.headerTxt}>⚽  FOOTBALL SLOTS  ⚽</Text>
          <TouchableOpacity
            style={st.menuBtn}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={st.menuBtnTxt}>≡</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            BALANCE BAR — dynamic mode differentiation
         ═══════════════════════════════════════════════════════════ */}
        <View style={[st.balBar, isReal ? st.balBarReal : st.balBarFun]}>
          <View style={st.balLeft}>
            <Text style={st.balCoin}>{isReal ? "💰" : "🎮"}</Text>
            <Text style={[st.balNum, isReal ? st.balNumReal : st.balNumFun]}>{fmtBal(balance)}</Text>
            <Text style={[st.balCurr, isReal ? st.balCurrReal : st.balCurrFun]}>{currLabel}</Text>
          </View>
          <View style={st.modePill}>
            {(["virtual", "real"] as CurrencyType[]).map((k) => (
              <TouchableOpacity
                key={k}
                style={[st.modeBtn, currency === k && (k === "real" ? st.modeBtnOnReal : st.modeBtnOnFun)]}
                onPress={() => setCurrency(k)}
              >
                <Text style={[st.modeTxt, currency === k && (k === "real" ? st.modeTxtOnReal : st.modeTxtOnFun)]}>
                  {k === "virtual" ? "🎮 FUN" : "💰 KES"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            SLOT WHEEL BOARD
         ═══════════════════════════════════════════════════════════ */}
        <WheelDisplay step={step} isSpinning={isSpinning} isReal={isReal} />

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
              <Text style={st.infoVal}>{winAmount || 0}</Text>
            </View>

            <View style={st.infoPiece}>
              <Text style={st.infoLabel}>Stake</Text>
              <Text style={st.infoVal}>{totalStake}</Text>
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
                style={[st.goBtnBase, isReal ? st.goBtnReal : st.goBtnFun, (isSpinning || totalStake === 0) && st.goBtnOff]}
                onPress={spin}
                disabled={isSpinning || totalStake === 0}
                activeOpacity={0.8}
              >
                <Text style={st.goLabel}>{isSpinning ? "⏳" : "GO"}</Text>
                <Text style={st.goSub}>About to Pay {totalStake}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3D HORIZONTAL CLIFF LEDGE STEP (WITH RIVETS) ──────── */}
          <View style={st.cliffLedgeDivider}>
            <View style={st.rivetDotL} />
            <View style={st.rivetDotR} />
          </View>

          {/* ── ROW 3: CHIP SELECTORS SHELF ────────────────────────── */}
          <View style={st.chipShelf}>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.chipRow}
              bounces={false}
            >
              {CHIP_VALUES.slice().reverse().map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[st.chip, selectedChip === v && st.chipOn]}
                  onPress={() => setSelected(v)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.chipTxt, selectedChip === v && st.chipTxtOn]}>
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── SHELF: CLUB LOGOS (deepest/darkest shelf) ──────────── */}
          <View style={st.clubShelf}>
            {SYMBOLS.map((sym) => {
              const bet = currentBets[sym.key] || 0;
              return (
                <TouchableOpacity
                  key={sym.key}
                  style={[st.clubCard, bet > 0 && st.clubCardOn]}
                  onPress={() => placeBet(sym.key, selectedChip * chipMultiplier)}
                  onLongPress={() => removeBet(sym.key, selectedChip * chipMultiplier)}
                  activeOpacity={0.7}
                >
                  {sym.icon && <sym.icon width={28} height={28} />}
                  <Text style={[st.clubBet, bet > 0 && st.clubBetOn]}>
                    {bet > 0 ? bet : "00"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <GambleModal
        visible={showGamble}
        onClose={() => setShowGamble(false)}
        onChoice={(c) => gamble(c)}
        winAmount={lastSpin?.gross_payout || 0}
      />
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

  // ── Side wood light-rails ────────────────────────────────────────────────
  railL: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
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
    right: 0, top: 0, bottom: 0,
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

  // ── Control Deck — darker red machine bottom ──────────────────────────────
  deck: {
    backgroundColor: "#7a0818",
    borderTopWidth: 4,
    borderTopColor: "#8b5a2b",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 12,
    position: "relative",
  },
  watermarkContainer: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
    opacity: 0.15,
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

  // ── Info Bar (WIN / STAKE / GIFT) ─────────────────────────────────────────
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a0307",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: "#501218",
    gap: 12,
  },
  infoPiece: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  winBadge: {
    backgroundColor: "#cc2222",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderTopColor: "#ee4444",
    borderLeftColor: "#ee4444",
    borderBottomColor: "#880000",
    borderRightColor: "#880000",
  },
  winBadgeTxt: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  infoLabel: {
    color: "#ffd700",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  infoVal: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  giftPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  giftTxt: {
    color: "#ffd700",
    fontWeight: "700",
    fontSize: 11,
  },
  giftVal: {
    color: "#ffe866",
    fontWeight: "800",
    fontSize: 11,
  },

  // ── GO + CLEAR shelf ──────────────────────────────────────────────────────
  goShelf: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#8a101c",
  },
  clearBtn: {
    backgroundColor: "#e67e22",
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderWidth: 3,
    borderTopColor: "#f39c12",
    borderLeftColor: "#f39c12",
    borderBottomColor: "#d35400",
    borderRightColor: "#d35400",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  clearTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Right Metallic 3D Platform Socket for GO Button
  goPlatformSocket: {
    backgroundColor: "#808080", // Metallic silver plate base
    borderRadius: 10,
    padding: 3,
    borderWidth: 2,
    borderTopColor: "#d0d0d0",  // Specular silver top highlight
    borderLeftColor: "#b0b0b0",
    borderBottomColor: "#404040", // Dark bottom metallic shadow
    borderRightColor: "#404040",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  goBtnBase: {
    borderRadius: 8,
    width: 116,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 10,
  },
  goBtnFun: {
    backgroundColor: "#dd2222",
    borderTopColor: "#ff6666",
    borderLeftColor: "#ff6666",
    borderBottomColor: "#880000",
    borderRightColor: "#880000",
    shadowColor: "#ff0000",
  },
  goBtnReal: {
    backgroundColor: "#1e8e3e",
    borderTopColor: "#44cc66",
    borderLeftColor: "#44cc66",
    borderBottomColor: "#0e5520",
    borderRightColor: "#0e5520",
    shadowColor: "#00ff00",
  },
  goBtnOff: { opacity: 0.4 },
  goLabel: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 26,
    lineHeight: 28,
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  goSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },

  // ── 3D Horizontal Cliff Ledge Divider with Rivets ─────────────────────────
  cliffLedgeDivider: {
    height: 10,
    backgroundColor: "#a01420",
    borderTopWidth: 2,
    borderTopColor: "#ff5533", // Bright orange-red specular highlight line
    borderBottomWidth: 3,
    borderBottomColor: "#200205", // Deep 3D drop shadow underneath
    position: "relative",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 10,
  },
  rivetDotL: {
    position: "absolute",
    left: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#c08040",
    borderWidth: 1,
    borderColor: "#ffe0a0",
  },
  rivetDotR: {
    position: "absolute",
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#c08040",
    borderWidth: 1,
    borderColor: "#ffe0a0",
  },

  // ── Middle Shelf (CLEAR button + Chips) ──────────────────────────────────
  deckMiddleShelf: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#600814",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#3a060d", // Flattening 2D transition into lower shelf
  },




  // ── Chip shelf (stake input shelf - 3D top cliff lip, straightening bottom) ─
  chipShelf: {
    backgroundColor: "#600814",
    borderTopWidth: 3,
    borderTopColor: "#a06030", // 3D wood cliff lip catching top light
    borderBottomWidth: 3,
    borderBottomColor: "#2a040a", // Straightening 2D bevel edge into club shelf
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  chipRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    alignItems: "center",
  },
  chip: {
    minWidth: 40,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#3a2200",      // dark brown/gold inactive
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    borderWidth: 2,
    borderTopColor: "#6a4400",
    borderLeftColor: "#6a4400",
    borderBottomColor: "#1a0e00",
    borderRightColor: "#1a0e00",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  chipOn: {
    backgroundColor: "#ffd700",       // bright gold active
    borderTopColor: "#fff8cc",
    borderLeftColor: "#fff8cc",
    borderBottomColor: "#aa8800",
    borderRightColor: "#aa8800",
    shadowColor: "#ffd700",
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  chipTxt: {
    color: "#c8a030",
    fontWeight: "900",
    fontSize: 13,
  },
  chipTxtOn: {
    color: "#3a1800",
    fontWeight: "900",
  },

  // ── Club logos shelf (flat base plane with slanted 3D keypads) ───────────────
  clubShelf: {
    flexDirection: "row",
    backgroundColor: "#380610",
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 14,
    marginBottom: 6,
    borderTopWidth: 2,
    borderTopColor: "#500a16", // Smooth flattening transition top edge
  },
  clubCard: {
    flex: 1,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#24050a", // Dark angled 3D button tile
    marginHorizontal: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderTopColor: "#5c121e", // Slanted top highlight
    borderLeftColor: "#480e18",
    borderBottomColor: "#100204", // Dark bottom base shadow
    borderRightColor: "#100204",
    transform: [{ perspective: 400 }, { rotateX: "10deg" }], // 3D forward-slanted perspective
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 4,
  },
  clubCardOn: {
    backgroundColor: "#2e7d32", // Bright green active keypad matching reference image
    borderTopColor: "#81c784",
    borderLeftColor: "#66bb6a",
    borderBottomColor: "#1b5e20",
    borderRightColor: "#1b5e20",
    shadowColor: "#4caf50",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  clubBet: {
    color: "#553030",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  clubBetOn: {
    color: "#ffd700",
  },
});
