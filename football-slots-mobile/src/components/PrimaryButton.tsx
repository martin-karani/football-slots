import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { theme } from "./theme";

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  style?: ViewStyle;
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  style,
}: ButtonProps) {
  const variantStyle = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    danger: styles.btnDanger,
    ghost: styles.btnGhost,
  }[variant];

  const textStyle = {
    primary: styles.textPrimary,
    secondary: styles.textSecondary,
    danger: styles.textDanger,
    ghost: styles.textGhost,
  }[variant];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        variantStyle,
        disabled && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? theme.colors.background : theme.colors.textPrimary} />
      ) : (
        <Text style={[styles.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  btnPrimary: {
    backgroundColor: colors.blue,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSecondary: {
    backgroundColor: colors.glassMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDanger: {
    backgroundColor: colors.error,
  },
  btnGhost: {
    backgroundColor: "transparent",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  textPrimary: {
    color: "#fff",
  },
  textSecondary: {
    color: colors.textPrimary,
  },
  textDanger: {
    color: "#fff",
  },
  textGhost: {
    color: colors.blue,
  },
});
