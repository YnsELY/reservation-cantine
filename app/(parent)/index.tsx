import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Parent, Reservation } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Calendar, UserPlus, History, UtensilsCrossed, User, ShoppingCart } from 'lucide-react-native';
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

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  school_id: string;
}

interface ChildWithStatus extends Child {
  reservationCount: number;
  status: 'none' | 'partial' | 'complete';
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [weekReservations, setWeekReservations] = useState<Reservation[]>([]);
  const [upcomingReservations, setUpcomingReservations] = useState<WeekReservation[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<number[]>([0, 0, 0, 0, 0]);
  const [childrenCount, setChildrenCount] = useState(0);
  const [children, setChildren] = useState<ChildWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('=== PAGE FOCUSED - RELOADING DATA ===');
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/auth');
        return;
      }

      console.log('=== DEBUG SESSION ===');
      console.log('User ID:', session.user.id);
      console.log('User Email:', session.user.email);

      const { data: parentData } = await supabase
        .from('parents')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      console.log('=== DEBUG PARENT ===');
      console.log('Parent Data:', parentData);

      if (!parentData) {
        router.replace('/auth');
        return;
      }

      setParent(parentData);

      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, last_name, date_of_birth, school_id')
        .eq('parent_id', parentData.id);

      console.log('=== DEBUG CHILDREN ===');
      console.log('Children Query for parent_id:', parentData.id);
      console.log('Children Data:', childrenData);
      console.log('Children Error:', childrenError);

      if (childrenError) {
        console.error('Error loading children:', childrenError);
      }

      setChildrenCount(childrenData?.length || 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const startOfWeek = getStartOfWeek(new Date());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 5);

      const startDateStr = startOfWeek.toISOString().split('T')[0];
      const endDateStr = endOfWeek.toISOString().split('T')[0];

      const childrenWithStatus: ChildWithStatus[] = await Promise.all(
        (childrenData || []).map(async (child) => {
          const { data: reservations } = await supabase
            .from('reservations')
            .select('id')
            .eq('child_id', child.id)
            .gte('date', startDateStr)
            .lte('date', endDateStr);

          const reservationCount = reservations?.length || 0;
          let status: 'none' | 'partial' | 'complete' = 'none';

          if (reservationCount === 0) {
            status = 'none';
          } else if (reservationCount >= 5) {
            status = 'complete';
          } else {
            status = 'partial';
          }

          return {
            ...child,
            reservationCount,
            status,
          };
        })
      );

      setChildren(childrenWithStatus);

      const { data: weekReservationsData } = await supabase
        .from('reservations')
        .select('id, date')
        .eq('parent_id', parentData.id)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

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
        .eq('parent_id', parentData.id)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(10);

