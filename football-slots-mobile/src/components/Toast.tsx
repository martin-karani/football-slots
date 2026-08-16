import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { View, Text, Animated, StyleSheet, Dimensions, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

// ============================================================
// Types
// ============================================================

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastMessage {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
}

// ============================================================
// Context
// ============================================================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================================
// Provider component
// ============================================================

const TOAST_DURATION = 3000;
const TOAST_GAP = 8;
const SCREEN_WIDTH = Dimensions.get("window").width;

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const animations = useRef<Map<number, Animated.Value>>(new Map());
  let nextId = useRef(0);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", title?: string) => {
      const id = nextId.current++;
      const anim = new Animated.Value(0);
      animations.current.set(id, anim);

      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Slide in
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();

      // Auto-dismiss
      setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setToasts((prev) => prev.filter((t) => t.id !== id));
            animations.current.delete(id);
          }
        });
      }, TOAST_DURATION);
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => showToast(message, "success", title),
    [showToast]
  );

  const showError = useCallback(
    (message: string, title?: string) => showToast(message, "error", title),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, title?: string) => showToast(message, "info", title),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, title?: string) => showToast(message, "warning", title),
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{ showToast, showSuccess, showError, showInfo, showWarning }}
    >
      {children}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.toastContainer} pointerEvents="none">
          {toasts.map((toast, index) => {
            const anim = animations.current.get(toast.id);
            if (!anim) return null;

            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-100, 0],
            });

            const iconMap: Record<ToastType, { name: any; color: string }> = {
              success: { name: "checkmark-circle", color: theme.colors.success },
              error: { name: "close-circle", color: theme.colors.error },
              warning: { name: "alert-circle", color: theme.colors.warning },
              info: { name: "information-circle", color: theme.colors.blue },
            };

            const icon = iconMap[toast.type];

            return (
              <Animated.View
                key={toast.id}
                style={[
                  styles.toastWrapper,
                  {
                    transform: [{ translateY }],
                    top: index * (60 + TOAST_GAP),
                  },
                ]}
              >
                <View style={[styles.toast, styles[`toast_${toast.type}`]]}>
                  <Ionicons name={icon.name} size={20} color={icon.color} style={styles.toastIcon} />
                  <View style={styles.toastContent}>
                    {toast.title && (
                      <Text style={styles.toastTitle}>{toast.title}</Text>
                    )}
                    <Text style={styles.toastMessage}>{toast.message}</Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </SafeAreaView>
    </ToastContext.Provider>
  );
}

// ============================================================
// Styles
// ============================================================

const { colors, radius } = theme;

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  toastContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  toastWrapper: {
    width: SCREEN_WIDTH - 32,
    overflow: "hidden",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toast_success: {
    borderColor: "rgba(47,212,138,0.3)",
  },
  toast_error: {
    borderColor: "rgba(255,84,104,0.3)",
  },
  toast_warning: {
    borderColor: "rgba(243,217,139,0.3)",
  },
  toast_info: {
    borderColor: "rgba(76,141,255,0.3)",
  },
  toastIcon: {
    marginRight: 10,
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: theme.fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  toastMessage: {
    fontFamily: theme.fonts.body,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
