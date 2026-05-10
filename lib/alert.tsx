import { useEffect, useState } from 'react';
import {
  Alert as RNAlert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

interface AlertPayload {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (payload: AlertPayload) => void;

let listener: Listener | null = null;
let nextId = 1;

const subscribe = (l: Listener) => {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
};

export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  const finalButtons: AlertButton[] =
    buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];

  if (Platform.OS !== 'web') {
    RNAlert.alert(title, message, finalButtons as any);
    return;
  }

  if (listener) {
    listener({ id: nextId++, title, message, buttons: finalButtons });
    return;
  }

  // Fallback if provider isn't mounted yet
  if (typeof window !== 'undefined') {
    if (finalButtons.length > 1) {
      const ok = window.confirm(
        `${title}${message ? '\n\n' + message : ''}`
      );
      if (ok) {
        const okButton =
          finalButtons.find((b) => b.style !== 'cancel') ?? finalButtons[0];
        okButton.onPress?.();
      } else {
        const cancelButton =
          finalButtons.find((b) => b.style === 'cancel') ??
          finalButtons[finalButtons.length - 1];
        cancelButton.onPress?.();
      }
    } else {
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
      finalButtons[0].onPress?.();
    }
  }
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<AlertPayload | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return subscribe((payload) => setCurrent(payload));
  }, []);

  const handlePress = (button: AlertButton) => {
    setCurrent(null);
    button.onPress?.();
  };

  return (
    <>
      {children}
      {Platform.OS === 'web' && (
        <Modal
          visible={!!current}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!current) return;
            const cancel =
              current.buttons.find((b) => b.style === 'cancel') ??
              current.buttons[current.buttons.length - 1];
            handlePress(cancel);
          }}
        >
          <View style={styles.backdrop}>
            <View style={styles.dialog}>
              {!!current?.title && (
                <Text style={styles.title}>{current.title}</Text>
              )}
              {!!current?.message && (
                <Text style={styles.message}>{current.message}</Text>
              )}
              <View
                style={[
                  styles.buttonRow,
                  (current?.buttons.length ?? 0) > 2 && styles.buttonColumn,
                ]}
              >
                {current?.buttons.map((button, idx) => {
                  const isCancel = button.style === 'cancel';
                  const isDestructive = button.style === 'destructive';
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.button,
                        (current.buttons.length ?? 0) > 2 && styles.buttonFull,
                      ]}
                      onPress={() => handlePress(button)}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          isCancel && styles.buttonTextCancel,
                          isDestructive && styles.buttonTextDestructive,
                        ]}
                      >
                        {button.text ?? 'OK'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 360,
    paddingTop: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#E5E7EB',
  },
  buttonFull: {
    flex: undefined,
    width: '100%',
    borderLeftWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  buttonText: {
    fontSize: 16,
    color: '#2563EB',
    fontWeight: '500',
  },
  buttonTextCancel: {
    color: '#6B7280',
  },
  buttonTextDestructive: {
    color: '#DC2626',
    fontWeight: '600',
  },
});
