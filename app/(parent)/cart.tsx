import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, CartItem, Child, Menu, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { payzoneService, CartItemForPayment } from '@/lib/payzone';
import { ArrowLeft, Trash2, ShoppingCart, CreditCard, Lock, User, FlaskConical } from 'lucide-react-native';

interface CartItemWithDetails extends CartItem {
  child: Child;
  menu: Menu;
}

export default function CartScreen() {
  const [parent, setParent] = useState<Parent | null>(null);
  const [cartItems, setCartItems] = useState<CartItemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadCartData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCartData();
    }, [])
  );

  const loadCartData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }

      setParent(currentParent);

      const { data: items, error } = await supabase
        .from('cart_items')
        .select('*')
        .eq('parent_id', currentParent.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (items && items.length > 0) {
        const itemsWithDetails = await Promise.all(
          items.map(async (item) => {
            const [childData, menuData] = await Promise.all([
              supabase.from('children').select('*').eq('id', item.child_id).single(),
              supabase.from('menus').select('*').eq('id', item.menu_id).single(),
            ]);

            return {
              ...item,
              child: childData.data,
              menu: menuData.data,
            } as CartItemWithDetails;
          })
        );

        setCartItems(itemsWithDetails.filter(item => item.child && item.menu));
      }
    } catch (err) {
      console.error('Error loading cart:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setCartItems(cartItems.filter(item => item.id !== itemId));
      Alert.alert('Succès', 'Article retiré du panier');
    } catch (err) {
      console.error('Error removing item:', err);
      Alert.alert('Erreur', 'Erreur lors de la suppression');
    }
  };

  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => sum + Number(item.total_price), 0);
  };

  const handlePayment = async () => {
    if (cartItems.length === 0 || !parent) return;

    setProcessingPayment(true);
    try {
      // Préparer les données du panier pour PayZone
      const cartItemsForPayment: CartItemForPayment[] = cartItems.map(item => ({
        id: item.id,
        child_id: item.child_id,
        menu_id: item.menu_id,
        date: item.date,
        supplements: item.supplements || [],
        annotations: item.annotations,
        total_price: item.total_price,
        child: {
          first_name: item.child.first_name,
          last_name: item.child.last_name,
        },
        menu: {
          meal_name: item.menu.meal_name,
        },
      }));

      const totalAmount = calculateTotal();

      // Initialiser le paiement PayZone
      const response = await payzoneService.initializePayment(
        parent.id,
        cartItemsForPayment,
        totalAmount,
        parent.email || undefined,
        `${parent.first_name} ${parent.last_name}`
      );

      if (!response.success || !response.paywallUrl || !response.payload || !response.signature) {
        throw new Error(response.error || 'Erreur lors de l\'initialisation du paiement');
      }

      // Naviguer vers l'écran de paiement avec les paramètres PayZone
      router.push({
        pathname: '/(parent)/payment',
        params: {
          paywallUrl: response.paywallUrl,
          payload: response.payload,
          signature: response.signature,
          orderId: response.orderId,
        },
      });

    } catch (err) {
      console.error('Error processing payment:', err);
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Erreur lors de l\'initialisation du paiement'
      );
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleTestOrder = async () => {
    if (cartItems.length === 0 || !parent) return;

    Alert.alert(
      'Commande test',
      'Créer les réservations sans passer par le paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setProcessingPayment(true);
            try {
              const reservations = cartItems.map(item => ({
                parent_id: parent.id,
                child_id: item.child_id,
                menu_id: item.menu_id,
                date: item.date,
                supplements: item.supplements || [],
                annotations: item.annotations,
                total_price: item.total_price,
                payment_status: 'paid',
                payment_intent_id: `TEST_${Date.now()}`,
              }));

              const { error: insertError } = await supabase
                .from('reservations')
                .insert(reservations);

              if (insertError) throw insertError;

              // Delete cart items
              const cartItemIds = cartItems.map(item => item.id);
              await supabase.from('cart_items').delete().in('id', cartItemIds);

              // Send test notifications
              try {
                const totalAmount = calculateTotal();

                // P4: parent notification
                await supabase.functions.invoke('send-notification', {
                  body: {
                    userId: parent.id,
                    userType: 'parent',
                    title: 'Paiement confirmé ✓',
                    body: `Votre paiement de ${totalAmount.toFixed(2)} MAD a été confirmé. Les réservations sont enregistrées.`,
                    notificationType: 'payment_confirmed',
                    data: { orderId: `TEST_${Date.now()}`, amount: totalAmount },
                  },
                });

                // S6: school notifications
                const schoolIds = [...new Set(cartItems.map(item => item.menu.school_id).filter(Boolean))];
                if (schoolIds.length > 0) {
                  await supabase.functions.invoke('send-notification', {
                    body: {
                      userIds: schoolIds,
                      userType: 'school',
                      title: 'Nouvelles réservations',
                      body: `${cartItems.length} nouvelle(s) réservation(s) enregistrée(s).`,
                      notificationType: 'new_reservation_school',
                      data: { count: cartItems.length },
                    },
                  });
                }

                // Pr7: provider notifications
                const menuIds = [...new Set(cartItems.map(item => item.menu_id))];
                const { data: menus } = await supabase
                  .from('menus')
                  .select('provider_id')
                  .in('id', menuIds);
                const providerIds = [...new Set((menus || []).map(m => m.provider_id).filter(Boolean))];
                if (providerIds.length > 0) {
                  await supabase.functions.invoke('send-notification', {
                    body: {
                      userIds: providerIds,
                      userType: 'provider',
                      title: 'Nouvelles commandes',
                      body: `${cartItems.length} nouvelle(s) commande(s) reçue(s).`,
                      notificationType: 'new_order_provider',
                      data: { count: cartItems.length },
                    },
                  });
                }
              } catch (notifError) {
                console.error('Error sending test notifications:', notifError);
              }

              Alert.alert('Succès', 'Commande test créée avec succès !', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err) {
              console.error('Error creating test order:', err);
              Alert.alert('Erreur', 'Erreur lors de la création de la commande test');
            } finally {
              setProcessingPayment(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topSection}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <ShoppingCart size={20} color="#FFFFFF" />
          <Text style={styles.badgeText}>Mon Panier</Text>
        </View>
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShoppingCart size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Votre panier est vide</Text>
          <Text style={styles.emptyText}>Ajoutez des repas pour commencer</Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.back()}
          >
            <Text style={styles.browseButtonText}>Parcourir les menus</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {Object.entries(
              cartItems.reduce((groups, item) => {
                const key = item.child_id;
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
                return groups;
              }, {} as Record<string, CartItemWithDetails[]>)
            ).map(([childId, items]) => {
              const child = items[0].child;
              const childTotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
              return (
                <View key={childId} style={styles.childSection}>
                  <View style={styles.childSectionHeader}>
                    <View style={styles.childAvatar}>
                      <User size={20} color="#4F46E5" />
                    </View>
                    <View style={styles.childSectionInfo}>
                      <Text style={styles.childSectionName}>
                        {child.first_name} {child.last_name}
                      </Text>
                      <Text style={styles.childSectionCount}>
                        {items.length} repas — {childTotal.toFixed(2)} DH
                      </Text>
                    </View>
                  </View>

                  {items.map((item) => (
                    <View key={item.id} style={styles.cartItem}>
                      <View style={styles.itemHeader}>
                        <Text style={styles.menuName}>{item.menu.meal_name}</Text>
                        <TouchableOpacity
                          onPress={() => removeFromCart(item.id)}
                          style={styles.deleteButton}
                        >
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.menuDate}>
                        {new Date(item.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </Text>

                      {item.menu.description && (
                        <Text style={styles.menuDescription}>{item.menu.description}</Text>
                      )}

                      {item.supplements && item.supplements.length > 0 && (
                        <View style={styles.supplementsContainer}>
                          <Text style={styles.supplementsLabel}>Suppléments :</Text>
                          {item.supplements.map((supp: any, idx: number) => (
                            <Text key={idx} style={styles.supplementItem}>
                              • {supp.name} (+{Number(supp.price).toFixed(2)} DH)
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

                      <View style={styles.itemFooter}>
                        <Text style={styles.itemPrice}>{Number(item.total_price).toFixed(2)} DH</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total (TTC)</Text>
              <Text style={styles.totalAmount}>{calculateTotal().toFixed(2)} DH</Text>
            </View>
            <TouchableOpacity
              style={[styles.testButton, processingPayment && styles.payButtonDisabled]}
              onPress={handleTestOrder}
              disabled={processingPayment}
            >
              <FlaskConical size={18} color="#FFFFFF" />
              <Text style={styles.payButtonText}>Commande test (sans paiement)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.payButton, processingPayment && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={processingPayment}
            >
              {processingPayment ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Lock size={18} color="#FFFFFF" />
                  <Text style={styles.payButtonText}>Payer par carte bancaire</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.securePaymentNote}>
              <Text style={styles.securePaymentText}>Paiement sécurisé par PayZone</Text>
            </View>
          </View>
        </>
      )}
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
    backgroundColor: '#F9FAFB',
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignSelf: 'flex-start',
    gap: 8,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  childSection: {
    marginBottom: 20,
  },
  childSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#4F46E5',
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childSectionInfo: {
    flex: 1,
  },
  childSectionName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  childSectionCount: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  cartItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteButton: {
    padding: 4,
  },
  itemDetails: {
    marginBottom: 12,
  },
  menuName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  menuDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  supplementsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  supplementsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  supplementItem: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  annotationsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  annotationsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  annotationsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  itemFooter: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 8,
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 0,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 8,
  },
  testButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 0,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  payButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  securePaymentNote: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  securePaymentText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
