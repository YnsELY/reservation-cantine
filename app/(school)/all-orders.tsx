import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, ShoppingBag, ArrowUpDown } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  menu_name: string;
  menu_description: string | null;
  menu_allergens: string[];
}

type SortOption = 'name' | 'menu';

export default function AllOrders() {
  const [school, setSchool] = useState<School | null>(null);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name');
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
          children!inner(first_name, last_name),
          menus!inner(meal_name, description, allergens)
        `)
        .eq('date', dateString)
        .eq('children.school_id', currentSchool.id);

      if (error) throw error;

      const ordersList: OrderDetail[] = (reservations || []).map((res: any) => ({
        id: res.id,
        child_name: `${res.children.first_name} ${res.children.last_name}`,
        menu_name: res.menus.meal_name,
        menu_description: res.menus.description,
        menu_allergens: res.menus.allergens || [],
      }));

      ordersList.sort((a, b) => a.child_name.localeCompare(b.child_name));
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

  const handleSort = (option: SortOption) => {
    setSortBy(option);
    const sorted = [...orders];

    if (option === 'name') {
      sorted.sort((a, b) => a.child_name.localeCompare(b.child_name));
    } else if (option === 'menu') {
      sorted.sort((a, b) => a.menu_name.localeCompare(b.menu_name));
    }

    setFilteredOrders(sorted);
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

      <View style={styles.summaryCard}>
        <View style={styles.summaryIconContainer}>
          <ShoppingBag size={24} color="#FFFFFF" />
        </View>
        <View style={styles.summaryTextContainer}>
          <Text style={styles.summaryCount}>{orders.length}</Text>
          <Text style={styles.summaryLabel}>Commandes</Text>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.filterHeader}>
          <ArrowUpDown size={20} color="#6B7280" />
          <Text style={styles.filterLabel}>Trier par:</Text>
        </View>
        <View style={styles.filterButtons}>
          <TouchableOpacity
            style={[styles.filterButton, sortBy === 'name' && styles.filterButtonActive]}
            onPress={() => handleSort('name')}
          >
            <Text style={[styles.filterButtonText, sortBy === 'name' && styles.filterButtonTextActive]}>
              Nom
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, sortBy === 'menu' && styles.filterButtonActive]}
            onPress={() => handleSort('menu')}
          >
            <Text style={[styles.filterButtonText, sortBy === 'menu' && styles.filterButtonTextActive]}>
              Menu
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ShoppingBag size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucune commande pour ce jour</Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {filteredOrders.map((order, index) => (
              <View
                key={order.id}
                style={[
                  styles.orderItem,
                  index % 2 === 0 && styles.orderItemEven
                ]}
              >
                <View style={styles.orderContent}>
                  <Text style={styles.orderChildName}>{order.child_name}</Text>
                  <View style={styles.menuDetails}>
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
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#111827',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderItem: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  orderItemEven: {
    backgroundColor: '#FAFAFA',
  },
  orderContent: {
    flex: 1,
  },
  orderChildName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  menuDetails: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#111827',
  },
  menuName: {
    fontSize: 15,
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
    marginTop: 4,
    flexWrap: 'wrap',
  },
  allergensLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
    marginRight: 6,
  },
  allergensText: {
    fontSize: 13,
    color: '#DC2626',
    flex: 1,
    fontStyle: 'italic',
  },
});
