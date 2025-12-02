import { useState, useEffect, useCallback } from 'react';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, ShoppingBag, User, Users, UtensilsCrossed, Search, X, ChevronDown, FileSpreadsheet } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  parent_name: string;
  parent_phone: string | null;
  child_grade: string | null;
  child_allergies: string[];
  child_dietary_restrictions: string[];
  supplements: Array<{name: string; price: number}> | null;
  annotations: string | null;
  total_price: number;
  created_at: string;
}

type SortOption = 'order' | 'child' | 'parent';

export default function OrdersPage() {
  const { menuId, menuName, date } = useLocalSearchParams();
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('order');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadOrders();
  }, [menuId]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          total_price,
          supplements,
          annotations,
          created_at,
          child:children(
            first_name,
            last_name,
            grade,
            allergies,
            dietary_restrictions
          ),
          parent:parents(
            first_name,
            last_name,
            phone
          )
        `)
        .eq('menu_id', menuId)
        .eq('date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const ordersList: OrderDetail[] = (data || []).map((res: any) => ({
        id: res.id,
        child_name: `${res.child.first_name} ${res.child.last_name}`,
        parent_name: `${res.parent.first_name} ${res.parent.last_name}`,
        parent_phone: res.parent.phone,
        child_grade: res.child.grade,
        child_allergies: res.child.allergies || [],
        child_dietary_restrictions: res.child.dietary_restrictions || [],
        supplements: res.supplements || null,
        annotations: res.annotations,
        total_price: res.total_price,
        created_at: res.created_at,
      }));

      setOrders(ordersList);
      setFilteredOrders(ordersList);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders([]);
      setFilteredOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const applyFilters = (sortOption: SortOption, query: string, ordersList: OrderDetail[]) => {
    let filtered = [...ordersList];

    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(order =>
        order.child_name.toLowerCase().includes(lowerQuery) ||
        order.parent_name.toLowerCase().includes(lowerQuery)
      );
    }

    if (sortOption === 'order') {
      filtered = filtered;
    } else if (sortOption === 'child') {
      filtered.sort((a, b) => a.child_name.localeCompare(b.child_name));
    } else if (sortOption === 'parent') {
      filtered.sort((a, b) => a.parent_name.localeCompare(b.parent_name));
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

  const exportToCSV = async () => {
    if (filteredOrders.length === 0) {
      return;
    }

    setExporting(true);
    try {
      const headers = ['N°', 'Élève', 'Classe', 'Parent', 'Téléphone', 'Allergies', 'Restrictions', 'Suppléments', 'Annotations'];
      const csvRows = [headers.join(',')];

      filteredOrders.forEach((order, index) => {
        const supplements = order.supplements?.map(s => s.name).join('; ') || '';
        const row = [
          index + 1,
          `"${order.child_name}"`,
          `"${order.child_grade || ''}"`,
          `"${order.parent_name}"`,
          `"${order.parent_phone || ''}"`,
          `"${order.child_allergies.join(', ')}"`,
          `"${order.child_dietary_restrictions.join(', ')}"`,
          `"${supplements}"`,
          `"${order.annotations || ''}"`,
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const fileName = `commandes-${menuName}-${date}.csv`;
      const fileUri = `${(FileSystem as any).documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: (FileSystem as any).EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exporter les commandes',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const getPastelColor = (index: number) => {
    const colors = [
      { bg: '#FEF3C7', text: '#92400E', badge: '#FCD34D' },
      { bg: '#DBEAFE', text: '#1E3A8A', badge: '#93C5FD' },
      { bg: '#FCE7F3', text: '#831843', badge: '#F9A8D4' },
      { bg: '#D1FAE5', text: '#065F46', badge: '#6EE7B7' },
      { bg: '#E0E7FF', text: '#3730A3', badge: '#A5B4FC' },
      { bg: '#FED7AA', text: '#7C2D12', badge: '#FDBA74' },
    ];
    return colors[index % colors.length];
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
        <TouchableOpacity
          style={[
            styles.exportButton,
            (exporting || filteredOrders.length === 0) && styles.exportButtonDisabled
          ]}
          onPress={exportToCSV}
          disabled={exporting || filteredOrders.length === 0}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <FileSpreadsheet size={20} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>Excel</Text>
            </>
          )}
        </TouchableOpacity>
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
            <UtensilsCrossed size={24} color="#FFFFFF" />
          </View>
          <View style={styles.summaryTextContainer}>
            <Text style={styles.summaryTitle}>{menuName}</Text>
            <Text style={styles.summaryCount}>{orders.length} commande{orders.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Search size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher élève ou parent..."
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
                style={[
                  styles.dropdownItem,
                  styles.dropdownItemLast,
                  sortBy === 'parent' && styles.dropdownItemActive
                ]}
                onPress={() => handleSort('parent')}
              >
                <Text style={[styles.dropdownItemText, sortBy === 'parent' && styles.dropdownItemTextActive]}>
                  Nom Parent
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
            <User size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {searchQuery.length > 0 ? 'Aucun résultat trouvé' : 'Aucune commande'}
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
                    <Text style={styles.orderDate}>{formatDate(date as string)}</Text>
                  </View>
                </View>

                <View style={styles.orderDivider} />

                <View style={styles.orderSection}>
                  <View style={styles.sectionHeader}>
                    <User size={18} color="#111827" />
                    <Text style={styles.sectionTitle}>Élève</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    <Text style={styles.personName}>{order.child_name}</Text>
                    {order.child_grade && (
                      <Text style={styles.personDetail}>{order.child_grade}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.orderSection}>
                  <View style={styles.sectionHeader}>
                    <Users size={18} color="#111827" />
                    <Text style={styles.sectionTitle}>Parent</Text>
                  </View>
                  <View style={styles.sectionContent}>
                    <Text style={styles.personName}>{order.parent_name}</Text>
                    {order.parent_phone && (
                      <Text style={styles.personDetail}>{order.parent_phone}</Text>
                    )}
                  </View>
                </View>

                {(order.child_allergies?.length > 0 || order.child_dietary_restrictions?.length > 0) && (
                  <View style={styles.orderSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>⚠️ ALLERGIES & RESTRICTIONS</Text>
                    </View>
                    <View style={styles.sectionContent}>
                      {order.child_allergies?.length > 0 && (
                        <View style={styles.allergensContainer}>
                          <Text style={styles.allergensLabel}>Allergies:</Text>
                          <Text style={styles.allergensText}>
                            {order.child_allergies.join(', ')}
                          </Text>
                        </View>
                      )}
                      {order.child_dietary_restrictions?.length > 0 && (
                        <View style={styles.allergensContainer}>
                          <Text style={styles.allergensLabel}>Restrictions:</Text>
                          <Text style={styles.allergensText}>
                            {order.child_dietary_restrictions.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

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

                {order.annotations && (
                  <View style={styles.orderSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>📝 ANNOTATIONS</Text>
                    </View>
                    <View style={styles.sectionContent}>
                      <Text style={styles.annotationsText}>{order.annotations}</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exportButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
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
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
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
  personName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  personDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
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
  supplementItem: {
    marginBottom: 6,
  },
  supplementName: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  annotationsText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
