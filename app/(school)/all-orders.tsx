import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, ShoppingBag } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  menu_name: string;
  menu_price: number;
}

export default function AllOrders() {
  const [school, setSchool] = useState<School | null>(null);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  const selectedDate = params.date as string;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);
      await loadOrders(currentSchool, selectedDate);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOrders = async (currentSchool: School, dateString: string) => {
    try {
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          children!inner(first_name, last_name),
          menus!inner(meal_name, price)
        `)
        .eq('date', dateString)
        .eq('children.school_id', currentSchool.id);

      if (error) throw error;

      const ordersList: OrderDetail[] = (reservations || []).map((res: any) => ({
        id: res.id,
        child_name: `${res.children.first_name} ${res.children.last_name}`,
        menu_name: res.menus.meal_name,
        menu_price: res.menus.price,
      }));

      ordersList.sort((a, b) => a.child_name.localeCompare(b.child_name));
      setOrders(ordersList);
    } catch (err) {
      console.error('Error loading orders:', err);
      setOrders([]);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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

  const totalAmount = orders.reduce((sum, order) => sum + order.menu_price, 0);

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
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Toutes les commandes</Text>
          <Text style={styles.headerSubtitle}>{formatDate(selectedDate)}</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIconContainer}>
          <ShoppingBag size={24} color="#FFFFFF" />
        </View>
        <View style={styles.summaryTextContainer}>
          <Text style={styles.summaryCount}>{orders.length}</Text>
          <Text style={styles.summaryLabel}>Commandes</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryTotalContainer}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalAmount}>{totalAmount.toFixed(2)} €</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ShoppingBag size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucune commande pour ce jour</Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order, index) => (
              <View
                key={order.id}
                style={[
                  styles.orderItem,
                  index % 2 === 0 && styles.orderItemEven
                ]}
              >
                <View style={styles.orderItemLeft}>
                  <Text style={styles.orderChildName}>{order.child_name}</Text>
                  <Text style={styles.orderMenuName}>{order.menu_name}</Text>
                </View>
                <Text style={styles.orderPrice}>{order.menu_price.toFixed(2)} €</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
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
  summaryCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
  },
  summaryTotalContainer: {
    alignItems: 'flex-end',
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  summaryTotalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  orderItemEven: {
    backgroundColor: '#FAFAFA',
  },
  orderItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderChildName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  orderMenuName: {
    fontSize: 14,
    color: '#6B7280',
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
});
