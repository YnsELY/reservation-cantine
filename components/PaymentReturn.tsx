import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { payzoneService } from '@/lib/payzone';

/** The same verified result screen handles all bank return URLs. */
export default function PaymentReturn() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Vérification du paiement…');
  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        if (!orderId || Array.isArray(orderId)) throw new Error('Référence de paiement manquante. Retrouvez votre suivi dans le panier.');
        const result = await payzoneService.reconcilePayment(orderId);
        const payment = result.payment.status === 'pending'
          ? await payzoneService.waitForPaymentConfirmation(orderId, 15000) || result.payment
          : result.payment;
        if (!active) return;
        if (payment.status === 'completed') {
          router.replace({ pathname: '/(parent)/order-summary', params: { orderId } });
          return;
        }
        setMessage(payment.released_at
          ? 'Le paiement n’a pas abouti. Les repas et le crédit réservé sont débloqués. Vérifiez le panier avant de recommencer.'
          : payment.payzone_status === 'CHARGED'
            ? 'Votre paiement a été reçu. La commande doit être vérifiée : contactez le support avec cette référence avant de payer à nouveau.'
            : result.message || 'Le résultat bancaire doit encore être confirmé. Retrouvez le suivi de ce paiement dans le panier.');
      } catch (error) {
        if (active) setMessage((error as Error).message);
      } finally { if (active) setLoading(false); }
    };
    void verify();
    return () => { active = false; };
  }, [orderId]);
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Suivi de votre paiement</Text>
        {loading && <ActivityIndicator color="#0E5FC0" />}
        <Text style={styles.message}>{message}</Text>
        <Text selectable style={styles.reference}>Référence : {orderId || 'indisponible'}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(parent)/cart')}>
          <Text style={styles.buttonText}>Retrouver mon panier</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#F4F6FB' },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, gap: 18 },
  title: { color: '#111827', fontSize: 22, fontWeight: '700' },
  message: { color: '#374151', fontSize: 16, lineHeight: 24 },
  reference: { color: '#6B7280', fontSize: 12 },
  button: { backgroundColor: '#0E5FC0', padding: 16, borderRadius: 10, minHeight: 48 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
});
