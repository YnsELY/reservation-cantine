import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, CartItem, Child, Menu, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Trash2, ShoppingCart, CreditCard } from 'lucide-react-native';

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
    if (cartItems.length === 0) return;

    setProcessingPayment(true);
    try {
      const reservations = cartItems.map(item => ({
        parent_id: parent?.id,
        child_id: item.child_id,
        menu_id: item.menu_id,
        date: item.date,
        supplements: item.supplements || [],
        annotations: item.annotations,
        total_price: item.total_price,
        payment_status: 'paid',
      }));

      const { error: insertError } = await supabase
        .from('reservations')
        .insert(reservations);

      if (insertError) throw insertError;

      const cartItemIds = cartItems.map(item => item.id);
      const { error: deleteError } = await supabase
        .from('cart_items')
        .delete()
        .in('id', cartItemIds);

      if (deleteError) throw deleteError;

      Alert.alert(
        'Succès',
        'Votre commande a été confirmée !',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(parent)/history'),
          },
        ]
      );
    } catch (err) {
      console.error('Error processing payment:', err);
      Alert.alert('Erreur', 'Erreur lors du paiement');
    } finally {
      setProcessingPayment(false);
    }
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
            {cartItems.map((item) => (
              <View key={item.id} style={styles.cartItem}>
                <View style={styles.itemHeader}>
                  <Text style={styles.childName}>
                    {item.child.first_name} {item.child.last_name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeFromCart(item.id)}
                    style={styles.deleteButton}
                  >
                    <Trash2 size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.itemDetails}>
                  <Text style={styles.menuName}>{item.menu.meal_name}</Text>
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
                          • {supp.name} (+{Number(supp.price).toFixed(2)} €)
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

                <View style={styles.itemFooter}>
                  <Text style={styles.itemPrice}>{Number(item.total_price).toFixed(2)} €</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>{calculateTotal().toFixed(2)} €</Text>
            </View>
            <TouchableOpacity
              style={[styles.payButton, processingPayment && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={processingPayment}
            >
              {processingPayment ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <CreditCard size={20} color="#FFFFFF" />
                  <Text style={styles.payButtonText}>Payer et commander</Text>
                </>
              )}
            </TouchableOpacity>
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
  cartItem: {
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
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
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
});
