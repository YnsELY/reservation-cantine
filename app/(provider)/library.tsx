import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { Provider, ProviderMenuLibrary, supabase } from '@/lib/supabase';
import { LibraryMenu, LibrarySupplement, ProviderMenuCard, ProviderSupplementCard } from '@/components/provider/LibraryCards';

type LibraryTab = 'menus' | 'supplements';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

type SupplementRow = LibrarySupplement & {
  provider_id: string;
  school_id: string;
  available: boolean;
  created_at: string;
  library_menu_id?: string | null;
  schools?: { name?: string } | null;
  provider_menu_library?: { meal_name?: string } | null;
};

const groupSupplementsByContent = (supplementsList: SupplementRow[]): LibrarySupplement[] => {
  const groups: Record<string, LibrarySupplement> = {};

  supplementsList.forEach(supplement => {
    const menuName = supplement.provider_menu_library?.meal_name || supplement.menu_name || null;
    const key = [
      supplement.name,
      supplement.price,
      supplement.description || '',
      supplement.library_menu_id || supplement.menu_id || 'generic',
      menuName || '',
      supplement.available ? 'active' : 'inactive',
    ].join('|');

    const schoolName = supplement.schools?.name || 'École';

    if (!groups[key]) {
      groups[key] = {
        id: supplement.id,
        name: supplement.name,
        description: supplement.description,
        price: supplement.price,
        available: supplement.available,
        menu_id: supplement.library_menu_id || supplement.menu_id || null,
        menu_name: menuName,
        supplement_ids: [supplement.id],
        school_ids: [supplement.school_id],
        school_names: [schoolName],
      };
      return;
    }

    groups[key].supplement_ids.push(supplement.id);
    if (!groups[key].school_ids.includes(supplement.school_id)) {
      groups[key].school_ids.push(supplement.school_id);
    }
    if (!groups[key].school_names.includes(schoolName)) {
      groups[key].school_names.push(schoolName);
    }
  });

  return Object.values(groups);
};

const fetchMenus = async (currentProvider: Provider): Promise<LibraryMenu[]> => {
  const { data, error } = await supabase
    .from('provider_menu_library')
    .select('*')
    .eq('provider_id', currentProvider.id)
    .eq('available', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchMenus error:', error);
    throw error;
  }

  return ((data || []) as ProviderMenuLibrary[]).map(menu => ({
    id: menu.id,
    meal_name: menu.meal_name,
    description: menu.description,
    price: menu.price,
    image_url: menu.image_url,
    card_color: menu.card_color,
  }));
};

const fetchSupplements = async (schoolsList: SchoolAccess[], currentProvider: Provider) => {
  const schoolIds = schoolsList.map(s => s.school_id);

  const { data, error } = await supabase
    .from('provider_supplements')
    .select('*, schools(name), provider_menu_library:library_menu_id(meal_name)')
    .eq('provider_id', currentProvider.id)
    .in('school_id', schoolIds)
    .is('menu_id', null)
    .order('name');

  if (error) {
    console.error('fetchSupplements error:', error);
    throw error;
  }

  return groupSupplementsByContent((data || []) as SupplementRow[]);
};

