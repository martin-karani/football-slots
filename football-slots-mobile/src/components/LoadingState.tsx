import { View, ActivityIndicator, StyleSheet } from "react-native";
import { theme } from "./theme";

interface LoadingStateProps {
  size?: "small" | "large";
  color?: string;
}

export function LoadingState({ size = "large", color }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size={size}
        color={color || theme.colors.blue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
});
