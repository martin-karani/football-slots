import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onChoice: (choice: 'home' | 'away') => void;
  winAmount: number;
}

export function GambleModal({ visible, onClose, onChoice, winAmount }: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modal}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>🎲 DOUBLE OR NOTHING?</Text>
                <Text style={styles.subtitle}>
                  Risk your {winAmount} win to double it!
                </Text>
              </View>

              {/* Choice Buttons */}
              <View style={styles.choices}>
                <TouchableOpacity
                  style={[styles.choiceButton, styles.homeButton]}
                  onPress={() => {
                    onChoice('home');
                    onClose();
                  }}
                >
                  <Text style={styles.choiceIcon}>🏠</Text>
                  <Text style={styles.choiceLabel}>HOME</Text>
                  <Text style={styles.choiceRange}>1 – 7</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.choiceButton, styles.awayButton]}
                  onPress={() => {
                    onChoice('away');
                    onClose();
                  }}
                >
                  <Text style={styles.choiceIcon}>✈️</Text>
                  <Text style={styles.choiceLabel}>AWAY</Text>
                  <Text style={styles.choiceRange}>8 – 14</Text>
                </TouchableOpacity>
              </View>

              {/* Payout Info */}
              <View style={styles.payoutInfo}>
                <Text style={styles.payoutLabel}>If you win:</Text>
                <Text style={styles.payoutAmount}>+{winAmount * 2}</Text>
              </View>

              {/* Collect Button */}
              <TouchableOpacity style={styles.collectButton} onPress={onClose}>
                <Text style={styles.collectText}>Collect {winAmount} Winnings</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#2d1b4e',
    width: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  choices: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    width: '100%',
  },
  choiceButton: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  homeButton: {
    backgroundColor: 'rgba(65,105,225,0.3)',
    borderWidth: 2,
    borderColor: '#4169E1',
  },
  awayButton: {
    backgroundColor: 'rgba(220,20,60,0.3)',
    borderWidth: 2,
    borderColor: '#DC143C',
  },
  choiceIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  choiceLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  choiceRange: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
  },
  payoutInfo: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    alignItems: 'center',
    width: '100%',
  },
  payoutLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  payoutAmount: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  collectButton: {
    padding: 12,
  },
  collectText: {
    color: '#aaa',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