export default function ProviderLibraryScreen() {
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [menus, setMenus] = useState<LibraryMenu[]>([]);
  const [supplements, setSupplements] = useState<LibrarySupplement[]>([]);
  const [activeTab, setActiveTab] = useState<LibraryTab>('menus');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(name)')
        .eq('provider_id', currentProvider.id);

      const schoolsList = (schoolAccess || []).map(sa => ({
        school_id: (sa as any).school_id,
        school_name: (sa as any).schools?.name || 'École',
      }));

      setSchools(schoolsList);

      try {
        const menusList = await fetchMenus(currentProvider);
        setMenus(menusList);
      } catch (err) {
        console.error('Error loading library menus:', err);
        setMenus([]);
      }

      try {
        const supplementsList = schoolsList.length > 0
          ? await fetchSupplements(schoolsList, currentProvider)
          : [];
        setSupplements(supplementsList);
      } catch (err) {
        console.error('Error loading library supplements:', err);
        setSupplements([]);
      }
    } catch (err) {
      console.error('Error loading provider library:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAdd = () => {
    router.push(activeTab === 'menus' ? '/(provider)/add-menu' : '/(provider)/add-supplement');
  };

  const handleEditMenu = (menu: LibraryMenu) => {
    router.push({
      pathname: '/(provider)/add-menu',
      params: {
        editMenuId: menu.id,
        editMealName: menu.meal_name,
        editDescription: menu.description || '',
        editPrice: menu.price.toString(),
        editColor: menu.card_color || '#FFE4E1',
        editImageUrl: menu.image_url || '',
      },
    });
  };

  const handleDeleteMenu = (menu: LibraryMenu) => {
    showAlert('Supprimer le menu', 'Ce menu sera supprimé de la bibliothèque. Les semaines déjà publiées ne seront pas modifiées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('provider_menu_library').delete().eq('id', menu.id);
            await loadData();
          } catch (err) {
            console.error('Error deleting library menu:', err);
          }
        },
      },
    ]);
  };

  const handleDeleteSupplement = (supplement: LibrarySupplement) => {
    const isMultiple = supplement.supplement_ids.length > 1;
    const message = isMultiple
      ? `Ce supplément sera supprimé pour ${supplement.school_names.length} école(s) : ${supplement.school_names.join(', ')}`
      : 'Êtes-vous sûr de vouloir supprimer ce supplément ?';

    showAlert('Supprimer le supplément', message, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('provider_supplements').delete().in('id', supplement.supplement_ids);
            await loadData();
          } catch (err) {
            console.error('Error deleting supplement:', err);
          }
        },
      },
    ]);
  };

  const toggleSupplementAvailability = async (supplement: LibrarySupplement) => {
    try {
      await supabase
        .from('provider_supplements')
        .update({ available: !supplement.available })
        .in('id', supplement.supplement_ids);

      await loadData();
    } catch (err) {
      console.error('Error toggling supplement availability:', err);
    }
  };

  const genericSupplements = supplements.filter(supplement => !supplement.menu_id);
  const specificSupplements = supplements.filter(supplement => !!supplement.menu_id);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ma bibliothèque</Text>
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Plus size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'menus' && styles.tabButtonActive]}
          onPress={() => setActiveTab('menus')}
        >
          <Text style={[styles.tabText, activeTab === 'menus' ? styles.tabTextActive : styles.tabTextInactive]}>
            Menus
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'supplements' && styles.tabButtonActive]}
          onPress={() => setActiveTab('supplements')}
        >
          <Text style={[styles.tabText, activeTab === 'supplements' ? styles.tabTextActive : styles.tabTextInactive]}>
            Suppléments
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {activeTab === 'menus' ? (
          menus.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Aucun menu</Text>
            </View>
          ) : (
            menus.map(menu => (
              <ProviderMenuCard
                key={menu.id}
                menu={menu}
                onEdit={() => handleEditMenu(menu)}
                onDelete={() => handleDeleteMenu(menu)}
              />
            ))
          )
        ) : (
          <>
            {genericSupplements.length > 0 && (
              <>
                <Text style={styles.categoryTitle}>Suppléments génériques</Text>
                {genericSupplements.map(supplement => (
                  <ProviderSupplementCard
                    key={supplement.supplement_ids.join('-')}
                    supplement={supplement}
                    allSchoolsCount={schools.length}
                    onToggle={() => toggleSupplementAvailability(supplement)}
                    onDelete={() => handleDeleteSupplement(supplement)}
                  />
                ))}
              </>
            )}

            {specificSupplements.length > 0 && (
              <>
                <Text style={[styles.categoryTitle, genericSupplements.length > 0 && styles.categoryTitleSpaced]}>
                  Spécifiques à un menu
                </Text>
                {specificSupplements.map(supplement => (
                  <ProviderSupplementCard
                    key={supplement.supplement_ids.join('-')}
                    supplement={supplement}
                    allSchoolsCount={schools.length}
                    onToggle={() => toggleSupplementAvailability(supplement)}
                    onDelete={() => handleDeleteSupplement(supplement)}
                  />
                ))}
              </>
            )}

            {supplements.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Aucun supplément</Text>
                <Text style={styles.emptyText}>Ajoutez des suppléments pour vos menus</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F5F7',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    position: 'absolute',
    left: 56,
    right: 56,
    textAlign: 'center',
    color: '#1F2937',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    height: 44,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#111827',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#111827',
  },
  tabTextInactive: {
    color: '#9CA3AF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  categoryTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  categoryTitleSpaced: {
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});