      setUpcomingReservations(upcomingData || []);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: currentMonthData } = await supabase
        .from('reservations')
        .select('date')
        .eq('parent_id', parentData.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      const getWeekOfMonth = (date: Date) => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfMonth = date.getDate();
        const firstDayOfWeek = firstDay.getDay();
        const offsetDate = dayOfMonth + firstDayOfWeek - 1;
        return Math.ceil(offsetDate / 7);
      };

      const weekCounts = [0, 0, 0, 0, 0];
      currentMonthData?.forEach((reservation) => {
        const date = new Date(reservation.date);
        const weekNum = getWeekOfMonth(date) - 1;
        if (weekNum >= 0 && weekNum < 5) {
          weekCounts[weekNum]++;
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

  const getAvatarColor = (status: 'none' | 'partial' | 'complete') => {
    switch (status) {
      case 'none':
        return '#EF4444';
      case 'partial':
        return '#F59E0B';
      case 'complete':
        return '#10B981';
      default:
        return '#9CA3AF';
    }
  };

  const getStatusText = (status: 'none' | 'partial' | 'complete', count: number) => {
    switch (status) {
      case 'none':
        return 'Aucune réservation cette semaine';
      case 'partial':
        return `${count} jour${count > 1 ? 's' : ''} réservé${count > 1 ? 's' : ''}`;
      case 'complete':
        return 'Semaine complète';
      default:
        return '';
    }
  };

  const renderGauge = () => {
    const daysPerWeek = 6;
    const maxMeals = childrenCount * daysPerWeek;
    const bookedMeals = weekReservations.length;
    const percentage = maxMeals > 0 ? (bookedMeals / maxMeals) * 100 : 0;

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
          <Text style={styles.gaugeLabel}>menus réservés</Text>
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
      <View style={styles.header}>
        <Text style={styles.welcomeText}>
          Bonjour, {parent?.first_name || 'Parent'} 👋
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(parent)/cart')}
          >
            <ShoppingCart size={24} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(parent)/profile')}
          >
            <User size={24} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >

        <View style={styles.childrenSection}>
          <Text style={styles.childrenTitle}>Mes enfants</Text>
          {children.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childrenList}
            >
              {children.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.childCard,
                    {
                      borderColor: getAvatarColor(child.status) + '99',
                      shadowColor: getAvatarColor(child.status),
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                    }
                  ]}
                  onPress={() => router.push({
                    pathname: '/(parent)/child-details',
                    params: { childId: child.id }
                  })}
                >
                  <View style={styles.childAvatar}>
                    <User size={40} color="#6B7280" />
                  </View>
                  <Text style={styles.childName}>
                    {child.first_name}
                  </Text>
                  <Text style={styles.childName}>
                    {child.last_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyChildren}>
              <Text style={styles.emptyChildrenText}>
                Aucun enfant enregistré
              </Text>
              <TouchableOpacity
                style={styles.addChildSmallButton}
                onPress={() => router.push('/(parent)/add-child')}
              >
                <UserPlus size={20} color="#FFFFFF" />
                <Text style={styles.addChildSmallButtonText}>
                  Ajouter un enfant
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
            style={[styles.squareButton, styles.addChildButton]}
            onPress={() => router.push('/(parent)/add-child')}
          >
            <View style={styles.squareButtonIconContainer}>
              <UserPlus size={32} color="#065F46" />
            </View>
            <Text style={[styles.squareButtonText, styles.addChildButtonText]}>Ajouter un enfant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.squareButton, styles.historyButton]}
            onPress={() => router.push('/(parent)/history')}
          >
            <View style={styles.squareButtonIconContainer}>
              <History size={32} color="#1E40AF" />
            </View>
            <Text style={[styles.squareButtonText, styles.historyButtonText]}>Historique</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Commandes du mois</Text>
          <View style={styles.chartWrapper}>
            <LineChart
              data={{
                labels: ['Sem1', 'Sem2', 'Sem3', 'Sem4', 'Sem5'],
                datasets: [{
                  data: monthlyOrders.some(v => v > 0) ? monthlyOrders : [0.1, 0.1, 0.1, 0.1, 0.1],
                }],
              }}
              width={Dimensions.get('window').width - 50}
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
              renderDotContent={({ x, y, index }) => {
                const value = monthlyOrders[index] || 0;
                if (value === 0) return null;
                return (
                  <Text
                    key={index}
                    style={{
                      position: 'absolute',
                      left: x - 15,
                      top: y - 20,
                      fontSize: 12,
                      fontWeight: '600',
                      color: '#111827',
                      textAlign: 'center',
                      width: 30,
                    }}
                  >
                    {value.toFixed(0)}
                  </Text>
                );
              }}
            />
          </View>
        </View>

        <View style={styles.reservationsContainer}>
          <Text style={styles.reservationsTitle}>Prochaines réservations</Text>
          {upcomingReservations.length === 0 ? (
            <View style={styles.emptyReservations}>
              <UtensilsCrossed size={48} color="#D1D5DB" />
              <Text style={styles.emptyReservationsText}>
                Aucune réservation à venir
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
            <ScrollView
              style={styles.reservationsScrollView}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {upcomingReservations.map((reservation) => (
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
              ))}
            </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
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
  childrenSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  childrenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  childrenList: {
    paddingVertical: 4,
    gap: 12,
  },
  childCard: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 3,
    minWidth: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  childAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  emptyChildren: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyChildrenText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  addChildSmallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addChildSmallButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  addChildButton: {
    backgroundColor: '#A7F3D0',
  },
  addChildButtonText: {
    color: '#065F46',
  },
  historyButton: {
    backgroundColor: '#BFDBFE',
  },
  historyButtonText: {
    color: '#1E40AF',
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
    marginLeft: -20,
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
  reservationsScrollView: {
    maxHeight: 280,
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
    minHeight: 70,
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
