import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
}

export function EmptyState({
  icon = "football-outline",
  title,
  message,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <View style={styles.iconRing}>
          <Ionicons name={icon as any} size={40} color={theme.colors.textDim} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const { colors, fonts, radius } = theme;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 36,
  },
  iconWrapper: {
    marginBottom: 20,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.glassLight,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    justifyContent: "center",
    alignItems: "center",
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
  },
});
