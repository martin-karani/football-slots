import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <Ionicons name="alert-circle" size={36} color={theme.colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={15} color="#fff" />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 36,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: "rgba(255,84,104,0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.blue,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radius.md,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  retryText: {
    fontFamily: fonts.bodyBold,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
