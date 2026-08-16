import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {action && onAction && (
        <Text style={styles.action} onPress={onAction}>{action}</Text>
      )}
    </View>
  );
}

const { colors } = theme;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontFamily: theme.fonts.bodyMedium,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  action: {
    fontFamily: theme.fonts.bodyMedium,
    color: colors.blue,
    fontSize: 12,
    fontWeight: "600",
  },
});
