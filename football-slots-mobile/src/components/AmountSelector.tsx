import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "./theme";

interface AmountSelectorProps {
  presets: number[];
  selected: string;
  onSelect: (value: string) => void;
  prefix?: string;
  variant?: "gold" | "blue";
}

export function AmountSelector({
  presets,
  selected,
  onSelect,
  prefix = "",
  variant = "gold",
}: AmountSelectorProps) {
  const accentColor = variant === "gold" ? theme.colors.gold : theme.colors.blue;
  const bgActive = variant === "gold" ? theme.colors.realLight : theme.colors.demoLight;
  const borderActive = variant === "gold" ? theme.colors.realBorder : theme.colors.demoBorder;

  return (
    <View style={styles.row}>
      {presets.map((val) => {
        const isSelected = selected === val.toString();
        return (
          <TouchableOpacity
            key={val}
            style={[
              styles.chip,
              isSelected && [styles.chipSelected, { backgroundColor: bgActive, borderColor: borderActive }],
            ]}
            onPress={() => onSelect(val.toString())}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                isSelected && [styles.chipTextSelected, { color: accentColor }],
              ]}
            >
              {prefix}{val}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.glassLight,
  },
  chipSelected: {
    borderWidth: 1,
  },
  chipText: {
    fontFamily: theme.fonts.numbersRegular,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextSelected: {
    fontWeight: "700",
  },
});
