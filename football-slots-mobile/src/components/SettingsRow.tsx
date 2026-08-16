import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  rightElement?: React.ReactNode;
}

/**
 * Settings menu row with icon, label, optional value, and chevron.
 */
export function SettingsRow({
  icon,
  label,
  sublabel,
  value,
  onPress,
  showChevron = true,
  danger = false,
  rightElement,
}: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={[styles.iconContainer, danger && styles.iconContainerDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? theme.colors.error : theme.colors.textSecondary}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>

      <View style={styles.right}>
        {value && <Text style={styles.value}>{value}</Text>}
        {rightElement}
        {!rightElement && showChevron && onPress && (
          <Ionicons name="chevron-forward" size={16} color={danger ? theme.colors.error : theme.colors.textDim} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconContainerDanger: {
    backgroundColor: colors.errorBg,
  },
  content: {
    flex: 1,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  labelDanger: {
    color: colors.error,
  },
  sublabel: {
    fontFamily: theme.fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  right: {
    alignItems: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  value: {
    fontFamily: theme.fonts.body,
    color: colors.textDim,
    fontSize: 13,
  },
});
