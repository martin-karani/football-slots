import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { theme } from "./theme";

interface ScreenHeaderProps {
  title: string;
  rightElement?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}

export function ScreenHeader({
  title,
  rightElement,
  onBack,
  showBack = true,
}: ScreenHeaderProps) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack ?? (() => navigation.goBack())}
        >
          <Text style={styles.backArrow}>←</Text>
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
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    fontFamily: theme.fonts.bodyBold,
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  title: {
    fontFamily: theme.fonts.marquee,
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  right: {
    minWidth: 38,
    alignItems: "flex-end",
  },
  placeholder: {
    width: 38,
  },
});
