import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Child, Menu, Supplement, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Plus, Minus, Check, ShoppingCart } from 'lucide-react-native';

export default function ReservationScreen() {
  const { menuId, date, menuName, menuPrice, menuDescription } = useLocalSearchParams<{
    menuId: string;
    date: string;
    menuName: string;
    menuPrice: string;
    menuDescription: string;
  }>();
  const router = useRouter();

  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set());
  const [selectedSupplements, setSelectedSupplements] = useState<Record<string, Set<string>>>({});
  const [annotations, setAnnotations] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [menuId]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }

      setParent(currentParent);

      const { data: menuData, error: menuError } = await supabase
        .from('menus')
        .select('*')
        .eq('id', menuId)
        .maybeSingle();

      if (menuError || !menuData) {
        Alert.alert('Erreur', 'Menu introuvable');
        router.back();
        return;
      }

      setMenu(menuData);

      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', currentParent.id)
        .order('first_name');

      if (childrenError) throw childrenError;
      setChildren(childrenData || []);

      const mockSupplements: Supplement[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440100',
          name: 'Dessert',
          price: 1.50,
          school_id: '550e8400-e29b-41d4-a716-446655440000',
          available: true,
          created_at: new Date().toISOString(),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440101',
          name: 'Fromage',
          price: 1.00,
          school_id: '550e8400-e29b-41d4-a716-446655440000',
          available: true,
          created_at: new Date().toISOString(),
        },
      ];

      setSupplements(mockSupplements);

    } catch (err) {
      console.error('Error loading data:', err);
      Alert.alert('Erreur', 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const toggleChild = (childId: string) => {
    const newSelected = new Set(selectedChildren);
    if (newSelected.has(childId)) {
      newSelected.delete(childId);
      const newSupplements = { ...selectedSupplements };
      delete newSupplements[childId];
      setSelectedSupplements(newSupplements);
      const newAnnotations = { ...annotations };
      delete newAnnotations[childId];
      setAnnotations(newAnnotations);
    } else {
      newSelected.add(childId);
    }
    setSelectedChildren(newSelected);
  };

  const toggleSupplement = (childId: string, supplementId: string) => {
    const newSupplements = { ...selectedSupplements };
    if (!newSupplements[childId]) {
      newSupplements[childId] = new Set();
    }

    if (newSupplements[childId].has(supplementId)) {
      newSupplements[childId].delete(supplementId);
    } else {
      newSupplements[childId].add(supplementId);
    }

    setSelectedSupplements(newSupplements);
  };

  const calculateTotal = () => {
    if (!menu) return 0;

    let total = 0;
    selectedChildren.forEach(childId => {
      total += menu.price;

      const childSupplements = selectedSupplements[childId];
      if (childSupplements) {
        childSupplements.forEach(suppId => {
          const supplement = supplements.find(s => s.id === suppId);
          if (supplement) {
            total += supplement.price;
          }
        });
      }
    });

    return total;
  };

  const handleSubmit = async () => {
    if (selectedChildren.size === 0) {
      Alert.alert('Attention', 'Veuillez sélectionner au moins un enfant');
      return;
    }

    if (!menu || !parent) return;

    setSubmitting(true);

    try {
      const cartItems = Array.from(selectedChildren).map(childId => {
        const childSupplements = selectedSupplements[childId];
        const supplementIds = childSupplements ? Array.from(childSupplements) : [];

        let childTotal = menu.price;
        const selectedSupplementsData = supplementIds.map(suppId => {
          const supplement = supplements.find(s => s.id === suppId);
          if (supplement) {
            childTotal += supplement.price;
            return {
              id: supplement.id,
              name: supplement.name,
              price: supplement.price,
            };
          }
          return null;
        }).filter(Boolean);

        return {
          parent_id: parent.id,
          child_id: childId,
          menu_id: menu.id,
          date: menu.date,
          supplements: selectedSupplementsData,
          annotations: annotations[childId] || null,
          total_price: childTotal,
        };
      });

      console.log('Cart items to insert:', JSON.stringify(cartItems, null, 2));
      console.log('Menu ID:', menu.id);

      const { error } = await supabase
        .from('cart_items')
        .insert(cartItems);

      if (error) throw error;

      Alert.alert(
        'Succès',
        'Articles ajoutés au panier !',
        [
          {
            text: 'Voir le panier',
            onPress: () => router.push('/(parent)/cart'),
          },
          {
            text: 'Continuer',
            onPress: () => router.back(),
          },
        ]
      );

    } catch (err) {
      console.error('Error adding to cart:', err);
      Alert.alert('Erreur', 'Erreur lors de l\'ajout au panier');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!menu) {
    return null;
  }

  const total = calculateTotal();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.menuSection}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.badgesContainer}>
            <View style={styles.sectionTitleBadge}>
              <Text style={styles.sectionTitle}>Détails du menu</Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{new Date(menu.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>
            </View>
          </View>
          <Text style={styles.menuName}>{menu.meal_name}</Text>
          <View style={styles.menuCard}>
            {menu.description && (
              <Text style={styles.menuDescription}>{menu.description}</Text>
            )}
            <Text style={styles.menuPrice}>Prix: {menu.price.toFixed(2)} €</Text>
            {menu.allergens && menu.allergens.length > 0 && (
              <View style={styles.allergensContainer}>
                <Text style={styles.allergensLabel}>Allergènes:</Text>
                <Text style={styles.allergensText}>{menu.allergens.join(', ')}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.childrenSection}>
          <Text style={styles.childrenSectionTitle}>Sélectionnez les enfants</Text>
          {children.map(child => {
            const isSelected = selectedChildren.has(child.id);
            return (
              <View key={child.id} style={styles.childContainer}>
                <TouchableOpacity
                  style={[styles.childCard, isSelected && styles.childCardSelected]}
                  onPress={() => toggleChild(child.id)}
                >
                  <View style={styles.childHeader}>
                    <View style={styles.childInfo}>
                      <Text style={styles.childName}>
                        {child.first_name} {child.last_name}
                      </Text>
                      {child.allergies.length > 0 && (
                        <Text style={styles.childAllergies}>
                          ⚠️ {child.allergies.join(', ')}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Check size={16} color="#FFFFFF" />}
                    </View>
                  </View>
                </TouchableOpacity>

                {isSelected && (
                  <View style={styles.childOptions}>
                    {supplements.length > 0 && (
                      <View style={styles.supplementsSection}>
                        <Text style={styles.supplementsTitle}>Suppléments</Text>
                        {supplements.map(supplement => {
                          const isSupplementSelected = selectedSupplements[child.id]?.has(supplement.id);
                          return (
                            <TouchableOpacity
                              key={supplement.id}
                              style={[
                                styles.supplementCard,
                                isSupplementSelected && styles.supplementCardSelected
                              ]}
                              onPress={() => toggleSupplement(child.id, supplement.id)}
                            >
                              <View style={styles.supplementInfo}>
                                <Text style={styles.supplementName}>{supplement.name}</Text>
                                <Text style={styles.supplementPrice}>+{supplement.price.toFixed(2)} €</Text>
                              </View>
                              <View style={[styles.supplementCheckbox, isSupplementSelected && styles.supplementCheckboxSelected]}>
                                {isSupplementSelected && <Check size={14} color="#FFFFFF" />}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    <View style={styles.annotationsSection}>
                      <Text style={styles.annotationsTitle}>Notes / Annotations</Text>
                      <TextInput
                        style={styles.annotationsInput}
                        placeholder="Préférences, allergies supplémentaires..."
                        value={annotations[child.id] || ''}
                        onChangeText={(text) => setAnnotations({ ...annotations, [child.id]: text })}
                        multiline
                        numberOfLines={3}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{total.toFixed(2)} €</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitButton, (selectedChildren.size === 0 || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={selectedChildren.size === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.submitButtonContent}>
              <ShoppingCart size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Ajouter au panier</Text>
            </View>
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
  menuName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  menuDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  menuSection: {
    padding: 16,
  },
  backButton: {
    padding: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dateBadge: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  menuPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  allergensContainer: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
  },
  allergensLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  allergensText: {
    fontSize: 12,
    color: '#92400E',
  },
  childrenSection: {
    padding: 16,
  },
  childrenSectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 20,
  },
  childContainer: {
    marginBottom: 16,
  },
  childCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  childCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  childAllergies: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  childOptions: {
    marginTop: 12,
    paddingLeft: 16,
  },
  supplementsSection: {
    marginBottom: 12,
  },
  supplementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  supplementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  supplementCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  supplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  supplementPrice: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  supplementCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplementCheckboxSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  annotationsSection: {
    marginTop: 8,
  },
  annotationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  annotationsInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
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
    color: '#4F46E5',
    paddingHorizontal: 8,
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
