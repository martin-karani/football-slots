import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

type WalletMode = "real" | "demo" | "bonus";

interface WalletModeSelectorProps {
  activeMode: WalletMode;
  onSelect: (mode: WalletMode) => void;
}

export function WalletModeSelector({ activeMode, onSelect }: WalletModeSelectorProps) {
  const modes: { key: WalletMode; label: string; icon: any }[] = [
    { key: "real", label: "Real", icon: "cash-outline" },
    { key: "demo", label: "Demo", icon: "game-controller-outline" },
    { key: "bonus", label: "Bonus", icon: "gift-outline" },
  ];

  return (
    <View style={styles.container}>
      {modes.map((mode) => {
        const isActive = activeMode === mode.key;
        const accent = mode.key === "real" ? theme.colors.gold
          : mode.key === "demo" ? theme.colors.blue
          : theme.colors.bonusAccent;

        return (
          <TouchableOpacity
            key={mode.key}
            style={[
              styles.tab,
              isActive && [styles.tabActive, { borderColor: accent + "66", backgroundColor: accent + "15" }],
            ]}
            onPress={() => onSelect(mode.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={mode.icon as any}
              size={16}
              color={isActive ? accent : theme.colors.textDim}
            />
            <Text style={[styles.label, isActive && { color: accent }]}>{mode.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  tabActive: {
    borderWidth: 1,
  },
  label: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textDim,
    fontSize: 13,
    fontWeight: "600",
  },
});
