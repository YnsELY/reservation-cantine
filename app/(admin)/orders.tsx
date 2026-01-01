import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Calendar, User, ShoppingBag, Search, Filter, X, ChevronDown } from 'lucide-react-native';

interface OrderData {
  id: string;
  date: string;
  total_price: number;
  child: {
    first_name: string;
    last_name: string;
    grade: string | null;
  };
  parent: {
    first_name: string;
    last_name: string;
    email: string | null;
  };
  menu: {
    meal_name: string;
    id: string;
  };
  school: {
    name: string;
    id: string;
  };
  provider: {
    name: string;
    id: string;
  } | null;
  created_at: string;
}

interface FilterOption {
  id: string;
  name: string;
}

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const [menus, setMenus] = useState<FilterOption[]>([]);
  const [schools, setSchools] = useState<FilterOption[]>([]);
  const [providers, setProviders] = useState<FilterOption[]>([]);

  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [schoolDropdownOpen, setSchoolDropdownOpen] = useState(false);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, searchQuery, selectedDate, selectedMenu, selectedSchool, selectedProvider]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: reservations } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          created_at,
          child:children(
            first_name,
            last_name,
            grade,
            school:schools(id, name)
          ),
          parent:parents(
            first_name,
            last_name,
            email
          ),
          menu:menus(
            id,
            meal_name,
            provider:providers(id, company_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (reservations) {
        const formattedOrders: OrderData[] = reservations.map((r: any) => ({
          id: r.id,
          date: r.date,
          total_price: r.total_price,
          child: r.child,
          parent: r.parent,
          menu: {
            id: r.menu.id,
            meal_name: r.menu.meal_name
          },
          school: r.child.school,
          provider: r.menu.provider,
          created_at: r.created_at
        }));

        setOrders(formattedOrders);

        const uniqueMenus: FilterOption[] = Array.from(
          new Map(formattedOrders.map(o => [o.menu.id, { id: o.menu.id, name: o.menu.meal_name }])).values()
        );
        setMenus(uniqueMenus);

        const uniqueSchools: FilterOption[] = Array.from(
          new Map(formattedOrders.map(o => [o.school.id, { id: o.school.id, name: o.school.name }])).values()
        );
        setSchools(uniqueSchools);

        const uniqueProviders: FilterOption[] = Array.from(
          new Map(
            formattedOrders
              .filter(o => o.provider)
              .map(o => [o.provider!.id, { id: o.provider!.id, name: (o.provider as any).company_name || o.provider!.name || 'Sans nom' }])
          ).values()
        );
        setProviders(uniqueProviders);

        const total = formattedOrders.reduce((sum, order) => sum + Number(order.total_price), 0);
        setTotalRevenue(total);
      }
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...orders];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.child.first_name.toLowerCase().includes(query) ||
        order.child.last_name.toLowerCase().includes(query) ||
        order.parent.first_name.toLowerCase().includes(query) ||
        order.parent.last_name.toLowerCase().includes(query) ||
        order.menu.meal_name.toLowerCase().includes(query) ||
        order.school.name.toLowerCase().includes(query) ||
        (order.provider?.name?.toLowerCase().includes(query) ?? false)
      );
    }

    if (selectedDate) {
      filtered = filtered.filter(order => order.date === selectedDate);
    }

    if (selectedMenu) {
      filtered = filtered.filter(order => order.menu.id === selectedMenu);
    }

    if (selectedSchool) {
      filtered = filtered.filter(order => order.school.id === selectedSchool);
    }

    if (selectedProvider) {
      filtered = filtered.filter(order => order.provider?.id === selectedProvider);
    }

    setFilteredOrders(filtered);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDate(null);
    setSelectedMenu(null);
    setSelectedSchool(null);
    setSelectedProvider(null);
    setDateDropdownOpen(false);
    setMenuDropdownOpen(false);
    setSchoolDropdownOpen(false);
    setProviderDropdownOpen(false);
  };

  const setTodayFilter = () => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    setDateDropdownOpen(false);
    setMenuDropdownOpen(false);
    setSchoolDropdownOpen(false);
    setProviderDropdownOpen(false);
    setFilterModalVisible(false);
  };

  const activeFiltersCount = [selectedDate, selectedMenu, selectedSchool, selectedProvider].filter(Boolean).length;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
          <Text style={styles.badgeText}>Liste des commandes</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <ShoppingBag size={32} color="#4F46E5" />
          <Text style={styles.statValue}>{filteredOrders.length}</Text>
          <Text style={styles.statLabel}>Commandes affichées</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statCurrency}>DH</Text>
          <Text style={styles.statValue}>
            {filteredOrders.reduce((sum, o) => sum + Number(o.total_price), 0).toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Revenu affiché</Text>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher commandes..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Filter size={20} color="#4F46E5" />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeFiltersCount > 0 && (
        <View style={styles.activeFiltersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>
            {selectedDate && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Date: {formatDate(selectedDate)}</Text>
                <TouchableOpacity onPress={() => setSelectedDate(null)}>
                  <X size={16} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            )}
            {selectedMenu && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  Menu: {menus.find(m => m.id === selectedMenu)?.name}
                </Text>
                <TouchableOpacity onPress={() => setSelectedMenu(null)}>
                  <X size={16} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            )}
            {selectedSchool && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  École: {schools.find(s => s.id === selectedSchool)?.name}
                </Text>
                <TouchableOpacity onPress={() => setSelectedSchool(null)}>
                  <X size={16} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            )}
            {selectedProvider && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  Prestataire: {providers.find(p => p.id === selectedProvider)?.name}
                </Text>
                <TouchableOpacity onPress={() => setSelectedProvider(null)}>
                  <X size={16} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Tout effacer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShoppingBag size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Aucune commande</Text>
          <Text style={styles.emptyDescription}>
            Les commandes apparaîtront ici
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={styles.schoolBadge}>
                  <Text style={styles.schoolBadgeText}>{order.school.name}</Text>
                </View>
                <Text style={styles.orderPrice}>{Number(order.total_price).toFixed(2)} DH</Text>
              </View>

              <View style={styles.orderBody}>
                <View style={styles.orderRow}>
                  <View style={styles.iconContainer}>
                    <Calendar size={18} color="#6B7280" />
                  </View>
                  <View style={styles.orderRowContent}>
                    <Text style={styles.orderRowLabel}>Menu du</Text>
                    <Text style={styles.orderRowValue}>{formatDate(order.date)}</Text>
                  </View>
                </View>

                <View style={styles.orderRow}>
                  <View style={styles.iconContainer}>
                    <ShoppingBag size={18} color="#6B7280" />
                  </View>
                  <View style={styles.orderRowContent}>
                    <Text style={styles.orderRowLabel}>Menu</Text>
                    <Text style={styles.orderRowValue}>{order.menu.meal_name}</Text>
                  </View>
                </View>

                <View style={styles.orderRow}>
                  <View style={styles.iconContainer}>
                    <User size={18} color="#6B7280" />
                  </View>
                  <View style={styles.orderRowContent}>
                    <Text style={styles.orderRowLabel}>Élève</Text>
                    <Text style={styles.orderRowValue}>
                      {order.child.first_name} {order.child.last_name}
                      {order.child.grade && ` - ${order.child.grade}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderRow}>
                  <View style={styles.iconContainer}>
                    <User size={18} color="#6B7280" />
                  </View>
                  <View style={styles.orderRowContent}>
                    <Text style={styles.orderRowLabel}>Parent</Text>
                    <Text style={styles.orderRowValue}>
                      {order.parent.first_name} {order.parent.last_name}
                    </Text>
                    {order.parent.email && (
                      <Text style={styles.orderRowSubValue}>{order.parent.email}</Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.orderFooter}>
                <Text style={styles.orderDate}>
                  Commandé le {formatDateTime(order.created_at)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filtres</Text>
            <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
              <X size={24} color="#111827" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.quickFilterButton} onPress={setTodayFilter}>
              <Calendar size={20} color="#FFFFFF" />
              <Text style={styles.quickFilterText}>Aujourd'hui</Text>
            </TouchableOpacity>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Date du menu</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setDateDropdownOpen(!dateDropdownOpen)}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedDate ? formatDate(selectedDate) : 'Toutes les dates'}
                </Text>
                <ChevronDown size={20} color="#6B7280" />
              </TouchableOpacity>
              {dateDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedDate(null);
                      setDateDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, !selectedDate && styles.dropdownItemTextActive]}>
                      Toutes les dates
                    </Text>
                  </TouchableOpacity>
                  {Array.from(new Set(orders.map(o => o.date)))
                    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                    .map(date => (
                      <TouchableOpacity
                        key={date}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedDate(date);
                          setDateDropdownOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, selectedDate === date && styles.dropdownItemTextActive]}>
                          {formatDate(date)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Menu</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setMenuDropdownOpen(!menuDropdownOpen)}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedMenu ? menus.find(m => m.id === selectedMenu)?.name : 'Tous les menus'}
                </Text>
                <ChevronDown size={20} color="#6B7280" />
              </TouchableOpacity>
              {menuDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedMenu(null);
                      setMenuDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, !selectedMenu && styles.dropdownItemTextActive]}>
                      Tous les menus
                    </Text>
                  </TouchableOpacity>
                  {menus.map(menu => (
                    <TouchableOpacity
                      key={menu.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedMenu(menu.id);
                        setMenuDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedMenu === menu.id && styles.dropdownItemTextActive]}>
                        {menu.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>École</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setSchoolDropdownOpen(!schoolDropdownOpen)}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedSchool ? schools.find(s => s.id === selectedSchool)?.name : 'Toutes les écoles'}
                </Text>
                <ChevronDown size={20} color="#6B7280" />
              </TouchableOpacity>
              {schoolDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedSchool(null);
                      setSchoolDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, !selectedSchool && styles.dropdownItemTextActive]}>
                      Toutes les écoles
                    </Text>
                  </TouchableOpacity>
                  {schools.map(school => (
                    <TouchableOpacity
                      key={school.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedSchool(school.id);
                        setSchoolDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedSchool === school.id && styles.dropdownItemTextActive]}>
                        {school.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Prestataire</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setProviderDropdownOpen(!providerDropdownOpen)}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedProvider ? providers.find(p => p.id === selectedProvider)?.name : 'Tous les prestataires'}
                </Text>
                <ChevronDown size={20} color="#6B7280" />
              </TouchableOpacity>
              {providerDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedProvider(null);
                      setProviderDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, !selectedProvider && styles.dropdownItemTextActive]}>
                      Tous les prestataires
                    </Text>
                  </TouchableOpacity>
                  {providers.map(provider => (
                    <TouchableOpacity
                      key={provider.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedProvider(provider.id);
                        setProviderDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedProvider === provider.id && styles.dropdownItemTextActive]}>
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={clearFilters}>
              <Text style={styles.modalSecondaryButtonText}>Réinitialiser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.modalPrimaryButtonText}>Appliquer</Text>
            </TouchableOpacity>
          </View>
          </View>
        </View>
      </Modal>
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
    gap: 12,
    marginBottom: 16,
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
  statCurrency: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4F46E5',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  schoolBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  schoolBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  orderPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  orderBody: {
    padding: 16,
    gap: 12,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderRowContent: {
    flex: 1,
  },
  orderRowLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  orderRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  orderRowSubValue: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  orderFooter: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  orderDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeFiltersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  activeFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  clearFiltersButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '75%',
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalBody: {
    padding: 20,
  },
  quickFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  quickFilterText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  filterOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  filterOptionActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterOptionTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#111827',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#6B7280',
  },
  dropdownItemTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modalSecondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalPrimaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#4F46E5',
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
