import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";

interface BottomSheetItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  /** If true, renders label in error/danger colour */
  danger?: boolean;
}

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  items: BottomSheetItem[];
}

export function BottomSheet({ visible, onClose, title, items }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableWithoutFeedback>
            <View style={styles.content}>
              {/* Drag handle */}
              <View style={styles.handle} />

              {title && <Text style={styles.title}>{title}</Text>}

              {items.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.item,
                    index === items.length - 1 && styles.itemLast,
                  ]}
                  onPress={() => {
                    item.onPress();
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemLeft}>
                    <View
                      style={[
                        styles.iconBox,
                        item.danger && styles.iconBoxDanger,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={
                          item.danger
                            ? theme.colors.error
                            : theme.colors.textSecondary
                        }
                      />
                    </View>
                    <Text
                      style={[
                        styles.itemLabel,
                        item.danger && styles.itemLabelDanger,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>

                  <View style={styles.itemRight}>
                    {item.value && <Text style={styles.itemValue}>{item.value}</Text>}
                    {!item.danger && (
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={theme.colors.textDim}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const { colors, radius, fonts } = theme;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  safeArea: {
    flex: 1,
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl2,
    borderTopRightRadius: radius.xl2,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassMedium,
    alignSelf: "center",
    marginBottom: 18,
  },
  title: {
    fontFamily: fonts.bodyMedium,
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassLight,
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassMedium,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBoxDanger: {
    backgroundColor: colors.errorBg,
  },
  itemLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  itemLabelDanger: {
    color: colors.error,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemValue: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 13,
  },
});
