import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Child, Menu, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ChevronLeft, ShoppingCart, AlertCircle, CheckSquare, Square } from 'lucide-react-native';

interface Supplement {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
}

export default function MenuDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [parent, setParent] = useState<Parent | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [addingToCart, setAddingToCart] = useState(false);

  const menuId = params.menuId as string;
  const childId = params.childId as string;
  const date = params.date as string;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }
      setParent(currentParent);

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .maybeSingle();

      if (childError) throw childError;
      setChild(childData);

      const { data: menuData, error: menuError } = await supabase
        .from('menus')
        .select('*')
        .eq('id', menuId)
        .maybeSingle();

      if (menuError) throw menuError;
      setMenu(menuData);

      console.log('Menu data:', menuData);
      console.log('Menu school_id:', menuData?.school_id);

      if (menuData?.school_id) {
        const { data: supplementsData, error: supplementsError } = await supabase
          .from('supplements')
          .select('*')
          .eq('school_id', menuData.school_id)
          .eq('available', true)
          .order('price', { ascending: true });

        console.log('Supplements data:', supplementsData);
        console.log('Supplements error:', supplementsError);

        if (!supplementsError && supplementsData) {
          setSupplements(supplementsData);
          console.log('Supplements set:', supplementsData.length);
        }
      } else {
        console.log('No school_id found in menu');
      }

      setError('');
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const toggleSupplement = (supplementId: string) => {
    setSelectedSupplements(prev => {
      if (prev.includes(supplementId)) {
        return prev.filter(id => id !== supplementId);
      } else {
        return [...prev, supplementId];
      }
    });
  };

  const handleAddToCart = async () => {
    if (!parent || !child || !menu) return;

    setAddingToCart(true);
    setError('');

    try {
      const selectedSupplementsData = supplements
        .filter(s => selectedSupplements.includes(s.id))
        .map(s => ({ id: s.id, name: s.name, price: s.price }));

      const supplementsTotal = selectedSupplementsData.reduce((sum, s) => sum + s.price, 0);
      const totalPrice = menu.price + supplementsTotal;

      const supplementsJson = selectedSupplementsData.length > 0 ? { items: selectedSupplementsData } : null;

      const { error } = await supabase
        .from('cart_items')
        .insert({
          parent_id: parent.id,
          child_id: child.id,
          menu_id: menu.id,
          date: date,
          total_price: totalPrice,
          supplements: supplementsJson,
          annotations: specialInstructions || null,
        });

      if (error) throw error;

      router.back();
    } catch (err) {
      console.error('Error adding to cart:', err);
      setError('Erreur lors de l\'ajout au panier');
    } finally {
      setAddingToCart(false);
    }
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  if (!menu || !child) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#EF4444" />
          <Text style={styles.errorText}>Menu introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedSupplementsData = supplements.filter(s => selectedSupplements.includes(s.id));
  const supplementsTotal = selectedSupplementsData.reduce((sum, s) => sum + s.price, 0);
  const totalPrice = menu.price + supplementsTotal;

  console.log('Rendering with supplements:', supplements.length);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color="#EF4444" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.childInfo}>
          <View style={styles.childAvatar}>
            <Text style={styles.childAvatarText}>
              {child.first_name.charAt(0)}{child.last_name.charAt(0)}
            </Text>
          </View>
          <View>
            <Text style={styles.childLabel}>Réservation pour</Text>
            <Text style={styles.childName}>
              {child.first_name} {child.last_name}
            </Text>
          </View>
        </View>

        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>{menu.meal_name}</Text>

          {menu.description && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Description</Text>
                <Text style={styles.sectionText}>{menu.description}</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date</Text>
            <Text style={styles.sectionText}>{formatDate(date)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Prix unitaire</Text>
            <Text style={styles.priceText}>{menu.price.toFixed(2)} €</Text>
          </View>
        </View>

        {supplements.length > 0 && (
          <View style={styles.supplementsCard}>
            <Text style={styles.supplementsTitle}>Suppléments disponibles</Text>
            {supplements.map((supplement) => {
              const isSelected = selectedSupplements.includes(supplement.id);
              return (
                <TouchableOpacity
                  key={supplement.id}
                  style={styles.supplementItem}
                  onPress={() => toggleSupplement(supplement.id)}
                >
                  <View style={styles.supplementLeft}>
                    {isSelected ? (
                      <CheckSquare size={24} color="#111827" />
                    ) : (
                      <Square size={24} color="#9CA3AF" />
                    )}
                    <View style={styles.supplementInfo}>
                      <Text style={styles.supplementName}>{supplement.name}</Text>
                      {supplement.description && (
                        <Text style={styles.supplementDescription}>{supplement.description}</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.supplementPrice}>+{supplement.price.toFixed(2)} €</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Instructions spéciales (optionnel)</Text>
          <TextInput
            style={[styles.textInput, styles.textInputMultiline]}
            placeholder="Ex: Allergies, préférences alimentaires..."
            placeholderTextColor="#9CA3AF"
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>{totalPrice.toFixed(2)} €</Text>
        </View>
        <TouchableOpacity
          style={[styles.addToCartButton, addingToCart && styles.addToCartButtonDisabled]}
          onPress={handleAddToCart}
          disabled={addingToCart}
        >
          {addingToCart ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <ShoppingCart size={20} color="#FFFFFF" />
              <Text style={styles.addToCartButtonText}>Ajouter au panier</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginTop: 16,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  childAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  childName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  priceText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  supplementsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  supplementsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  supplementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  supplementLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  supplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  supplementDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  supplementPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 12,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 48,
  },
  textInputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  totalPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  addToCartButton: {
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  addToCartButtonDisabled: {
    opacity: 0.6,
  },
  addToCartButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
