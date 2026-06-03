import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import {
  countCancellationsThisWeek,
  createCreditForCancellation,
  MAX_CANCELLATIONS_PER_WEEK,
  CANCELLATION_CUTOFF_HOUR,
} from '@/lib/credits';
import { flagCreditAdded } from '@/lib/credit-events';
import { getWeekStartYmd } from '@/lib/dates';
import { Receipt, AlertCircle, History, ArrowLeft, ChevronLeft, ChevronRight, XCircle } from 'lucide-react-native';
import { NativeSelect } from '@/components/NativeSelect';

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
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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

  const canCancel = (reservation: ReservationWithDetails) => {
    if (reservation.payment_status !== 'paid') return false;
    const cutoff = `T${String(CANCELLATION_CUTOFF_HOUR).padStart(2, '0')}:00:00`;
    const deadline = new Date(`${reservation.date}${cutoff}`);
    return new Date() < deadline;
  };

  const handleCancelReservation = (reservation: ReservationWithDetails) => {
    showAlert(
      'Annuler la commande',
      `Voulez-vous vraiment annuler la commande "${reservation.menu.meal_name}" du ${new Date(reservation.date).toLocaleDateString('fr-FR')} ? Un crédit de ${reservation.total_price.toFixed(2)} DH sera ajouté à votre cagnotte, utilisable quand vous voulez sur un autre repas.`,
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            if (!parent) return;
            setCancellingId(reservation.id);
            try {
              const mealWeekStart = getWeekStartYmd(reservation.date);
              const cancellations = await countCancellationsThisWeek(parent.id, mealWeekStart);
              if (cancellations >= MAX_CANCELLATIONS_PER_WEEK) {
                showAlert(
                  'Limite atteinte',
                  `Vous avez déjà annulé ${MAX_CANCELLATIONS_PER_WEEK} commandes cette semaine. Vous pourrez à nouveau annuler la semaine prochaine.`
                );
                return;
              }

              const { error: updateError } = await supabase
                .from('reservations')
                .update({
                  payment_status: 'cancelled',
                  cancelled_at: new Date().toISOString(),
                })
                .eq('id', reservation.id);

              if (updateError) throw updateError;

              const { ok, error: creditError } = await createCreditForCancellation({
                parentId: parent.id,
                reservationId: reservation.id,
                amount: Number(reservation.total_price),
                mealDate: reservation.date,
              });

              if (!ok) {
                // Crédit non créé : on annule l'annulation pour éviter une commande
                // annulée sans contrepartie en cagnotte.
                await supabase
                  .from('reservations')
                  .update({ payment_status: 'paid', cancelled_at: null })
                  .eq('id', reservation.id);
                console.error('Credit creation failed:', creditError);
                showAlert('Erreur', "L'annulation n'a pas pu être finalisée (crédit non créé). Réessayez.");
                return;
              }

              flagCreditAdded();
              await loadData();
              showAlert(
                'Commande annulée',
                `Un crédit de ${Number(reservation.total_price).toFixed(2)} DH a été ajouté à votre cagnotte. Vous pourrez l'utiliser quand vous voulez, sur n'importe quel repas.`
              );
            } catch (err: any) {
              console.error('Error cancelling reservation:', err);
              showAlert('Erreur', err.message || "Impossible d'annuler la commande");
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
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

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);

    switch (periodFilter) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        break;
    }

    setSelectedDate(newDate);
  };

  const filteredReservations = getFilteredReservations();
  const statistics = getStatistics();

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0E5FC0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity onPress={() => safeBack('/(parent)')} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <History size={20} color="#FFFFFF" />
          <Text style={styles.badgeText}>Historique de commande</Text>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <NativeSelect
              value={periodFilter}
              onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}
              placeholder=""
              title="Sélectionner une période"
              options={[
                { value: 'all', label: 'Tout' },
                { value: 'day', label: 'Jour' },
                { value: 'week', label: 'Semaine' },
                { value: 'month', label: 'Mois' },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <NativeSelect
              value={selectedChild}
              onValueChange={setSelectedChild}
              placeholder=""
              title="Sélectionner un enfant"
              options={[
                { value: 'all', label: 'Tous les enfants' },
                ...children.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` })),
              ]}
            />
          </View>
        </View>

        {periodFilter !== 'all' && (
          <View style={styles.dateNavigator}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => navigatePeriod('prev')}
            >
              <ChevronLeft size={20} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.periodLabel}>{getPeriodLabel()}</Text>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => navigatePeriod('next')}
            >
              <ChevronRight size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        )}
        {periodFilter === 'all' && (
          <Text style={styles.periodLabel}>{getPeriodLabel()}</Text>
        )}
      </View>

      <View style={styles.statisticsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{statistics.count}</Text>
          <Text style={styles.statLabel}>Commande{statistics.count > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{statistics.total.toFixed(2)} DH</Text>
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
                      {reservation.total_price.toFixed(2)} DH
                    </Text>
                  </View>

                  {canCancel(reservation) && (
                    <TouchableOpacity
                      style={[styles.cancelButton, cancellingId === reservation.id && styles.cancelButtonDisabled]}
                      onPress={() => handleCancelReservation(reservation)}
                      disabled={cancellingId === reservation.id}
                    >
                      {cancellingId === reservation.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <XCircle size={18} color="#FFFFFF" />
                          <Text style={styles.cancelButtonText}>Annuler la commande</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
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
    backgroundColor: '#F4F6FB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#F4F6FB',
  },
  backButton: {
    padding: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E5FC0',
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
    backgroundColor: '#F4F6FB',
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
    flex: 1,
  },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navButton: {
    backgroundColor: '#F4F6FB',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statisticsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: '#F4F6FB',
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
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  cancelButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: '#F4F6FB',
  },
  modalOptionSelected: {
    backgroundColor: '#0E5FC0',
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
