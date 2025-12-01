import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, ShoppingBag, User, Users, UtensilsCrossed, Search, X, ChevronDown } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  parent_name: string;
  menu_name: string;
  menu_description: string | null;
  menu_allergens: string[];
  supplements: Array<{name: string; price: number}> | null;
}

type SortOption = 'order' | 'child' | 'parent' | 'menu';

export default function AllOrders() {
  const [school, setSchool] = useState<School | null>(null);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('order');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  const selectedDate = params.date as string;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);
      await loadOrders(currentSchool, selectedDate);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOrders = async (currentSchool: School, dateString: string) => {
    try {
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          supplements,
          children!inner(first_name, last_name),
          menus!inner(meal_name, description, allergens),
          parents!inner(first_name, last_name)
        `)
        .eq('date', dateString)
        .eq('children.school_id', currentSchool.id);

      if (error) throw error;

      const ordersList: OrderDetail[] = (reservations || []).map((res: any) => ({
        id: res.id,
        child_name: `${res.children.first_name} ${res.children.last_name}`,
        parent_name: `${res.parents.first_name} ${res.parents.last_name}`,
        menu_name: res.menus.meal_name,
        menu_description: res.menus.description,
        menu_allergens: res.menus.allergens || [],
        supplements: res.supplements || null,
      }));

      setOrders(ordersList);
      setFilteredOrders(ordersList);
    } catch (err) {
      console.error('Error loading orders:', err);
      setOrders([]);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const applyFilters = (sortOption: SortOption, query: string, ordersList: OrderDetail[]) => {
    let filtered = [...ordersList];

    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(order =>
        order.child_name.toLowerCase().includes(lowerQuery) ||
        order.parent_name.toLowerCase().includes(lowerQuery) ||
        order.menu_name.toLowerCase().includes(lowerQuery)
      );
    }

    if (sortOption === 'order') {
      filtered = filtered;
    } else if (sortOption === 'child') {
      filtered.sort((a, b) => a.child_name.localeCompare(b.child_name));
    } else if (sortOption === 'parent') {
      filtered.sort((a, b) => a.parent_name.localeCompare(b.parent_name));
    } else if (sortOption === 'menu') {
      filtered.sort((a, b) => a.menu_name.localeCompare(b.menu_name));
    }

    setFilteredOrders(filtered);
  };

  const handleSort = (option: SortOption) => {
    setSortBy(option);
    setShowSortDropdown(false);
    applyFilters(option, searchQuery, orders);
  };

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'order': return 'N° Commande';
      case 'child': return 'Nom Élève';
      case 'parent': return 'Nom Parent';
      case 'menu': return 'Menu';
      default: return 'N° Commande';
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFilters(sortBy, query, orders);
  };

  const clearSearch = () => {
    setSearchQuery('');
    applyFilters(sortBy, '', orders);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };


  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Toutes les commandes</Text>
          <Text style={styles.headerSubtitle}>{formatDate(selectedDate)}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={styles.mainScrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIconContainer}>
            <ShoppingBag size={24} color="#FFFFFF" />
          </View>
          <View style={styles.summaryTextContainer}>
            <Text style={styles.summaryCount}>{orders.length}</Text>
            <Text style={styles.summaryLabel}>Commandes</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Search size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher élève, parent ou menu..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Trier par:</Text>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setShowSortDropdown(!showSortDropdown)}
          >
            <Text style={styles.dropdownButtonText}>{getSortLabel(sortBy)}</Text>
            <ChevronDown size={20} color="#111827" />
          </TouchableOpacity>

          {showSortDropdown && (
            <View style={styles.dropdownMenu}>
              <TouchableOpacity
                style={[styles.dropdownItem, sortBy === 'order' && styles.dropdownItemActive]}
                onPress={() => handleSort('order')}
              >
                <Text style={[styles.dropdownItemText, sortBy === 'order' && styles.dropdownItemTextActive]}>
                  N° Commande
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dropdownItem, sortBy === 'child' && styles.dropdownItemActive]}
                onPress={() => handleSort('child')}
              >
                <Text style={[styles.dropdownItemText, sortBy === 'child' && styles.dropdownItemTextActive]}>
                  Nom Élève
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dropdownItem, sortBy === 'parent' && styles.dropdownItemActive]}
                onPress={() => handleSort('parent')}
              >
                <Text style={[styles.dropdownItemText, sortBy === 'parent' && styles.dropdownItemTextActive]}>
                  Nom Parent
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dropdownItem,
                  styles.dropdownItemLast,
                  sortBy === 'menu' && styles.dropdownItemActive
                ]}
                onPress={() => handleSort('menu')}
              >
                <Text style={[styles.dropdownItemText, sortBy === 'menu' && styles.dropdownItemTextActive]}>
                  Menu
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {searchQuery.length > 0 && (
          <View style={styles.searchResultsContainer}>
            <Text style={styles.searchResultsText}>
              {filteredOrders.length} résultat{filteredOrders.length > 1 ? 's' : ''} pour "{searchQuery}"
            </Text>
          </View>
        )}

        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ShoppingBag size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {searchQuery.length > 0 ? 'Aucun résultat trouvé' : 'Aucune commande pour ce jour'}
            </Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {filteredOrders.map((order, index) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.orderNumberContainer}>
                    <Text style={styles.orderNumber}>#{index + 1}</Text>
                  </View>
                  <View style={styles.orderHeaderRight}>
                    <Text style={styles.orderDate}>{formatDate(selectedDate)}</Text>
                  </View>
                </View>

                <View style={styles.orderDivider} />

                <View style={styles.orderSection}>
                  <View style={styles.sectionHeader}>
                    <UtensilsCrossed size={18} color="#111827" />
                    <Text style={styles.sectionTitle}>Menu</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    <Text style={styles.menuName}>{order.menu_name}</Text>
                    {order.menu_description && (
                      <Text style={styles.menuDescription}>{order.menu_description}</Text>
                    )}
                    {order.menu_allergens.length > 0 && (
                      <View style={styles.allergensContainer}>
                        <Text style={styles.allergensLabel}>Allergènes:</Text>
                        <Text style={styles.allergensText}>
                          {order.menu_allergens.join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.orderSection}>
                  <View style={styles.sectionHeader}>
                    <User size={18} color="#111827" />
                    <Text style={styles.sectionTitle}>Élève</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    <Text style={styles.personName}>{order.child_name}</Text>
                  </View>
                </View>

                <View style={styles.orderSection}>
                  <View style={styles.sectionHeader}>
                    <Users size={18} color="#111827" />
                    <Text style={styles.sectionTitle}>Parent</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    <Text style={styles.personName}>{order.parent_name}</Text>
                  </View>
                </View>

                {order.supplements && order.supplements.length > 0 && (
                  <View style={styles.orderSection}>
                    <View style={styles.sectionHeader}>
                      <ShoppingBag size={18} color="#111827" />
                      <Text style={styles.sectionTitle}>Suppléments</Text>
                    </View>
                    <View style={styles.sectionContent}>
                      {order.supplements.map((supp: any, idx: number) => (
                        <View key={idx} style={styles.supplementItem}>
                          <Text style={styles.supplementName}>• {supp.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
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
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#111827',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryTextContainer: {
    flex: 1,
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  searchResultsContainer: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4F46E5',
  },
  searchResultsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 40,
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemActive: {
    backgroundColor: '#F3F4F6',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
  },
  ordersList: {
    marginHorizontal: 20,
    gap: 16,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderNumberContainer: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderHeaderRight: {
    alignItems: 'flex-end',
  },
  orderDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  orderDivider: {
    height: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 16,
  },
  orderSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    paddingLeft: 26,
  },
  menuName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  allergensContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  allergensLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    marginRight: 6,
  },
  allergensText: {
    fontSize: 13,
    color: '#DC2626',
    flex: 1,
  },
  personName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  supplementItem: {
    marginBottom: 6,
  },
  supplementName: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});
