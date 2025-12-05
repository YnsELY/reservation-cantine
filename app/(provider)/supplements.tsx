import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Plus, Trash2, Package, CheckCircle, XCircle } from 'lucide-react-native';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface Supplement {
  id: string;
  provider_id: string;
  school_id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  created_at: string;
  menu_id?: string | null;
  menu_name?: string | null;
}

interface GroupedSupplement extends Supplement {
  school_ids: string[];
  school_names: string[];
  supplement_ids: string[];
}

export default function ProviderSupplements() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [groupedSupplements, setGroupedSupplements] = useState<GroupedSupplement[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      setProvider(currentProvider);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(name)')
        .eq('provider_id', currentProvider.id);

      const schoolsList = (schoolAccess || []).map(sa => ({
        school_id: (sa as any).school_id,
        school_name: (sa as any).schools?.name || 'École',
      }));

      setSchools(schoolsList);

      if (schoolsList.length > 0) {
        await loadAllSupplements(schoolsList);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllSupplements = async (schoolsList: SchoolAccess[]) => {
    try {
      const schoolIds = schoolsList.map(s => s.school_id);

      const { data } = await supabase
        .from('provider_supplements')
        .select('*, schools(name), menus(meal_name)')
        .in('school_id', schoolIds)
        .order('name');

      const supplementsData = (data || []).map(s => ({
        ...s,
        menu_name: (s.menus as any)?.meal_name || null,
      }));

      setSupplements(supplementsData);

      const grouped = groupSupplementsByContent(supplementsData, schoolsList);
      setGroupedSupplements(grouped);
    } catch (err) {
      console.error('Error loading supplements:', err);
    }
  };

  const groupSupplementsByContent = (supplementsList: any[], schoolsList: SchoolAccess[]): GroupedSupplement[] => {
    const groups: { [key: string]: GroupedSupplement } = {};

    supplementsList.forEach((supplement) => {
      const key = `${supplement.name}-${supplement.price}-${supplement.description || ''}`;

      if (!groups[key]) {
        groups[key] = {
          ...supplement,
          school_ids: [supplement.school_id],
          school_names: [(supplement.schools as any)?.name || 'École'],
          supplement_ids: [supplement.id],
        };
      } else {
        groups[key].school_ids.push(supplement.school_id);
        groups[key].school_names.push((supplement.schools as any)?.name || 'École');
        groups[key].supplement_ids.push(supplement.id);
      }
    });

    return Object.values(groups);
  };

  const handleDeleteSupplement = async (supplementIds: string[], schoolNames: string[]) => {
    const isMultiple = supplementIds.length > 1;
    const message = isMultiple
      ? `Ce supplément sera supprimé pour ${schoolNames.length} école(s) : ${schoolNames.join(', ')}`
      : 'Êtes-vous sûr de vouloir supprimer ce supplément ?';

    Alert.alert(
      'Supprimer le supplément',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('provider_supplements').delete().in('id', supplementIds);
              await loadData();
            } catch (err) {
              console.error('Error deleting supplement:', err);
            }
          },
        },
      ]
    );
  };

  const toggleAvailability = async (supplementIds: string[], currentAvailability: boolean) => {
    try {
      await supabase
        .from('provider_supplements')
        .update({ available: !currentAvailability })
        .in('id', supplementIds);
      await loadData();
    } catch (err) {
      console.error('Error toggling availability:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Liste des suppléments</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/(provider)/add-supplement')}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {groupedSupplements.length === 0 ? (
            <View style={styles.emptyState}>
              <Package size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Aucun supplément</Text>
              <Text style={styles.emptySubtext}>Ajoutez des suppléments pour vos menus</Text>
            </View>
          ) : (
            <>
              {groupedSupplements.filter(s => !s.menu_id).length > 0 && (
                <>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>Suppléments génériques</Text>
                  </View>
                  {groupedSupplements.filter(s => !s.menu_id).map((supplement, index) => (
                    <View key={`${supplement.id}-${index}`} style={styles.supplementItem}>
                      <View style={styles.supplementItemContent}>
                        <View style={styles.supplementHeader}>
                          <Text style={styles.supplementItemName}>{supplement.name}</Text>
                          <View
                            style={[styles.statusBadge, supplement.available ? styles.statusAvailable : styles.statusUnavailable]}
                          >
                            {supplement.available ? (
                              <CheckCircle size={14} color="#10B981" />
                            ) : (
                              <XCircle size={14} color="#EF4444" />
                            )}
                            <Text style={[styles.statusText, supplement.available ? styles.statusTextAvailable : styles.statusTextUnavailable]}>
                              {supplement.available ? 'Actif' : 'Inactif'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.schoolBadge}>
                          <Text style={styles.schoolBadgeText}>
                            {supplement.school_ids.length === schools.length
                              ? 'Toutes les écoles'
                              : supplement.school_names.join(', ')}
                          </Text>
                        </View>
                        {supplement.description && (
                          <Text style={styles.supplementItemDescription}>{supplement.description}</Text>
                        )}
                        <Text style={styles.supplementItemPrice}>+{supplement.price.toFixed(2)}€</Text>
                        <TouchableOpacity
                          style={[styles.toggleButton, supplement.available ? styles.toggleButtonDeactivate : styles.toggleButtonActivate]}
                          onPress={() => toggleAvailability(supplement.supplement_ids, supplement.available)}
                        >
                          <Text style={[styles.toggleButtonText, supplement.available ? styles.toggleButtonTextDeactivate : styles.toggleButtonTextActivate]}>
                            {supplement.available ? 'Désactiver' : 'Activer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.supplementItemActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDeleteSupplement(supplement.supplement_ids, supplement.school_names)}
                        >
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {groupedSupplements.filter(s => s.menu_id).length > 0 && (
                <>
                  <View style={[styles.categoryHeader, groupedSupplements.filter(s => !s.menu_id).length > 0 && styles.categoryHeaderSpaced]}>
                    <Text style={styles.categoryTitle}>Suppléments spécifiques à un menu</Text>
                  </View>
                  {groupedSupplements.filter(s => s.menu_id).map((supplement, index) => (
                    <View key={`${supplement.id}-${index}`} style={[styles.supplementItem, styles.supplementItemSpecific]}>
                      <View style={styles.supplementItemContent}>
                        <View style={styles.supplementHeader}>
                          <Text style={styles.supplementItemName}>{supplement.name}</Text>
                          <View
                            style={[styles.statusBadge, supplement.available ? styles.statusAvailable : styles.statusUnavailable]}
                          >
                            {supplement.available ? (
                              <CheckCircle size={14} color="#10B981" />
                            ) : (
                              <XCircle size={14} color="#EF4444" />
                            )}
                            <Text style={[styles.statusText, supplement.available ? styles.statusTextAvailable : styles.statusTextUnavailable]}>
                              {supplement.available ? 'Actif' : 'Inactif'}
                            </Text>
                          </View>
                        </View>
                        {supplement.menu_name && (
                          <View style={styles.menuBadge}>
                            <Text style={styles.menuBadgeText}>Menu: {supplement.menu_name}</Text>
                          </View>
                        )}
                        <View style={styles.schoolBadge}>
                          <Text style={styles.schoolBadgeText}>
                            {supplement.school_ids.length === schools.length
                              ? 'Toutes les écoles'
                              : supplement.school_names.join(', ')}
                          </Text>
                        </View>
                        {supplement.description && (
                          <Text style={styles.supplementItemDescription}>{supplement.description}</Text>
                        )}
                        <Text style={styles.supplementItemPrice}>+{supplement.price.toFixed(2)}€</Text>
                        <TouchableOpacity
                          style={[styles.toggleButton, supplement.available ? styles.toggleButtonDeactivate : styles.toggleButtonActivate]}
                          onPress={() => toggleAvailability(supplement.supplement_ids, supplement.available)}
                        >
                          <Text style={[styles.toggleButtonText, supplement.available ? styles.toggleButtonTextDeactivate : styles.toggleButtonTextActivate]}>
                            {supplement.available ? 'Désactiver' : 'Activer'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.supplementItemActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDeleteSupplement(supplement.supplement_ids, supplement.school_names)}
                        >
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
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
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  supplementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  supplementItemContent: {
    flex: 1,
    paddingRight: 16,
  },
  supplementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  supplementItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
    gap: 4,
  },
  statusAvailable: {
    backgroundColor: '#D1FAE5',
  },
  statusUnavailable: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextAvailable: {
    color: '#10B981',
  },
  statusTextUnavailable: {
    color: '#EF4444',
  },
  supplementItemDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    marginTop: 4,
  },
  supplementItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 4,
  },
  supplementItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  schoolBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  schoolBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  categoryHeader: {
    marginBottom: 16,
    marginTop: 8,
  },
  categoryHeaderSpaced: {
    marginTop: 32,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  supplementItemSpecific: {
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  menuBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  menuBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  toggleButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActivate: {
    backgroundColor: '#10B981',
  },
  toggleButtonDeactivate: {
    backgroundColor: '#EF4444',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleButtonTextActivate: {
    color: '#FFFFFF',
  },
  toggleButtonTextDeactivate: {
    color: '#FFFFFF',
  },
});
