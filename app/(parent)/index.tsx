import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Parent, Reservation } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Calendar, UserPlus, History, UtensilsCrossed, User, ShoppingCart, Clock, Check } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { LineChart } from 'react-native-chart-kit';
import { useNotifications } from '@/hooks/useNotifications';

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
    description: string | null;
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

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Prochaine date commandable: aujourd'hui si avant 7h, sinon demain (règle identique à reservation.tsx)
const getFirstBookableDate = (): Date => {
  const now = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const deadline = new Date();
  deadline.setHours(7, 0, 0, 0);
  if (now >= deadline) {
    start.setDate(start.getDate() + 1);
  }
  return start;
};

const getTargetLabel = (target: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return "aujourd'hui";
  if (diffDays === 1) return 'demain';
  return t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
};

function OrderCountdown({ deadlineMs, onExpire }: { deadlineMs: number; onExpire?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadlineMs && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const remaining = Math.max(0, deadlineMs - now);
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.countdownTimer}>
      <Clock size={20} color="#EA580C" />
      <Text style={styles.countdownValue}>{pad(h)}h {pad(m)}m {pad(s)}s</Text>
    </View>
  );
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [weekReservations, setWeekReservations] = useState<Reservation[]>([]);
  const [upcomingReservations, setUpcomingReservations] = useState<WeekReservation[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<number[]>([0, 0, 0, 0, 0]);
  const [childrenCount, setChildrenCount] = useState(0);
  const [children, setChildren] = useState<ChildWithStatus[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [countdown, setCountdown] = useState<{
    deadlineMs: number;
    label: string;
    missing: ChildWithStatus[];
    hasService: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Register push notifications
  useNotifications(parent?.id, 'parent');

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

      const { count: cartItemCount } = await supabase
        .from('cart_items')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', parentData.id);
      setCartCount(cartItemCount || 0);

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

      // Compte à rebours: prochaine échéance de commande (jour J à 7h)
      const targetDate = getFirstBookableDate();
      const targetDateStr = formatDateToLocal(targetDate);
      const childSchoolIds = Array.from(
        new Set((childrenData || []).map((c) => c.school_id).filter(Boolean))
      );

      let hasService = false;
      let missing: ChildWithStatus[] = [];
      if (childSchoolIds.length > 0) {
        const { data: targetMenus } = await supabase
          .from('menus')
          .select('school_id')
          .in('school_id', childSchoolIds)
          .eq('date', targetDateStr)
          .eq('available', true);
        const schoolsWithService = new Set<string>(
          (targetMenus || []).map((m: any) => m.school_id)
        );

        const { data: targetReservations } = await supabase
          .from('reservations')
          .select('child_id')
          .eq('parent_id', parentData.id)
          .eq('date', targetDateStr)
          .neq('payment_status', 'cancelled');
        const orderedChildIds = new Set<string>(
          (targetReservations || []).map((r: any) => r.child_id)
        );

        const servableChildren = childrenWithStatus.filter((c) =>
          schoolsWithService.has(c.school_id)
        );
        hasService = servableChildren.length > 0;
        missing = servableChildren.filter((c) => !orderedChildIds.has(c.id));
      }

      const deadline = new Date(targetDate);
      deadline.setHours(7, 0, 0, 0);
      setCountdown({
        deadlineMs: deadline.getTime(),
        label: getTargetLabel(targetDate),
        missing,
        hasService,
      });

      const { data: upcomingData } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          child_id,
          menu_id,
          total_price,
          children (first_name, last_name),
          menus (meal_name, description)
        `)
        .eq('parent_id', parentData.id)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(100);

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
    const pct = maxMeals > 0 ? Math.min(1, bookedMeals / maxMeals) : 0;

    const size = 190;
    const strokeWidth = 16;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const dash = circumference * pct;

    return (
      <View style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {pct > 0 && (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#F97316"
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
            />
          )}
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.ringNumber}>{bookedMeals}/{maxMeals}</Text>
          <Text style={styles.ringLabel}>menus réservés</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E293B" />
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
            <ShoppingCart size={24} color="#1E293B" />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(parent)/profile')}
          >
            <User size={24} color="#1E293B" />
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
                    { borderColor: getAvatarColor(child.status) }
                  ]}
                  onPress={() => router.push({
                    pathname: '/(parent)/child-details',
                    params: { childId: child.id }
                  })}
                >
                  <View style={styles.childAvatar}>
                    <User size={36} color="#1E293B" />
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

        <View style={styles.weekCard}>
          <Text style={styles.weekCardTitle}>Réservations de la semaine</Text>
          {renderGauge()}
          <Text style={styles.weekPhrase}>
            N'oubliez pas de commander les repas pour la semaine prochaine !
          </Text>

          {countdown?.hasService && (
            <>
              <View style={styles.weekDivider} />
              {countdown.missing.length > 0 ? (
                <View>
                  <View style={styles.countdownHeaderRow}>
                    <Text style={styles.countdownTitle}>
                      Temps restant pour commander {countdown.label}
                    </Text>
                  </View>
                  <OrderCountdown deadlineMs={countdown.deadlineMs} onExpire={loadData} />
                  <Text style={styles.missingLabel}>
                    Sans commande pour {countdown.label} :
                  </Text>
                  <View style={styles.missingChips}>
                    {countdown.missing.map((child) => (
                      <View key={child.id} style={styles.missingChip}>
                        <Text style={styles.missingChipText}>
                          {child.first_name} {child.last_name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.allOrderedRow}>
                  <Check size={18} color="#059669" />
                  <Text style={styles.allOrderedText}>
                    Tout est commandé pour {countdown.label} 🎉
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.orderButton}
          onPress={() => router.push('/(parent)/reservation')}
        >
          <View style={styles.orderButtonTextWrap}>
            <Text style={styles.orderButtonTitle}>Commander un menu</Text>
            <Text style={styles.orderButtonSubtitle}>ACTION PRIORITAIRE</Text>
          </View>
          <UtensilsCrossed size={30} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.squareButtonsContainer}>
          <TouchableOpacity
            style={styles.squareButton}
            onPress={() => router.push('/(parent)/add-child')}
          >
            <View style={styles.squareButtonIconCircle}>
              <UserPlus size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.squareButtonText}>Ajouter un enfant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.squareButton}
            onPress={() => router.push('/(parent)/history')}
          >
            <View style={styles.squareButtonIconCircle}>
              <History size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.squareButtonText}>Historique</Text>
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
              color: (opacity = 1) => `rgba(30, 41, 59, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: {
                borderRadius: 16,
              },
              propsForDots: {
                r: '6',
                strokeWidth: '2',
                stroke: '#1E293B',
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
                      color: '#1E293B',
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
              {(() => {
                const groups = new Map<string, { childName: string; items: WeekReservation[] }>();
                upcomingReservations.forEach((res) => {
                  const childName = `${res.children?.first_name || ''} ${res.children?.last_name || ''}`.trim() || 'Enfant';
                  if (!groups.has(res.child_id)) {
                    groups.set(res.child_id, { childName, items: [] });
                  }
                  groups.get(res.child_id)!.items.push(res);
                });
                return Array.from(groups.entries()).map(([childId, group]) => (
                  <View key={childId} style={styles.childGroup}>
                    <Text style={styles.childGroupName}>{group.childName}</Text>
                    <View style={styles.childGroupUnderline} />
                    {group.items.map((reservation) => (
                      <View key={reservation.id} style={styles.menuCard}>
                        <View style={styles.menuDatePill}>
                          <Text style={styles.menuDatePillText}>
                            {formatDate(reservation.date)}
                          </Text>
                        </View>
                        <View style={styles.menuRow}>
                          <Text style={styles.menuName} numberOfLines={1}>
                            {reservation.menus?.meal_name || 'Menu'}
                          </Text>
                          <Text style={styles.menuPrice}>
                            {Number(reservation.total_price).toFixed(2)} DH
                          </Text>
                        </View>
                        {reservation.menus?.description ? (
                          <Text style={styles.menuDescription} numberOfLines={2}>
                            {reservation.menus.description}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ));
              })()}
            </ScrollView>
          )}
        </View>

        <Image
          source={require('@/assets/images/Box2.png')}
          style={styles.bottomBanner}
          resizeMode="contain"
        />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#F4F6FB',
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
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    color: '#1E293B',
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
    color: '#1E293B',
  },
  gaugeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  weekCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  weekCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringNumber: {
    fontSize: 40,
    fontWeight: '800',
    color: '#1E293B',
  },
  ringLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  weekPhrase: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 21,
  },
  weekDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 18,
  },
  countdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  countdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  countdownTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    backgroundColor: '#FFF1E7',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginBottom: 14,
  },
  countdownValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#C2410C',
    fontVariant: ['tabular-nums'],
  },
  missingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    textAlign: 'center',
  },
  missingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  missingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  missingChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  allOrderedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  allOrderedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  orderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F97316',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginBottom: 24,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 5,
  },
  orderButtonTextWrap: {
    flex: 1,
  },
  orderButtonTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  orderButtonSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.6)',
    letterSpacing: 1.5,
    marginTop: 2,
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
    color: '#1E293B',
    marginBottom: 16,
  },
  childrenList: {
    paddingVertical: 4,
    gap: 12,
  },
  childCard: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    minWidth: 112,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  childAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF2FB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E9F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    minHeight: 140,
  },
  squareButtonIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  squareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
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
    color: '#1E293B',
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
    color: '#1E293B',
    marginBottom: 16,
  },
  reservationsScrollView: {
    maxHeight: 360,
  },
  childGroup: {
    marginBottom: 16,
  },
  childGroupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  childGroupUnderline: {
    height: 1.5,
    backgroundColor: '#1E293B',
    marginBottom: 12,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  menuDatePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FB',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 10,
  },
  menuDatePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  menuName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  menuPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  menuDescription: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
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
    backgroundColor: '#1E293B',
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
    color: '#1E293B',
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
    color: '#1E293B',
  },
  bottomBanner: {
    width: '100%',
    height: 200,
    marginTop: 16,
    marginBottom: -100,
    borderRadius: 0,
  },
});
