import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Receipt, AlertCircle, History, ArrowLeft, ChevronDown } from 'lucide-react-native';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
}

interface ReservationWithDetails {
  id: string;
  date: string;
  total_price: number;
  payment_status: string;
  annotations: string | null;
  child: {
    id: string;
    first_name: string;
    last_name: string;
  };
  menu: {
    meal_name: string;
  };
}

type PeriodFilter = 'day' | 'week' | 'month' | 'all';

export default function HistoryScreen() {
  const [parent, setParent] = useState<Parent | null>(null);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedChild, setSelectedChild] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showChildModal, setShowChildModal] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const router = useRouter();

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

      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, last_name')
        .eq('parent_id', currentParent.id);

      if (childrenError) throw childrenError;
      setChildren(childrenData || []);

      const { data, error: reservationsError } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          payment_status,
          annotations,
          child_id,
          children:child_id (
            id,
            first_name,
            last_name
          ),
          menus:menu_id (
            meal_name
          )
        `)
        .eq('parent_id', currentParent.id)
        .order('date', { ascending: false });

      if (reservationsError) throw reservationsError;

      const formattedData = (data || []).map((item: any) => ({
        id: item.id,
        date: item.date,
        total_price: item.total_price,
        payment_status: item.payment_status,
        annotations: item.annotations,
        child: {
          id: item.child_id,
          first_name: item.children?.first_name,
          last_name: item.children?.last_name,
        },
        menu: item.menus,
      }));

      setReservations(formattedData);
      setError('');
    } catch (err) {
      console.error('Error loading reservations:', err);
      setError('Erreur lors du chargement de l\'historique');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'cancelled':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Payé';
      case 'pending':
        return 'En attente';
      case 'cancelled':
        return 'Annulé';
      default:
        return status;
    }
  };

  const getFilteredReservations = () => {
    let filtered = reservations;

    if (selectedChild !== 'all') {
      filtered = filtered.filter(r => r.child.id === selectedChild);
    }

    if (periodFilter !== 'all') {
      const now = selectedDate;
      filtered = filtered.filter(r => {
        const reservationDate = new Date(r.date);

        if (periodFilter === 'day') {
          return reservationDate.toDateString() === now.toDateString();
        } else if (periodFilter === 'week') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          return reservationDate >= startOfWeek && reservationDate <= endOfWeek;
        } else if (periodFilter === 'month') {
          return reservationDate.getMonth() === now.getMonth() &&
                 reservationDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    return filtered;
  };

  const getStatistics = () => {
    const filtered = getFilteredReservations();
    const count = filtered.length;
    const total = filtered.reduce((sum, r) => sum + r.total_price, 0);
    return { count, total };
  };

  const getPeriodLabel = () => {
    const date = selectedDate;
    switch (periodFilter) {
      case 'day':
        return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      case 'week':
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
      case 'month':
        return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      default:
        return 'Toutes les périodes';
    }
  };

  const filteredReservations = getFilteredReservations();
  const statistics = getStatistics();

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <History size={20} color="#FFFFFF" />
          <Text style={styles.badgeText}>Historique de commande</Text>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowPeriodModal(true)}
          >
            <Text style={styles.filterButtonText}>
              {periodFilter === 'day' ? 'Jour' :
               periodFilter === 'week' ? 'Semaine' :
               periodFilter === 'month' ? 'Mois' : 'Tout'}
            </Text>
            <ChevronDown size={16} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowChildModal(true)}
          >
            <Text style={styles.filterButtonText}>
              {selectedChild === 'all'
                ? 'Tous les enfants'
                : children.find(c => c.id === selectedChild)?.first_name || 'Enfant'}
            </Text>
            <ChevronDown size={16} color="#111827" />
          </TouchableOpacity>
        </View>

        <Text style={styles.periodLabel}>{getPeriodLabel()}</Text>
      </View>

      <Modal
        visible={showPeriodModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPeriodModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPeriodModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner une période</Text>
            {[{value: 'day', label: 'Jour'}, {value: 'week', label: 'Semaine'}, {value: 'month', label: 'Mois'}, {value: 'all', label: 'Tout'}].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.modalOption,
                  periodFilter === option.value && styles.modalOptionSelected
                ]}
                onPress={() => {
                  setPeriodFilter(option.value as PeriodFilter);
                  setShowPeriodModal(false);
                }}
              >
                <Text style={[
                  styles.modalOptionText,
                  periodFilter === option.value && styles.modalOptionTextSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showChildModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChildModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowChildModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner un enfant</Text>
            <TouchableOpacity
              style={[
                styles.modalOption,
                selectedChild === 'all' && styles.modalOptionSelected
              ]}
              onPress={() => {
                setSelectedChild('all');
                setShowChildModal(false);
              }}
            >
              <Text style={[
                styles.modalOptionText,
                selectedChild === 'all' && styles.modalOptionTextSelected
              ]}>
                Tous les enfants
              </Text>
            </TouchableOpacity>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.modalOption,
                  selectedChild === child.id && styles.modalOptionSelected
                ]}
                onPress={() => {
                  setSelectedChild(child.id);
                  setShowChildModal(false);
                }}
              >
                <Text style={[
                  styles.modalOptionText,
                  selectedChild === child.id && styles.modalOptionTextSelected
                ]}>
                  {child.first_name} {child.last_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <View style={styles.statisticsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{statistics.count}</Text>
          <Text style={styles.statLabel}>Commande{statistics.count > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{statistics.total.toFixed(2)} €</Text>
          <Text style={styles.statLabel}>Total payé</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {filteredReservations.length === 0 ? (
          <View style={styles.emptyState}>
            <Receipt size={48} color="#9CA3AF" />
            <Text style={styles.emptyStateTitle}>Aucune réservation</Text>
            <Text style={styles.emptyStateText}>
              Vos réservations passées apparaîtront ici
            </Text>
          </View>
        ) : (
          <View style={styles.reservationsList}>
            {filteredReservations.map((reservation) => (
              <View key={reservation.id} style={styles.reservationCard}>
                <View style={styles.reservationHeader}>
                  <Text style={styles.reservationDate}>
                    {new Date(reservation.date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(reservation.payment_status) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(reservation.payment_status) },
                      ]}
                    >
                      {getStatusLabel(reservation.payment_status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.reservationDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Enfant:</Text>
                    <Text style={styles.detailValue}>
                      {reservation.child.first_name} {reservation.child.last_name}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Menu:</Text>
                    <Text style={styles.detailValue}>{reservation.menu.meal_name}</Text>
                  </View>

                  {reservation.annotations && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Notes:</Text>
                      <Text style={styles.detailValue}>{reservation.annotations}</Text>
                    </View>
                  )}

                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Total:</Text>
                    <Text style={styles.priceValue}>
                      {reservation.total_price.toFixed(2)} €
                    </Text>
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
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignSelf: 'flex-start',
    gap: 8,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  periodLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  statisticsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    marginTop: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  reservationsList: {
    padding: 16,
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reservationDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reservationDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    minWidth: 60,
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  modalOptionSelected: {
    backgroundColor: '#111827',
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },
  modalOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
