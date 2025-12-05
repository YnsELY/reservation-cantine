import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Calendar, Building2, UtensilsCrossed, BarChart3, Share2, ChefHat, Package } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';

export default function ProviderHomeScreen() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [todayOrdersCount, setTodayOrdersCount] = useState(0);
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [monthlyOrders, setMonthlyOrders] = useState<number[]>([0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        setRefreshing(true);
      }
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      setProvider(currentProvider);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id')
        .eq('provider_id', currentProvider.id);

      const schoolIds = schoolAccess?.map(sa => sa.school_id) || [];
      setSchoolsCount(schoolIds.length);

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      let todayCount = 0;
      if (schoolIds.length > 0) {
        const { data: todayMenusData } = await supabase
          .from('menus')
          .select('id')
          .in('school_id', schoolIds)
          .eq('date', todayStr)
          .eq('available', true);

        const menuIds = (todayMenusData || []).map(m => m.id);

        if (menuIds.length > 0) {
          const { data: todayOrdersData } = await supabase
            .from('reservations')
            .select('id')
            .eq('date', todayStr)
            .in('menu_id', menuIds);

          todayCount = todayOrdersData?.length || 0;
        }
      }

      setTodayOrdersCount(todayCount);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const startMonthStr = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}-${String(startOfMonth.getDate()).padStart(2, '0')}`;
      const endMonthStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

      let allMenuIds: string[] = [];
      if (schoolIds.length > 0) {
        const { data: allMenusData } = await supabase
          .from('menus')
          .select('id, date')
          .in('school_id', schoolIds)
          .gte('date', startMonthStr)
          .lte('date', endMonthStr);

        allMenuIds = (allMenusData || []).map(m => m.id);
      }

      const { data: currentMonthData } = await supabase
        .from('reservations')
        .select('date')
        .in('menu_id', allMenuIds.length > 0 ? allMenuIds : ['']);

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
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Prestataire</Text>
            <Text style={styles.providerName}>{provider?.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={() => router.push('/(provider)/account')}
          >
            <Building2 size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <ChefHat size={24} color="#92400E" />
            <Text style={styles.todayTitle}>Aujourd'hui</Text>
          </View>
          <View style={styles.todayStatsCenter}>
            <Text style={styles.todayStatValue}>{todayOrdersCount}</Text>
            <Text style={styles.todayStatLabel}>Menu{todayOrdersCount > 1 ? 's' : ''} à préparer</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(provider)/menus')}
          >
            <View style={styles.actionIconContainer}>
              <UtensilsCrossed size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.actionTitle}>Gérer les{'\n'}menus</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(provider)/supplements')}
          >
            <View style={styles.actionIconContainer}>
              <Package size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.actionTitle}>Gérer les{'\n'}suppléments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(provider)/preparation')}
          >
            <View style={styles.actionIconContainer}>
              <Calendar size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.actionTitle}>Voir les{'\n'}commandes</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.schoolsButton}
          onPress={() => router.push('/(provider)/schools')}
        >
          <View style={styles.schoolsButtonContent}>
            <Building2 size={24} color="#065F46" />
            <Text style={styles.schoolsButtonText}>Liste des écoles</Text>
            <View style={styles.schoolsBadge}>
              <Text style={styles.schoolsBadgeText}>{schoolsCount}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.secondaryActionCard, { backgroundColor: '#BFDBFE' }]}
            onPress={() => router.push('/(provider)/statistics')}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#1E40AF' }]}>
              <BarChart3 size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.actionTitle, { color: '#1E40AF' }]}>Voir les{"\n"}statistiques</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionCard, { backgroundColor: '#DDD6FE' }]}
            onPress={() => router.push('/(provider)/share-access')}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: '#7C3AED' }]}>
              <Share2 size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.actionTitle, { color: '#7C3AED' }]}>Partager{"\n"}l'accès</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Commandes du mois</Text>
          <Text style={styles.chartSubtitle}>
            {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={styles.chartWrapper}>
            <LineChart
              data={{
                labels: ['S1', 'S2', 'S3', 'S4', 'S5'],
                datasets: [{
                  data: monthlyOrders.length > 0 ? monthlyOrders : [0],
                }],
              }}
              width={Dimensions.get('window').width - 64}
              height={220}
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
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: '#E5E7EB',
                  strokeWidth: 1,
                },
              }}
              bezier
              style={styles.chart}
            />
          </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  accountButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  providerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
  todayCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#92400E',
  },
  todayStatsCenter: {
    alignItems: 'center',
  },
  todayStatValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  todayStatLabel: {
    fontSize: 16,
    color: '#B45309',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 18,
  },
  secondaryActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  schoolsButton: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#A7F3D0',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  schoolsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  schoolsButtonText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#065F46',
  },
  schoolsBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  schoolsBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
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
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  chartWrapper: {
    alignItems: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
});
