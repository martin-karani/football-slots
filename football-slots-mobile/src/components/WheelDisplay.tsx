import { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  SharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  useSharedValue,
} from "react-native-reanimated";
import { WHEEL_POSITIONS, SYMBOLS, getGridCoords, fromMinor } from "../types";
import { useGameStore } from "../store/GameProvider";

interface Props {
  step: SharedValue<number>;
  isSpinning: boolean;
  isReal?: boolean;
}

// Total grid dimensions — 7 cols × 7 rows (square)
const COLS = 7;
const ROWS = 7;

const windowWidth = Dimensions.get("window").width;
const FRAME_PADDING = 8;
const OUTER_PADDING = 12;
const GRID_WIDTH = windowWidth - OUTER_PADDING * 2 - FRAME_PADDING * 2;
const CELL_SIZE = Math.floor(GRID_WIDTH / COLS);
const GRID_HEIGHT = CELL_SIZE * ROWS;
const BOX_MARGIN = 0.5; // tight gap between cells and around center marquee

function getTeamInfo(symbolKey: string) {
  return (
    SYMBOLS.find((s) => s.key === symbolKey) ?? {
      key: symbolKey,
      name: symbolKey,
      color: "#333",
      tier: "common",
      icon: null as any,
    }
  );
}

function WheelCell({
  pos,
  symbol,
  multiplier,
  step,
}: {
  pos: number;
  symbol: string;
  multiplier: number;
  step: SharedValue<number>;
}) {
  const coords = getGridCoords(pos);
  const team = getTeamInfo(symbol);

  // Container: vibrant inactive cells (0.90 opacity), full brightness + pop on active
  const animatedContainerStyle = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos = ((s % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return {
      backgroundColor: team.color,
      opacity: isActive ? 1 : 0.9,
      transform: [{ scale: isActive ? 1.08 : 1 }],
      zIndex: isActive ? 40 : 1,
      borderWidth: isActive ? 2 : 1,
      borderColor: isActive ? "#FFD700" : "#5a3212",
      shadowColor: isActive ? "#FFD700" : "#000",
      shadowOpacity: isActive ? 0.95 : 0.3,
      shadowRadius: isActive ? 12 : 2,
      shadowOffset: { width: 0, height: 0 },
      elevation: isActive ? 14 : 2,
    };
  });

  // White spotlight flash overlay — fades in on active cell
  const animatedSpotlight = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos = ((s % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return { opacity: isActive ? 0.22 : 0 };
  });

  // Corner bracket visibility
  const animatedBracket = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos = ((s % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return { opacity: isActive ? 1 : 0 };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos = ((s % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return {
      color: isActive ? "#FFFFFF" : "#FFD700",
      transform: [{ scale: isActive ? 1.1 : 1 }],
      textShadowColor: isActive ? "#FF8F00" : "rgba(0,0,0,0.9)",
      textShadowRadius: isActive ? 5 : 2,
    };
  });

  const cellW = CELL_SIZE - BOX_MARGIN * 2;
  const cellH = CELL_SIZE - BOX_MARGIN * 2;
  const BKT = 5; // bracket arm length
  const BKT_W = 1.5; // bracket stroke width

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          left: coords.col * CELL_SIZE + BOX_MARGIN,
          top: coords.row * CELL_SIZE + BOX_MARGIN,
          width: cellW,
          height: cellH,
        },
        animatedContainerStyle,
      ]}
    >
      {/* Spotlight white wash overlay */}
      <Animated.View pointerEvents="none" style={[styles.spotlight, animatedSpotlight]} />

      {/* Corner brackets — top-left */}
      <Animated.View pointerEvents="none" style={[styles.bktTL, { width: BKT, height: BKT_W, top: 3, left: 3 }, animatedBracket]} />
      <Animated.View pointerEvents="none" style={[styles.bktTL, { width: BKT_W, height: BKT, top: 3, left: 3 }, animatedBracket]} />
      {/* top-right */}
      <Animated.View pointerEvents="none" style={[styles.bktTR, { width: BKT, height: BKT_W, top: 3, right: 3 }, animatedBracket]} />
      <Animated.View pointerEvents="none" style={[styles.bktTR, { width: BKT_W, height: BKT, top: 3, right: 3 }, animatedBracket]} />
      {/* bottom-left */}
      <Animated.View pointerEvents="none" style={[styles.bktBL, { width: BKT, height: BKT_W, bottom: 3, left: 3 }, animatedBracket]} />
      <Animated.View pointerEvents="none" style={[styles.bktBL, { width: BKT_W, height: BKT, bottom: 3, left: 3 }, animatedBracket]} />
      {/* bottom-right */}
      <Animated.View pointerEvents="none" style={[styles.bktBR, { width: BKT, height: BKT_W, bottom: 3, right: 3 }, animatedBracket]} />
      <Animated.View pointerEvents="none" style={[styles.bktBR, { width: BKT_W, height: BKT, bottom: 3, right: 3 }, animatedBracket]} />

      <View style={styles.cellBevelTopLeft} />
      <View style={styles.cellBevelBottomRight} />

      <View style={styles.iconContainer}>
        {team.icon && <team.icon width={28} height={28} />}
      </View>
      <Animated.Text style={[styles.cellMultiplier, animatedTextStyle]}>
        X{multiplier}
      </Animated.Text>
    </Animated.View>
  );
}

