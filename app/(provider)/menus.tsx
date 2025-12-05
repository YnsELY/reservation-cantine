import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Menu, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Plus, Trash2, Package } from 'lucide-react-native';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface Supplement {
  id: string;
  name: string;
  price: number;
}

interface SpecificSupplement {
  id: string;
  name: string;
  price: number;
  description?: string;
  menu_id: string;
}

interface GroupedMenu extends Menu {
  school_ids: string[];
  school_names: string[];
  menu_ids: string[];
}

export default function ProviderMenus() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [groupedMenus, setGroupedMenus] = useState<GroupedMenu[]>([]);
  const [supplements, setSupplements] = useState<Map<string, Supplement>>(new Map());
  const [specificSupplements, setSpecificSupplements] = useState<Map<string, SpecificSupplement[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
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
        await loadAllMenus(schoolsList);
      }

      await deleteOldMenus();
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllMenus = async (schoolsList: SchoolAccess[]) => {
    try {
      const schoolIds = schoolsList.map(s => s.school_id);
      const today = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from('menus')
        .select('*, schools(name)')
        .in('school_id', schoolIds)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('meal_name');

      const menusData = data || [];
      setMenus(menusData);

      const grouped = groupMenusByContent(menusData, schoolsList);
      setGroupedMenus(grouped);

      await loadSupplements(menusData);
      await loadSpecificSupplements(menusData);
    } catch (err) {
      console.error('Error loading menus:', err);
    }
  };

  const loadSupplements = async (menusList: any[]) => {
    try {
      const supplementIds = new Set<string>();
      menusList.forEach((menu) => {
        if (menu.supplements && Array.isArray(menu.supplements)) {
          menu.supplements.forEach((id: string) => supplementIds.add(id));
        }
      });

      if (supplementIds.size === 0) {
        setSupplements(new Map());
        return;
      }

      const { data } = await supabase
        .from('provider_supplements')
        .select('id, name, price')
        .in('id', Array.from(supplementIds));

      const supplementsMap = new Map<string, Supplement>();
      (data || []).forEach((supp) => {
        supplementsMap.set(supp.id, supp);
      });

      setSupplements(supplementsMap);
    } catch (err) {
      console.error('Error loading supplements:', err);
    }
  };

  const loadSpecificSupplements = async (menusList: any[]) => {
    try {
      if (!provider) return;

      const menuIds = menusList.map(m => m.id);
      if (menuIds.length === 0) {
        setSpecificSupplements(new Map());
        return;
      }

      const { data } = await supabase
        .from('provider_supplements')
        .select('id, name, price, description, menu_id')
        .eq('provider_id', provider.id)
        .in('menu_id', menuIds)
        .not('menu_id', 'is', null);

      const specificSuppsMap = new Map<string, SpecificSupplement[]>();
      (data || []).forEach((supp) => {
        const menuId = supp.menu_id;
        if (!specificSuppsMap.has(menuId)) {
          specificSuppsMap.set(menuId, []);
        }
        specificSuppsMap.get(menuId)!.push(supp as SpecificSupplement);
      });

      setSpecificSupplements(specificSuppsMap);
    } catch (err) {
      console.error('Error loading specific supplements:', err);
    }
  };

  const groupMenusByContent = (menusList: any[], schoolsList: SchoolAccess[]): GroupedMenu[] => {
    const groups: { [key: string]: GroupedMenu } = {};

    menusList.forEach((menu) => {
      const key = `${menu.meal_name}-${menu.date}-${menu.price}-${menu.description || ''}-${menu.image_url || ''}`;

      if (!groups[key]) {
        groups[key] = {
          ...menu,
          school_ids: [menu.school_id],
          school_names: [(menu.schools as any)?.name || 'École'],
          menu_ids: [menu.id],
        };
      } else {
        groups[key].school_ids.push(menu.school_id);
        groups[key].school_names.push((menu.schools as any)?.name || 'École');
        groups[key].menu_ids.push(menu.id);
      }
    });

    return Object.values(groups);
  };

  const deleteOldMenus = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('menus')
        .delete()
        .lt('date', today);
    } catch (err) {
      console.error('Error deleting old menus:', err);
    }
  };


  const handleDeleteMenu = async (menuIds: string[], schoolNames: string[]) => {
    const isMultiple = menuIds.length > 1;
    const message = isMultiple
      ? `Ce menu sera supprimé pour ${schoolNames.length} école(s) : ${schoolNames.join(', ')}`
      : 'Êtes-vous sûr de vouloir supprimer ce menu ?';

    Alert.alert(
      'Supprimer le menu',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('menus').delete().in('id', menuIds);
              await loadData();
            } catch (err) {
              console.error('Error deleting menu:', err);
            }
          },
        },
      ]
    );
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
            <Text style={styles.sectionTitle}>Liste des menus</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/(provider)/add-menu')}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {groupedMenus.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucun menu à venir</Text>
            </View>
          ) : (
            groupedMenus.map((menu, index) => (
              <View key={`${menu.id}-${index}`} style={styles.menuItem}>
                {menu.image_url && (
                  <Image
                    source={{ uri: menu.image_url }}
                    style={styles.menuItemImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemName}>{menu.meal_name}</Text>
                  <View style={styles.schoolBadge}>
                    <Text style={styles.schoolBadgeText}>
                      {menu.school_ids.length === schools.length
                        ? 'Toutes les écoles'
                        : menu.school_names.join(', ')}
                    </Text>
                  </View>
                  <Text style={styles.menuItemDate}>
                    {new Date(menu.date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  {menu.description && (
                    <Text style={styles.menuItemDescription}>{menu.description}</Text>
                  )}
                  <Text style={styles.menuItemPrice}>{menu.price.toFixed(2)}€</Text>
                  {menu.supplements && Array.isArray(menu.supplements) && menu.supplements.length > 0 && (
                    <View style={styles.supplementsContainer}>
                      <View style={styles.supplementsHeader}>
                        <Package size={14} color="#F59E0B" />
                        <Text style={styles.supplementsTitle}>Suppléments :</Text>
                      </View>
                      <View style={styles.supplementsListMenu}>
                        {menu.supplements.map((suppId: string) => {
                          const supp = supplements.get(suppId);
                          if (!supp) return null;
                          return (
                            <View key={suppId} style={styles.supplementBadge}>
                              <Text style={styles.supplementBadgeText}>
                                {supp.name} (+{supp.price.toFixed(2)}€)
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {(() => {
                    const allSpecificSupps: SpecificSupplement[] = [];
                    menu.menu_ids.forEach((menuId: string) => {
                      const menuSpecificSupps = specificSupplements.get(menuId);
                      if (menuSpecificSupps && menuSpecificSupps.length > 0) {
                        allSpecificSupps.push(...menuSpecificSupps);
                      }
                    });

                    const uniqueSupps = Array.from(
                      new Map(allSpecificSupps.map(s => [s.name + s.price, s])).values()
                    );

                    if (uniqueSupps.length === 0) return null;

                    return (
                      <View style={styles.specificSupplementsContainer}>
                        <View style={styles.supplementsHeader}>
                          <Package size={14} color="#10B981" />
                          <Text style={styles.specificSupplementsTitle}>Suppléments spécifiques :</Text>
                        </View>
                        <View style={styles.supplementsListMenu}>
                          {uniqueSupps.map((supp) => (
                            <View key={supp.id} style={styles.specificSupplementBadge}>
                              <Text style={styles.specificSupplementBadgeText}>
                                {supp.name} (+{supp.price.toFixed(2)}€)
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })()}
                </View>
                <View style={styles.menuItemActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteMenu(menu.menu_ids, menu.school_names)}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
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
    color: '#9CA3AF',
  },
  menuItem: {
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
    position: 'relative',
  },
  menuItemImage: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#F3F4F6',
    zIndex: 10,
  },
  menuItemContent: {
    flex: 1,
    paddingRight: 80,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  menuItemDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  menuItemDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    marginTop: 4,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  menuItemActions: {
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
    marginTop: 4,
  },
  schoolBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  supplementsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  supplementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  supplementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  supplementsListMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  supplementBadge: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  supplementBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  specificSupplementsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  specificSupplementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  specificSupplementBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  specificSupplementBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
});
