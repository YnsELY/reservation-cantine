import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent, Reservation } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Calendar, UserPlus, History, UtensilsCrossed } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { LineChart } from 'react-native-chart-kit';

interface WeekReservation {
  id: string;
  date: string;
  child_id: string;
  menu_id: string;
  total_price: number;
  children: {
    first_name: string;
    last_name: string;
  };
  menus: {
    meal_name: string;
  };
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [weekReservations, setWeekReservations] = useState<Reservation[]>([]);
  const [upcomingReservations, setUpcomingReservations] = useState<WeekReservation[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<number[]>([0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      const startOfWeek = getStartOfWeek(new Date());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const { data: weekReservationsData } = await supabase
        .from('reservations')
        .select('id, date')
        .eq('parent_id', currentParent.id)
        .gte('date', startOfWeek.toISOString().split('T')[0])
        .lte('date', endOfWeek.toISOString().split('T')[0]);

      setWeekReservations(weekReservationsData || []);

      const { data: upcomingData } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          child_id,
          menu_id,
          total_price,
          children (first_name, last_name),
          menus (meal_name)
        `)
        .eq('parent_id', currentParent.id)
        .gte('date', startOfWeek.toISOString().split('T')[0])
        .lte('date', endOfWeek.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(5);

      setUpcomingReservations(upcomingData || []);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthlyData } = await supabase
        .from('reservations')
        .select('date')
        .eq('parent_id', currentParent.id)
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      const weekCounts = [0, 0, 0, 0];
      monthlyData?.forEach((reservation) => {
        const date = new Date(reservation.date);
        const weekOfMonth = Math.floor((date.getDate() - 1) / 7);
        if (weekOfMonth < 4) {
          weekCounts[weekOfMonth]++;
        }
      });

      setMonthlyOrders(weekCounts);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const renderGauge = () => {
    const maxMeals = 6;
    const bookedMeals = weekReservations.length;
    const percentage = (bookedMeals / maxMeals) * 100;

    const radius = 70;
    const strokeWidth = 14;
    const center = 90;

    const startAngle = -180;
    const totalAngle = 180;
    const progressAngle = (percentage / 100) * totalAngle;

    const startX = center + radius * Math.cos((startAngle * Math.PI) / 180);
    const startY = center + radius * Math.sin((startAngle * Math.PI) / 180);

    const progressEndAngle = startAngle + progressAngle;
    const progressEndX = center + radius * Math.cos((progressEndAngle * Math.PI) / 180);
    const progressEndY = center + radius * Math.sin((progressEndAngle * Math.PI) / 180);

    const largeArcFlag = progressAngle > 180 ? 1 : 0;

    const backgroundPath = `
      M ${startX} ${startY}
      A ${radius} ${radius} 0 1 1 ${center + radius} ${center}
    `;

    const progressPath = progressAngle > 0 ? `
      M ${startX} ${startY}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${progressEndX} ${progressEndY}
    ` : '';

    return (
      <View style={styles.gaugeContainer}>
        <Svg width="180" height="110" viewBox="0 0 180 110">
          <Path
            d={backgroundPath}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {progressPath && (
            <Path
              d={progressPath}
              fill="none"
              stroke="#FCD34D"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <View style={styles.gaugeTextContainer}>
          <Text style={styles.gaugeNumber}>{bookedMeals}/{maxMeals}</Text>
          <Text style={styles.gaugeLabel}>repas réservés</Text>
        </View>
      </View>
    );
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.welcomeText}>
          Bonjour, {parent?.first_name || 'Parent'} 👋
        </Text>

        {renderGauge()}

        <TouchableOpacity
          style={styles.largeButton}
          onPress={() => router.push('/(parent)/reservation')}
        >
          <Calendar size={24} color="#FFFFFF" />
          <Text style={styles.largeButtonText}>Commander un menu</Text>
        </TouchableOpacity>

        <View style={styles.squareButtonsContainer}>
          <TouchableOpacity
            style={styles.squareButton}
            onPress={() => router.push('/(parent)/add-child')}
          >
            <View style={styles.squareButtonIconContainer}>
              <UserPlus size={32} color="#111827" />
            </View>
            <Text style={styles.squareButtonText}>Ajouter un enfant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.squareButton}
            onPress={() => router.push('/(parent)/history')}
          >
            <View style={styles.squareButtonIconContainer}>
              <History size={32} color="#111827" />
            </View>
            <Text style={styles.squareButtonText}>Historique</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Commandes du mois</Text>
          <LineChart
            data={{
              labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
              datasets: [{
                data: monthlyOrders.length > 0 ? monthlyOrders : [0],
              }],
            }}
            width={Dimensions.get('window').width - 48}
            height={200}
            chartConfig={{
              backgroundColor: '#FFFFFF',
              backgroundGradientFrom: '#FFFFFF',
              backgroundGradientTo: '#FFFFFF',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(17, 24, 39, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: {
                borderRadius: 16,
              },
              propsForDots: {
                r: '6',
                strokeWidth: '2',
                stroke: '#111827',
              },
            }}
            bezier
            style={styles.chart}
          />
        </View>

        <View style={styles.reservationsContainer}>
          <Text style={styles.reservationsTitle}>Réservations de la semaine</Text>
          {upcomingReservations.length === 0 ? (
            <View style={styles.emptyReservations}>
              <UtensilsCrossed size={48} color="#D1D5DB" />
              <Text style={styles.emptyReservationsText}>
                Aucune réservation cette semaine
              </Text>
              <TouchableOpacity
                style={styles.emptyReservationsButton}
                onPress={() => router.push('/(parent)/reservation')}
              >
                <Text style={styles.emptyReservationsButtonText}>
                  Commander maintenant
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            upcomingReservations.map((reservation) => (
              <View key={reservation.id} style={styles.reservationCard}>
                <View style={styles.reservationDateBadge}>
                  <Text style={styles.reservationDateText}>
                    {formatDate(reservation.date)}
                  </Text>
                </View>
                <View style={styles.reservationInfo}>
                  <Text style={styles.reservationChildName}>
                    {reservation.children.first_name} {reservation.children.last_name}
                  </Text>
                  <Text style={styles.reservationMenuName}>
                    {reservation.menus.meal_name}
                  </Text>
                  <Text style={styles.reservationPrice}>
                    {reservation.total_price.toFixed(2)} €
                  </Text>
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
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gaugeTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    bottom: 40,
  },
  gaugeNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  gaugeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  largeButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  largeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  squareButtonsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  squareButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 140,
  },
  squareButtonIconContainer: {
    marginBottom: 12,
  },
  squareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  chart: {
    borderRadius: 16,
  },
  chartWrapper: {
    marginLeft: -50,
  },
  reservationsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reservationsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  emptyReservations: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyReservationsText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyReservationsButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyReservationsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  reservationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reservationDateBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 12,
  },
  reservationDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  reservationInfo: {
    flex: 1,
  },
  reservationChildName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  reservationMenuName: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  reservationPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
});