// Inline (worklet-safe) position 1..24 -> {col,row} resolver. Kept inside
// this file and marked `'worklet'` so it can run on the Reanimated UI thread
// without bridging to the JS runtime (cross-thread calls crash the app).
function gridCoordsForPos(pos1to24: number) {
  "worklet";
  const p = pos1to24;
  if (p >= 1 && p <= 7) return { col: p - 1, row: 0 };
  if (p >= 8 && p <= 12) return { col: 6, row: p - 7 };
  if (p >= 13 && p <= 19) return { col: 6 - (p - 13), row: 6 };
  if (p >= 20 && p <= 24) return { col: 0, row: 5 - (p - 20) };
  return { col: 0, row: 0 };
}

// ── Pulsating global halo that tracks the current spin position ─────────
function PositionHalo({ step }: { step: SharedValue<number> }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    // Very slow, subtle breathe (3s full cycle) — almost imperceptible,
    // just enough to keep the highlight alive without drawing attention.
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.7, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [pulse]);

  const haloAnim = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos0to23 = ((s % 24) + 24) % 24;
    const coords = gridCoordsForPos(currentPos0to23 + 1);
    const BOX_MARGIN = 2;
    const cellW = CELL_SIZE - BOX_MARGIN * 2;
    const cellH = CELL_SIZE - BOX_MARGIN * 2;
    // Very tight halo — just 1px outside the cell.
    const haloSpread = 1 + pulse.value * 0.5;
    return {
      left: coords.col * CELL_SIZE + BOX_MARGIN - haloSpread,
      top: coords.row * CELL_SIZE + BOX_MARGIN - haloSpread,
      width: cellW + haloSpread * 2,
      height: cellH + haloSpread * 2,
      opacity: 0.12 + pulse.value * 0.08,
      borderRadius: 9 + haloSpread,
      borderWidth: 0.5 + pulse.value * 0.25,
      shadowRadius: 3 + pulse.value * 2,
      transform: [{ scale: 1 + pulse.value * 0.004 }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.haloOuter, haloAnim]} />
  );
}

