import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useGoBack } from "../navigation/types";

interface ScreenHeaderProps {
  title: string;
  rightElement?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  transparent?: boolean;
}

export function ScreenHeader({
  title,
  rightElement,
  onBack,
  showBack = true,
  transparent = false,
}: ScreenHeaderProps) {
  const goBack = useGoBack();

  return (
    <View style={[styles.header, transparent && styles.headerTransparent]}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack ?? goBack}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}

      <Text style={styles.title}>{title}</Text>

      {rightElement ? (
        <View style={styles.right}>{rightElement}</View>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderMuted,
  },
  headerTransparent: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  right: {
    minWidth: 38,
    alignItems: "flex-end",
  },
  placeholder: {
    width: 38,
  },
});
