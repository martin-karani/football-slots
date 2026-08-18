import { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { theme } from "../components/theme";

interface SplashScreenProps {
  onFinish?: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const barProgress = useSharedValue(0);
  const finished = useRef(false);

  // Kick off the entrance sequence
  useEffect(() => {
    // Logo badge scales in
    scale.value = withSequence(
      withTiming(1.15, { duration: 500 }),
      withTiming(1, { duration: 200 })
    );

    // Glow ring fades behind the badge
    opacity.value = withDelay(200, withTiming(1, { duration: 600 }));

    // Title fades in
    titleOpacity.value = withDelay(
      400,
      withTiming(1, { duration: 500 })
    );

    // Subtitle fades in
    subtitleOpacity.value = withDelay(
      600,
      withTiming(1, { duration: 500 })
    );

    // Loading bar animates across then signals done
    barProgress.value = withDelay(
      800,
      withTiming(1, { duration: 1800 }, (done) => {
        if (done && !finished.current) {
          finished.current = true;
          runOnJS(onFinish)?.();
        }
      })
    );
  }, [onFinish, scale, opacity, titleOpacity, subtitleOpacity, barProgress]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleOpacity.value < 1 ? 12 : 0 }],
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barProgress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      {/* Subtle background grid lines */}
      <View style={styles.gridOverlay} />

      <View style={styles.center}>
        {/* Glow ring behind badge */}
        <Animated.View style={[styles.glowRing, glowStyle]} />

        {/* Logo badge */}
        <Animated.View style={[styles.badgeWrapper, badgeStyle]}>
          <View style={styles.badge}>
            <Ionicons name="star" size={56} color={theme.colors.gold} />
          </View>
        </Animated.View>

        {/* Brand title */}
        <Animated.View style={titleStyle}>
          <Text style={styles.title}>FOOTBALL SLOTS</Text>
        </Animated.View>

        {/* Subtitle */}
        <Animated.View style={subtitleAnimStyle}>
          <Text style={styles.subtitle}>PREMIER PLAY</Text>
        </Animated.View>

        {/* Decorative line */}
        <Animated.View style={[styles.decoLine, subtitleAnimStyle]} />
      </View>

      {/* Bottom loading bar */}
      <View style={styles.bottomBar}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2a0048",
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Glow ring */
  glowRing: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(231, 200, 119, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(231, 200, 119, 0.15)",
  },

  /* Badge */
  badgeWrapper: {
    overflow: "hidden",
  },
  badge: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: "#220538",
    borderWidth: 2.5,
    borderColor: "rgba(255, 215, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },

  /* Title */
  title: {
    fontFamily: theme.fonts.marquee,
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: 3,
    marginTop: 28,
    textShadowColor: "#FFD700",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },

  /* Subtitle */
  subtitle: {
    fontFamily: theme.fonts.heading,
    fontSize: 13,
    letterSpacing: 6,
    color: theme.colors.gold,
    marginTop: 8,
  },

  /* Decorative line under subtitle */
  decoLine: {
    width: 60,
    height: 2,
    marginTop: 16,
    borderRadius: 1,
    backgroundColor: "rgba(255, 215, 0, 0.35)",
  },

  /* Bottom loading bar */
  bottomBar: {
    paddingHorizontal: 48,
    paddingBottom: 48,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: theme.colors.gold,
    borderRadius: 2,
    shadowColor: theme.colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
});
