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
import { WHEEL_POSITIONS, SYMBOLS, getGridCoords } from "../types";
import { useGameStore } from "../store/GameProvider";

interface Props {
  step: SharedValue<number>;
  isSpinning: boolean;
  isReal: boolean;
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

  const animatedContainerStyle = useAnimatedStyle(() => {
    "worklet";
    const s = Math.round(step.value);
    const currentPos = ((s % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return {
      backgroundColor: team.color,
      transform: [{ scale: isActive ? 1.1 : 1 }],
      zIndex: isActive ? 40 : 1,
      borderTopWidth: isActive ? 2 : 1.5,
      borderLeftWidth: isActive ? 2 : 1.5,
      borderBottomWidth: isActive ? 2.5 : 1.5,
      borderRightWidth: isActive ? 2.5 : 1.5,
      borderTopColor: isActive ? "#ffffff" : "#b07a38",
      borderLeftColor: isActive ? "#fff8a0" : "#a06a30",
      borderBottomColor: isActive ? "#ffb000" : "#5a3a18",
      borderRightColor: isActive ? "#ff8000" : "#6a4018",
      shadowColor: isActive ? "#FFEB3B" : "#000000",
      shadowOpacity: isActive ? 0.9 : 0.5,
      shadowRadius: isActive ? 11 : 3,
      shadowOffset: { width: 0, height: 0 },
      elevation: isActive ? 16 : 2,
    };
  });

  const animatedNeonRing = useAnimatedStyle(() => {
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
      transform: [{ scale: isActive ? 1.15 : 1 }],
      textShadowColor: isActive ? "#FF8F00" : "rgba(0,0,0,0.9)",
      textShadowRadius: isActive ? 6 : 2,
    };
  });

  const BOX_MARGIN = 2;
  const cellW = CELL_SIZE - BOX_MARGIN * 2;
  const cellH = CELL_SIZE - BOX_MARGIN * 2;

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
      {/* Thick asymmetric WHITE-ORANGE-YELLOW neon inner ring — visible only when active */}
      <Animated.View
        pointerEvents="none"
        style={[styles.neonRing, animatedNeonRing]}
      />
      {/* Inner specular white lip for extra pop */}
      <Animated.View
        pointerEvents="none"
        style={[styles.neonSpecularLip, animatedNeonRing]}
      />

      <View style={styles.cellBevelTopLeft} />
      <View style={styles.cellBevelBottomRight} />

      <View style={styles.iconContainer}>
        {team.icon && <team.icon width={34} height={34} />}
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
    // Tight ring barely outside the cell — 2px base, ~3px at peak.
    const haloSpread = 2 + pulse.value * 1;
    return {
      left: coords.col * CELL_SIZE + BOX_MARGIN - haloSpread,
      top: coords.row * CELL_SIZE + BOX_MARGIN - haloSpread,
      width: cellW + haloSpread * 2,
      height: cellH + haloSpread * 2,
      // Very low opacity — barely visible accent.
      opacity: 0.18 + pulse.value * 0.12,
      borderRadius: 10 + haloSpread,
      // Hairline border — just a whisper of a ring.
      borderWidth: 1 + pulse.value * 0.5,
      shadowRadius: 5 + pulse.value * 3,
      transform: [{ scale: 1 + pulse.value * 0.008 }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.haloOuter, haloAnim]} />
  );
}

export function WheelDisplay({ step, isSpinning, isReal }: Props) {
  const lastSpin = useGameStore((state) => state.lastSpin);
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
                left: centerLeft + 4,
                top: centerTop + 4,
                width: centerWidth - 8,
                height: centerHeight - 8,
              },
            ]}
          >
            {/* Inner arcade marquee */}
            <View style={styles.marqueeInner}>
              {lastSpin && !isSpinning ? (
                // Result state
                <>
                  <View style={styles.resultIconContainer}>
                    {lastTeam?.icon ? (
                      <lastTeam.icon width={64} height={64} />
                    ) : (
                      <Text style={styles.resultEmoji}>⚽</Text>
                    )}
                  </View>
                  <Text style={styles.resultTeamName}>
                    {lastTeam?.name ?? ""}
                  </Text>
                  <View style={styles.resultScoreBox}>
                    <Text style={styles.resultScore}>
                      {lastSpin.is_win ? `+${lastSpin.gross_payout}` : "NO WIN"}
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
  );
}

const styles = StyleSheet.create({
  outerFrame: {
    backgroundColor: "#60000a",
    padding: FRAME_PADDING,
    marginHorizontal: OUTER_PADDING,
    marginVertical: 4,
    borderRadius: 12,
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
    borderRadius: 10,
    overflow: "hidden",
  },
  gridContainer: {
    position: "relative",
    backgroundColor: "#120005",
    borderRadius: 8,
    // overflow: visible — intentionally NOT hidden so halos extend past cells
    borderWidth: 2,
    borderColor: "#8B5A2B",
  },
  cell: {
    position: "absolute",
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
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

  // ── Layer 2: thick asymmetric neon inner ring inside the active cell ─
  neonRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    borderTopWidth: 4.5,
    borderLeftWidth: 4.5,
    borderBottomWidth: 5.5,
    borderRightWidth: 5.5,
    borderTopColor: "#FFFFFF",
    borderLeftColor: "#FFF59D",
    borderBottomColor: "#FF6D00",
    borderRightColor: "#FF9100",
    zIndex: 5,
  },

  // ── Layer 3: ultra-bright inner specular lip (top + left 1px strip) ──
  neonSpecularLip: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    height: 1.5,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    opacity: 0.9,
    zIndex: 6,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
  },

  cellBevelTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  cellBevelBottomRight: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
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
    borderRadius: 14,
    overflow: "hidden",
  },
  marqueeInner: {
    flex: 1,
    backgroundColor: "#400028",
    borderWidth: 4,
    borderColor: "#8B5A2B",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
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
