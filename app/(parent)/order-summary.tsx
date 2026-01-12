import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle, Calendar, User, UtensilsCrossed, Home } from 'lucide-react-native';
import { payzoneService, PendingPayment } from '@/lib/payzone';

export default function OrderSummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId: string }>();
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderDetails();
  }, []);

  const loadOrderDetails = async () => {
    if (!params.orderId) {
      router.replace('/(parent)/');
      return;
    }

    try {
      const paymentData = await payzoneService.checkPaymentStatus(params.orderId);
      if (paymentData && paymentData.status === 'completed') {
        setPayment(paymentData);
      } else {
        // Si le paiement n'est pas complété, rediriger
        router.replace('/(parent)/');
      }
    } catch (error) {
      console.error('Error loading order:', error);
      router.replace('/(parent)/');
    } finally {
      setLoading(false);
    }
  };

  const handleGoHome = () => {
    router.replace('/(parent)/');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (price: number) => {
    return `${price.toFixed(2)} DH`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Chargement de votre commande...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!payment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Commande introuvable</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoHome}>
            <Home size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header avec icône de succès */}
        <View style={styles.header}>
          <View style={styles.successIconContainer}>
            <CheckCircle size={64} color="#10B981" />
          </View>
          <Text style={styles.title}>Commande confirmée !</Text>
          <Text style={styles.subtitle}>
            Votre paiement a été effectué avec succès
          </Text>
        </View>

        {/* Informations de la commande */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations de commande</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Numéro de commande</Text>
              <Text style={styles.infoValue}>{payment.order_id}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date de commande</Text>
              <Text style={styles.infoValue}>
                {new Date(payment.created_at).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID de transaction</Text>
              <Text style={styles.infoValue}>{payment.payzone_transaction_id}</Text>
            </View>
          </View>
        </View>

        {/* Détails des réservations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails des réservations</Text>
          {payment.cart_items.map((item, index) => (
            <View key={index} style={styles.reservationCard}>
              <View style={styles.reservationHeader}>
                <View style={styles.iconCircle}>
                  <UtensilsCrossed size={20} color="#4F46E5" />
                </View>
                <View style={styles.reservationHeaderText}>
                  <Text style={styles.menuName}>{item.menu.meal_name}</Text>
                  <View style={styles.childInfo}>
                    <User size={14} color="#6B7280" />
                    <Text style={styles.childName}>
                      {item.child.first_name} {item.child.last_name}
                    </Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>{formatPrice(item.total_price)}</Text>
              </View>

              <View style={styles.reservationDetails}>
                <View style={styles.dateRow}>
                  <Calendar size={16} color="#6B7280" />
                  <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                </View>

                {item.supplements && Array.isArray(item.supplements) && item.supplements.length > 0 && (
                  <View style={styles.supplementsContainer}>
                    <Text style={styles.supplementsLabel}>Suppléments :</Text>
                    {item.supplements.map((supplement: any, idx: number) => (
                      <Text key={idx} style={styles.supplementText}>
                        • {supplement.name} (+{formatPrice(supplement.price)})
                      </Text>
                    ))}
                  </View>
                )}

                {item.annotations && (
                  <View style={styles.annotationsContainer}>
                    <Text style={styles.annotationsLabel}>Note :</Text>
                    <Text style={styles.annotationsText}>{item.annotations}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total payé</Text>
            <Text style={styles.totalAmount}>{formatPrice(payment.total_amount)}</Text>
          </View>
        </View>

        {/* Message de confirmation */}
        <View style={styles.confirmationMessage}>
          <Text style={styles.confirmationText}>
            Vos réservations ont été enregistrées et sont maintenant visibles dans votre historique.
          </Text>
        </View>

        {/* Bouton retour à l'accueil */}
        <TouchableOpacity style={styles.primaryButton} onPress={handleGoHome}>
          <Home size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 16,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  reservationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reservationHeaderText: {
    flex: 1,
  },
  menuName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  childName: {
    fontSize: 14,
    color: '#6B7280',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  reservationDetails: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  supplementsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  supplementsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  supplementText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 8,
  },
  annotationsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  annotationsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  annotationsText: {
    fontSize: 13,
    color: '#92400E',
    fontStyle: 'italic',
  },
  totalSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  confirmationMessage: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  confirmationText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    marginBottom: 32,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
