import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft } from 'lucide-react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface Reservation {
  id: string;
  date: string;
  child_id: string;
  menu_id: string;
  total_price: number;
  payment_status: string;
  children: {
    first_name: string;
    last_name: string;
  };
  menus: {
    meal_name: string;
    card_color: string;
  };
}

export default function MyMealsScreen() {
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
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

      const { data: reservationsData, error } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          child_id,
          menu_id,
          total_price,
          payment_status,
          children (first_name, last_name),
          menus (meal_name, card_color)
        `)
        .eq('parent_id', currentParent.id)
        .gte('date', startOfWeek.toISOString().split('T')[0])
        .lte('date', endOfWeek.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      setReservations(reservationsData || []);
    } catch (err) {
      console.error('Error loading reservations:', err);
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
    return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderGauge = () => {
    const maxMeals = 6;
    const bookedMeals = reservations.length;
    const percentage = (bookedMeals / maxMeals) * 100;

    const radius = 80;
    const strokeWidth = 16;
    const center = 100;
    const circumference = Math.PI * radius;

    const startAngle = -180;
    const endAngle = 0;
    const totalAngle = endAngle - startAngle;
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
        <Svg width="200" height="130" viewBox="0 0 200 130">
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
        <View style={styles.gaugeContent}>
          <Text style={styles.gaugePercentage}>{bookedMeals}/{maxMeals}</Text>
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
    <LinearGradient
      colors={['#F9FAFB', '#FFFBEB']}
      style={styles.gradientBackground}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes repas</Text>
        </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Réservations de la semaine</Text>
          {renderGauge()}
        </View>

        <View style={styles.reservationsWrapper}>
          <BlurView intensity={200} tint="dark" style={styles.reservationsContainer}>
            <View style={styles.reservationsHeader}>
              <Text style={styles.reservationsTitle}>Repas réservés</Text>
              <Text style={styles.reservationsCount}>{reservations.length}/{6}</Text>
            </View>

            {reservations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aucune réservation cette semaine</Text>
              </View>
            ) : (
              reservations.map((reservation, index) => {
                const pastelColors = [
                  '#FFE5E5',
                  '#E5F5FF',
                  '#FFF4E5',
                  '#F0E5FF',
                  '#E5FFE5',
                  '#FFE5F5',
                ];
                const cardColor = pastelColors[index % pastelColors.length];

                return (
                  <View key={reservation.id} style={[styles.reservationCard, { backgroundColor: cardColor }]}>
                    <View style={styles.reservationLeft}>
                      <View style={styles.reservationInfo}>
                        <Text style={styles.childName}>
                          {reservation.children.first_name} {reservation.children.last_name}
                        </Text>
                        <Text style={styles.mealName}>
                          {reservation.menus.meal_name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.reservationRight}>
                      <Text style={styles.reservationDate}>
                        {formatDate(reservation.date)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </BlurView>
        </View>
      </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function isLightColor(color: string): boolean {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    flexGrow: 1,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  reservationsWrapper: {
    flex: 1,
    marginHorizontal: -20,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 24,
  },
  gaugeContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeContent: {
    position: 'absolute',
    alignItems: 'center',
    bottom: 10,
  },
  gaugePercentage: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
  },
  gaugeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  reservationsContainer: {
    backgroundColor: 'rgba(0, 0, 0)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 20,
    overflow: 'hidden',
    flex: 1,
    paddingBottom: 40,
  },
  reservationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reservationsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reservationsCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  reservationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  reservationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  reservationInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  reservationDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  reservationRight: {
    alignItems: 'flex-end',
  },
  mealName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
});
