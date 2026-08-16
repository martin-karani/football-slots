import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

interface StatusBadgeProps {
  label: string;
  variant?: "success" | "error" | "warning" | "info" | "neutral";
}

export function StatusBadge({ label, variant = "neutral" }: StatusBadgeProps) {
  const variantStyle = {
    success: styles.badgeSuccess,
    error: styles.badgeError,
    warning: styles.badgeWarning,
    info: styles.badgeInfo,
    neutral: styles.badgeNeutral,
  }[variant];

  const textVariant = {
    success: styles.textSuccess,
    error: styles.textError,
    warning: styles.textWarning,
    info: styles.textInfo,
    neutral: styles.textNeutral,
  }[variant];

  return (
    <View style={[styles.badge, variantStyle]}>
      <Text style={[styles.text, textVariant]}>{label}</Text>
    </View>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeSuccess: { backgroundColor: colors.successBg },
  badgeError: { backgroundColor: colors.errorBg },
  badgeWarning: { backgroundColor: colors.warningBg },
  badgeInfo: { backgroundColor: colors.infoBg },
  badgeNeutral: { backgroundColor: colors.glassMedium },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  textSuccess: { color: colors.success },
  textError: { color: colors.error },
  textWarning: { color: colors.warning },
  textInfo: { color: colors.blue },
  textNeutral: { color: colors.textMuted },
});
