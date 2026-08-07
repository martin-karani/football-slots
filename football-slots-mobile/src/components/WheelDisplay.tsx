import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import { WHEEL_POSITIONS, SYMBOLS, getGridCoords } from '../types';
import { useGameStore } from '../store/GameProvider';

interface Props {
  step: SharedValue<number>;
  isSpinning: boolean;
  isReal: boolean;
}

// Total grid dimensions — 7 cols × 7 rows (square)
const COLS = 7;
const ROWS = 7;

const windowWidth = Dimensions.get('window').width;
const FRAME_PADDING = 8;
const OUTER_PADDING = 12;
const GRID_WIDTH = windowWidth - OUTER_PADDING * 2 - FRAME_PADDING * 2;
const CELL_SIZE = Math.floor(GRID_WIDTH / COLS);
const GRID_HEIGHT = CELL_SIZE * ROWS;

function getTeamInfo(symbolKey: string) {
  return SYMBOLS.find((s) => s.key === symbolKey) ?? {
    key: symbolKey,
    name: symbolKey,
    color: '#333',
    tier: 'common',
    icon: null as any,
  };
}

function getTierStyle(tier: string) {
  switch (tier) {
    case 'jackpot': return { bg: '#2b0040', border: '#FFD700', glow: '#FFD700' };
    case 'rare': return { bg: '#40000c', border: '#ff3344', glow: '#ff0022' };
    case 'mid': return { bg: '#081636', border: '#22aaff', glow: '#0088ff' };
    default: return { bg: '#280c00', border: '#ffa600', glow: '#ff8800' };
  }
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
  const tierStyle = getTierStyle(team.tier);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const currentPos = ((Math.round(step.value) % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return {
      // Keep club's background color always — NO background override
      backgroundColor: team.color,
      // Golden wooden border when active, classic wood border when idle
      borderColor: isActive ? '#DAA520' : '#8B5A2B',
      borderWidth: isActive ? 3.5 : 1.5,
      // Scale pop for active cell
      transform: [{ scale: isActive ? 1.12 : 1 }],
      zIndex: isActive ? 20 : 1,
      // Bright halo glow when active
      shadowColor: isActive ? '#FFFFFF' : '#000000',
      shadowOpacity: isActive ? 1 : 0.4,
      shadowRadius: isActive ? 14 : 3,
      shadowOffset: { width: 0, height: 0 },
      elevation: isActive ? 18 : 2,
    };
  });

  const animatedOverlayStyle = useAnimatedStyle(() => {
    const currentPos = ((Math.round(step.value) % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return {
      opacity: isActive ? 0.35 : 0,
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const currentPos = ((Math.round(step.value) % 24) + 24) % 24;
    const isActive = currentPos === pos - 1;
    return { color: isActive ? '#FFFFFF' : '#FFD700' };
  });

  // Gap between boxes
  const BOX_MARGIN = 2;

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          left: coords.col * CELL_SIZE + BOX_MARGIN,
          top: coords.row * CELL_SIZE + BOX_MARGIN,
          width: CELL_SIZE - BOX_MARGIN * 2,
          height: CELL_SIZE - BOX_MARGIN * 2,
        },
        animatedContainerStyle,
      ]}
    >
      {/* Semi-transparent highlight layer on active position */}
      <Animated.View style={[styles.transparentOverlay, animatedOverlayStyle]} pointerEvents="none" />

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

export function WheelDisplay({ step, isSpinning, isReal }: Props) {
  const lastSpin = useGameStore((state) => state.lastSpin);
  const lastTeam = lastSpin ? getTeamInfo(lastSpin.symbol) : null;

  const centerLeft = CELL_SIZE;
  const centerTop = CELL_SIZE;
  const centerWidth = CELL_SIZE * 5;
  const centerHeight = CELL_SIZE * 5;

  return (
    <View style={styles.outerFrame}>
      {/* The slot grid */}
      <View style={[styles.gridContainer, { width: GRID_WIDTH, height: GRID_HEIGHT }]}>

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
                  {lastTeam?.icon ? <lastTeam.icon width={64} height={64} /> : <Text style={styles.resultEmoji}>⚽</Text>}
                </View>
                <Text style={styles.resultTeamName}>{lastTeam?.name ?? ''}</Text>
                <View style={styles.resultScoreBox}>
                  <Text style={styles.resultScore}>
                    {lastSpin.is_win ? `+${lastSpin.gross_payout}` : 'NO WIN'}
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
  );
}

const styles = StyleSheet.create({
  outerFrame: {
    backgroundColor: '#60000a',
    padding: FRAME_PADDING,
    marginHorizontal: OUTER_PADDING,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8B5A2B',
    alignSelf: 'center',
  },

  gridContainer: {
    position: 'relative',
    backgroundColor: '#120005',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#8B5A2B',
  },
  cell: {
    position: 'absolute',
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  transparentOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    zIndex: 2,
  },
  cellBevelTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  cellBevelBottomRight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellMultiplier: {
    position: 'absolute',
    bottom: 2,
    left: 3,
    fontSize: 10,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  centerArea: {
    position: 'absolute',
    borderRadius: 14,
    overflow: 'hidden',
  },
  marqueeInner: {
    flex: 1,
    backgroundColor: '#400028',
    borderWidth: 4,
    borderColor: '#8B5A2B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  marqueeTitle1: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFEA00',
    fontStyle: 'italic',
    textShadowColor: '#b30000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 2,
    letterSpacing: 2,
  },
  marqueeTitle2: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFD700',
    fontStyle: 'italic',
    textShadowColor: '#b30000',
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
    fontWeight: '900',
    color: '#FFD700',
    marginBottom: 4,
    letterSpacing: 1,
  },
  resultScoreBox: {
    backgroundColor: '#120005',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF8800',
    paddingHorizontal: 24,
    paddingVertical: 5,
    shadowColor: '#FF8800',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  resultScore: {
    color: '#FFD700',
    fontWeight: '900',
    fontSize: 24,
    fontFamily: 'monospace',
    letterSpacing: 4,
  },
});
