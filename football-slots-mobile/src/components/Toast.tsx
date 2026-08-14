import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { View, Text, Animated, StyleSheet, Dimensions } from "react-native";
import { theme } from "./theme";

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
// Provider
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
      <View style={styles.toastContainer} pointerEvents="none">
        {toasts.map((toast, index) => {
          const anim = animations.current.get(toast.id);
          if (!anim) return null;

          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [-100, 0],
          });

          return (
            <Animated.View
              key={toast.id}
              style={[
                styles.toastWrapper,
                {
                  transform: [{ translateY }],
                  top: 50 + index * (60 + TOAST_GAP),
                },
              ]}
            >
              <View style={[styles.toast, styles[`toast_${toast.type}`]]}>
                <View style={styles.toastIcon}>
                  <Text>{typeIcon(toast.type)}</Text>
                </View>
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
    </ToastContext.Provider>
  );
}

function typeIcon(type: ToastType): string {
  switch (type) {
    case "success":
      return "✅";
    case "error":
      return "❌";
    case "warning":
      return "⚠️";
    case "info":
      return "ℹ️";
  }
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
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
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toast_success: {
    backgroundColor: "#1a3a1a",
    borderWidth: 1,
    borderColor: "#2d5a2d",
  },
  toast_error: {
    backgroundColor: "#3a1a1a",
    borderWidth: 1,
    borderColor: "#5a2d2d",
  },
  toast_warning: {
    backgroundColor: "#3a3a1a",
    borderWidth: 1,
    borderColor: "#5a5a2d",
  },
  toast_info: {
    backgroundColor: "#1a2a3a",
    borderWidth: 1,
    borderColor: "#2d4a5a",
  },
  toastIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: theme.fonts.bodyBold,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  toastMessage: {
    fontFamily: theme.fonts.body,
    color: "#ddd",
    fontSize: 12,
    lineHeight: 16,
  },
});