export function WheelDisplay({ step, isSpinning }: Props) {
  const lastSpin = useGameStore((state) => state.lastSpin);
  const currency = useGameStore((state) => state.currency);
  const lastTeam = lastSpin ? getTeamInfo(lastSpin.symbol) : null;

  const centerLeft = CELL_SIZE;
  const centerTop = CELL_SIZE;
  const centerWidth = CELL_SIZE * 5;
  const centerHeight = CELL_SIZE * 5;

  return (
    <View style={styles.outerFrame}>
      {/* Extra inner clipping layer with breathing room so the halo doesn't clip */}
      <View
        style={[
          styles.gridOuterClip,
          { width: GRID_WIDTH, height: GRID_HEIGHT },
        ]}
      >
        {/* The slot grid — overflow visible so halo extends outside cells */}
        <View
          style={[
            styles.gridContainer,
            { width: GRID_WIDTH, height: GRID_HEIGHT },
          ]}
        >
          {/* Render all 24 perimeter cells */}
          {WHEEL_POSITIONS.map((wp) => (
            <WheelCell
              key={wp.pos}
              pos={wp.pos}
              symbol={wp.symbol}
              multiplier={wp.multiplier}
              step={step}
            />
          ))}

          {/* Pulsating global halo that tracks the spin position */}
          <PositionHalo step={step} />

          {/* Center Display */}
          <View
            style={[
              styles.centerArea,
              {
                left: centerLeft + BOX_MARGIN,
                top: centerTop + BOX_MARGIN,
                width: centerWidth - BOX_MARGIN * 2,
                height: centerHeight - BOX_MARGIN * 2,
              },
            ]}
          >
            {/* Sleek Gold Metallic Frame matching reference image */}
            <View style={styles.marqueeGoldFrame}>
              {/* Corner metallic rivets in the 4 rounded corners */}
              <View style={[styles.cornerRivet, styles.rivetTL]} />
              <View style={[styles.cornerRivet, styles.rivetTR]} />
              <View style={[styles.cornerRivet, styles.rivetBL]} />
              <View style={[styles.cornerRivet, styles.rivetBR]} />

              {/* Inner deep purple marquee display */}
              <View style={styles.marqueeInner}>
                {lastSpin && !isSpinning ? (
                  // Result state
                  <>
                    <View style={styles.resultIconContainer}>
                      {lastTeam?.icon ? (
                        <lastTeam.icon width={54} height={54} />
                      ) : (
                        <Text style={styles.resultEmoji}>⚽</Text>
                      )}
                    </View>
                    <Text style={styles.resultTeamName}>
                      {lastTeam?.name ?? ""}
                    </Text>
                    <View style={styles.resultScoreBox}>
                      <Text style={styles.resultScore}>
                        {lastSpin.is_win
                          ? `+${fromMinor(lastSpin.gross_payout, currency).toLocaleString()}`
                          : "NO WIN"}
                      </Text>
                    </View>
                  </>
                ) : isSpinning ? (
                  // Spinning state
                  <>
                    <Text style={styles.marqueeTitle1}>SPINNING</Text>
                    <Text style={styles.marqueeSpinIcon}>⚽</Text>
                  </>
                ) : (
                  // Idle state
                  <>
                    <Text style={styles.marqueeTitle1}>FOOTBALL</Text>
                    <Text style={styles.marqueeTitle2}>SLOTS</Text>
                    <View style={styles.resultScoreBox}>
                      <Text style={styles.resultScore}>00</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerFrame: {
    backgroundColor: "#60000a",
    padding: FRAME_PADDING,
    marginHorizontal: OUTER_PADDING,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 3,
    borderTopColor: "#c08a48",
    borderLeftColor: "#a87238",
    borderBottomColor: "#4a2810",
    borderRightColor: "#5a3018",
    alignSelf: "center",
  },

  // Outer clipping frame with a bit of inside breathing room — lets the halo
  // extend past the cell without hitting the brass frame border
  gridOuterClip: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gridContainer: {
    position: "relative",
    backgroundColor: "#120005",
    borderRadius: 12,
    // overflow: visible — intentionally NOT hidden so halos extend past cells
    borderWidth: 3,
    borderTopColor: "#c08a48",
    borderLeftColor: "#a87238",
    borderBottomColor: "#3a1c07",
    borderRightColor: "#4a240a",
  },
  cell: {
    position: "absolute",
    padding: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
  },

  // ── Layer 1 (outermost): soft glow halo wrapped around the active cell ──
  haloOuter: {
    position: "absolute",
    // Transparent background — the glow comes only from the outer
    // shadowColor + a thin accent border ring. No colored wash filling.
    backgroundColor: "rgba(255, 255, 255, 0)",
    shadowColor: "#FFEB3B",
    shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
    borderTopColor: "#FFFFFF",
    borderLeftColor: "#FFF9C4",
    borderBottomColor: "#FFB300",
    borderRightColor: "#FFC107",
    zIndex: 30,
  },

  // ── Spotlight overlay: white wash on active cell ──
  spotlight: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    zIndex: 5,
  },

  // ── Corner bracket arms ── (positioned absolutely via inline style)
  bktTL: { position: "absolute", backgroundColor: "#FFD700", zIndex: 10, borderTopLeftRadius: 1 },
  bktTR: { position: "absolute", backgroundColor: "#FFD700", zIndex: 10, borderTopRightRadius: 1 },
  bktBL: { position: "absolute", backgroundColor: "#FFD700", zIndex: 10, borderBottomLeftRadius: 1 },
  bktBR: { position: "absolute", backgroundColor: "#FFD700", zIndex: 10, borderBottomRightRadius: 1 },

  cellBevelTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  cellBevelBottomRight: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  cellMultiplier: {
    position: "absolute",
    bottom: 2,
    left: 3,
    fontSize: 10,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  centerArea: {
    position: "absolute",
    borderRadius: 12,
    overflow: "hidden",
  },
  marqueeGoldFrame: {
    flex: 1,
    backgroundColor: "#3a003a",
    padding: 3,
    borderRadius: 12,
    borderWidth: 3,
    borderTopColor: "#c08a48",
    borderLeftColor: "#a87238",
    borderBottomColor: "#3a1c07",
    borderRightColor: "#4a240a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
    position: "relative",
  },
  cornerRivet: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFD700",
    borderWidth: 1,
    borderColor: "#8B6508",
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 1,
  },
  rivetTL: { top: 5, left: 5 },
  rivetTR: { top: 5, right: 5 },
  rivetBL: { bottom: 5, left: 5 },
  rivetBR: { bottom: 5, right: 5 },
  marqueeInner: {
    flex: 1,
    backgroundColor: "#380036",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.4)",
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  marqueeTitle1: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFEA00",
    fontStyle: "italic",
    textShadowColor: "#b30000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 2,
    letterSpacing: 2,
  },
  marqueeTitle2: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFD700",
    fontStyle: "italic",
    textShadowColor: "#b30000",
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 2,
    letterSpacing: 3,
    marginBottom: 8,
  },
  marqueeSpinIcon: {
    fontSize: 40,
    marginTop: 4,
  },
  resultEmoji: {
    fontSize: 30,
    marginBottom: 4,
  },
  resultIconContainer: {
    marginBottom: 6,
  },
  resultTeamName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFD700",
    marginBottom: 4,
    letterSpacing: 1,
  },
  resultScoreBox: {
    backgroundColor: "#120005",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FF8800",
    paddingHorizontal: 24,
    paddingVertical: 5,
    shadowColor: "#FF8800",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  resultScore: {
    color: "#FFD700",
    fontWeight: "900",
    fontSize: 24,
    fontFamily: "monospace",
    letterSpacing: 4,
  },
});
