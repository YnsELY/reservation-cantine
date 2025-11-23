import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent, Menu } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { UtensilsCrossed, AlertCircle } from 'lucide-react-native';

interface MenuWithReservations extends Menu {
  reservation_count: number;
}

export default function MenusManagement() {
  const [currentAdmin, setCurrentAdmin] = useState<Parent | null>(null);
  const [menus, setMenus] = useState<MenuWithReservations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const admin = await authService.getCurrentParentFromAuth();
      if (!admin || !admin.is_admin) {
        router.replace('/auth');
        return;
      }

      setCurrentAdmin(admin);

      const today = new Date();
      const twoWeeksLater = new Date(today);
      twoWeeksLater.setDate(today.getDate() + 14);

      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .eq('school_id', admin.school_id)
        .gte('date', today.toISOString().split('T')[0])
        .lte('date', twoWeeksLater.toISOString().split('T')[0])
        .order('date');

      if (menusError) throw menusError;

      const menusWithCounts = await Promise.all(
        (menusData || []).map(async (menu) => {
          const { count } = await supabase
            .from('reservations')
            .select('*', { count: 'exact', head: true })
            .eq('menu_id', menu.id);

          return {
            ...menu,
            reservation_count: count || 0,
          };
        })
      );

      setMenus(menusWithCounts);
      setError('');
    } catch (err) {
      console.error('Error loading menus:', err);
      setError('Erreur lors du chargement des menus');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Menus</Text>
          <Text style={styles.headerSubtitle}>{menus.length} menu(s) à venir</Text>
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

        {menus.length === 0 ? (
          <View style={styles.emptyState}>
            <UtensilsCrossed size={48} color="#9CA3AF" />
            <Text style={styles.emptyStateTitle}>Aucun menu</Text>
            <Text style={styles.emptyStateText}>
              Les menus des 2 prochaines semaines apparaîtront ici
            </Text>
          </View>
        ) : (
          <View style={styles.menusList}>
            {menus.map((menu) => (
              <View key={menu.id} style={styles.menuCard}>
                <View style={styles.menuHeader}>
                  <Text style={styles.menuDate}>{formatDate(menu.date)}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{menu.reservation_count}</Text>
                  </View>
                </View>

                <Text style={styles.menuName}>{menu.meal_name}</Text>

                {menu.description && (
                  <Text style={styles.menuDescription} numberOfLines={2}>
                    {menu.description}
                  </Text>
                )}

                <View style={styles.menuFooter}>
                  <Text style={styles.menuPrice}>{menu.price.toFixed(2)} €</Text>
                  {!menu.available && (
                    <View style={styles.unavailableBadge}>
                      <Text style={styles.unavailableText}>Indisponible</Text>
                    </View>
                  )}
                </View>

                {menu.allergens.length > 0 && (
                  <View style={styles.allergensContainer}>
                    <Text style={styles.allergensLabel}>Allergènes:</Text>
                    <Text style={styles.allergensText}>{menu.allergens.join(', ')}</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
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
  menusList: {
    padding: 16,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'capitalize',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  menuFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  unavailableBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unavailableText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  allergensContainer: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
    marginTop: 12,
  },
  allergensLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  allergensText: {
    fontSize: 12,
    color: '#92400E',
  },
});
