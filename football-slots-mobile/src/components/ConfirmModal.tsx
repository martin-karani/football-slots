import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { theme } from "./theme";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onCancel} activeOpacity={1} />
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnCancel]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                destructive ? styles.btnDestructive : styles.btnConfirm,
              ]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { colors, radius } = theme;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  backdrop: {
    position: "absolute",
    inset: 0,
  },
  modal: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  title: {
    fontFamily: theme.fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  message: {
    fontFamily: theme.fonts.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  btnCancel: {
    backgroundColor: colors.glassMedium,
  },
  btnConfirm: {
    backgroundColor: colors.blue,
  },
  btnDestructive: {
    backgroundColor: colors.error,
  },
  cancelText: {
    fontFamily: theme.fonts.bodyBold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  confirmText: {
    fontFamily: theme.fonts.bodyBold,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
