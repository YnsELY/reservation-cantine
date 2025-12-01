import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, Reservation, Child, Menu, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Calendar, Filter, X, Search, ChevronDown } from 'lucide-react-native';

interface OrderWithDetails extends Reservation {
  child: Child;
  menu: Menu;
}

type StatusFilter = 'all' | 'paid' | 'pending' | 'cancelled';
type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'year';
type SortOption = 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc' | 'student';

export default function SchoolMyOrdersScreen() {
  const [school, setSchool] = useState<School | null>(null);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, statusFilter, periodFilter, sortBy, searchQuery]);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);

      const { data: reservationsData } = await supabase
        .from('reservations')
        .select(`
          *,
          child:children!inner(*),
          menu:menus(*)
        `)
        .eq('child.school_id', currentSchool.id)
        .order('created_at', { ascending: false });

      const ordersWithDetails = (reservationsData || []).map((res: any) => ({
        ...res,
        child: res.child,
        menu: res.menu,
      }));

      setOrders(ordersWithDetails);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...orders];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.payment_status === statusFilter);
    }

    if (periodFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.date);

        if (periodFilter === 'today') {
          return orderDate >= today;
        } else if (periodFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return orderDate >= weekAgo;
        } else if (periodFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return orderDate >= monthAgo;
        } else if (periodFilter === 'year') {
          const yearAgo = new Date(today);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          return orderDate >= yearAgo;
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.child.first_name.toLowerCase().includes(lowerQuery) ||
        order.child.last_name.toLowerCase().includes(lowerQuery) ||
        order.menu.meal_name.toLowerCase().includes(lowerQuery)
      );
    }

    if (sortBy === 'date_desc') {
      filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (sortBy === 'date_asc') {
      filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else if (sortBy === 'price_desc') {
      filtered.sort((a, b) => b.total_price - a.total_price);
    } else if (sortBy === 'price_asc') {
      filtered.sort((a, b) => a.total_price - b.total_price);
    } else if (sortBy === 'student') {
      filtered.sort((a, b) =>
        `${a.child.first_name} ${a.child.last_name}`.localeCompare(
          `${b.child.first_name} ${b.child.last_name}`
        )
      );
    }

    setFilteredOrders(filtered);
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setPeriodFilter('all');
    setSortBy('date_desc');
    setSearchQuery('');
  };

  const hasActiveFilters = () => {
    return statusFilter !== 'all' || periodFilter !== 'all' || sortBy !== 'date_desc' || searchQuery.trim() !== '';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const getStatusLabel = (status: StatusFilter) => {
    switch (status) {
      case 'all': return 'Tous';
      case 'paid': return 'Payées';
      case 'pending': return 'En attente';
      case 'cancelled': return 'Annulées';
    }
  };

  const getPeriodLabel = (period: PeriodFilter) => {
    switch (period) {
      case 'all': return 'Toutes';
      case 'today': return "Aujourd'hui";
      case 'week': return '7 derniers jours';
      case 'month': return '30 derniers jours';
      case 'year': return 'Cette année';
    }
  };

  const getSortLabel = (sort: SortOption) => {
    switch (sort) {
      case 'date_desc': return 'Plus récentes';
      case 'date_asc': return 'Plus anciennes';
      case 'price_desc': return 'Prix décroissant';
      case 'price_asc': return 'Prix croissant';
      case 'student': return 'Nom élève';
    }
  };

  const renderOrder = ({ item }: { item: OrderWithDetails }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderInfo}>
          <Text style={styles.orderChildName}>
            {item.child.first_name} {item.child.last_name}
          </Text>
          <Text style={styles.orderDate}>
            <Calendar size={14} color="#6B7280" /> {formatDate(item.date)}
          </Text>
        </View>
        <View style={[
          styles.statusBadge,
          item.payment_status === 'paid' && styles.statusBadgePaid,
          item.payment_status === 'pending' && styles.statusBadgePending,
          item.payment_status === 'cancelled' && styles.statusBadgeCancelled,
        ]}>
          <Text style={[
            styles.statusText,
            item.payment_status === 'paid' && styles.statusTextPaid,
            item.payment_status === 'pending' && styles.statusTextPending,
            item.payment_status === 'cancelled' && styles.statusTextCancelled,
          ]}>
            {item.payment_status === 'paid' ? 'Payé' : item.payment_status === 'pending' ? 'En attente' : 'Annulé'}
          </Text>
        </View>
      </View>
      <Text style={styles.orderMeal}>{item.menu.meal_name}</Text>
      <Text style={styles.orderPrice}>{item.total_price.toFixed(2)} €</Text>
      {item.created_by_school && (
        <View style={styles.schoolBadge}>
          <Text style={styles.schoolBadgeText}>Commande école</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Mes commandes</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{filteredOrders.length}</Text>
          <Text style={styles.statLabel}>Affichées</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {orders.filter(o => o.payment_status === 'paid').length}
          </Text>
          <Text style={styles.statLabel}>Payées</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {orders.filter(o => o.payment_status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>En attente</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Search size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher élève ou menu..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <X size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterToggleButton, hasActiveFilters() && styles.filterToggleButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={20} color={hasActiveFilters() ? '#FFFFFF' : '#111827'} />
          <Text style={[styles.filterToggleText, hasActiveFilters() && styles.filterToggleTextActive]}>
            Filtres
          </Text>
          {hasActiveFilters() && (
            <View style={styles.filterActiveDot} />
          )}
        </TouchableOpacity>

        {hasActiveFilters() && (
          <TouchableOpacity onPress={resetFilters} style={styles.resetButton}>
            <X size={18} color="#EF4444" />
            <Text style={styles.resetButtonText}>Réinitialiser</Text>
          </TouchableOpacity>
        )}
      </View>

      {showFilters && (
        <View style={styles.filtersPanel}>
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Statut</Text>
            <View style={styles.filterOptionsRow}>
              {(['all', 'paid', 'pending', 'cancelled'] as StatusFilter[]).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>
                    {getStatusLabel(status)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Période</Text>
            <View style={styles.filterOptionsRow}>
              {(['all', 'today', 'week', 'month', 'year'] as PeriodFilter[]).map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.filterChip, periodFilter === period && styles.filterChipActive]}
                  onPress={() => setPeriodFilter(period)}
                >
                  <Text style={[styles.filterChipText, periodFilter === period && styles.filterChipTextActive]}>
                    {getPeriodLabel(period)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Trier par</Text>
            <View style={styles.filterOptionsColumn}>
              {(['date_desc', 'date_asc', 'price_desc', 'price_asc', 'student'] as SortOption[]).map((sort) => (
                <TouchableOpacity
                  key={sort}
                  style={[styles.sortOption, sortBy === sort && styles.sortOptionActive]}
                  onPress={() => setSortBy(sort)}
                >
                  <View style={[styles.radioButton, sortBy === sort && styles.radioButtonActive]}>
                    {sortBy === sort && <View style={styles.radioButtonInner} />}
                  </View>
                  <Text style={[styles.sortOptionText, sortBy === sort && styles.sortOptionTextActive]}>
                    {getSortLabel(sort)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {orders.length === 0 ? 'Aucune commande trouvée' : 'Aucune commande ne correspond aux filtres'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
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
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  filterToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterToggleButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  filterToggleTextActive: {
    color: '#FFFFFF',
  },
  filterActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  filtersPanel: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOptionsColumn: {
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  sortOptionActive: {
    backgroundColor: '#EEF2FF',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonActive: {
    borderColor: '#4F46E5',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  sortOptionTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderChildName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgePaid: {
    backgroundColor: '#D1FAE5',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextPaid: {
    color: '#065F46',
  },
  statusTextPending: {
    color: '#92400E',
  },
  statusTextCancelled: {
    color: '#991B1B',
  },
  orderMeal: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  orderPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  schoolBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  schoolBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
