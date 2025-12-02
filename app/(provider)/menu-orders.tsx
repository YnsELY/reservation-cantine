import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, FileDown, User, Users as UsersIcon } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  parent_name: string;
  school_name: string;
  supplements: string | null;
}

export default function MenuOrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const menuName = params.menuName as string;
  const date = params.date as string;
  const menuId = params.menuId as string;

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const { data: reservationsData, error } = await supabase
        .from('reservations')
        .select(`
          id,
          supplements,
          child:children!inner(
            id,
            first_name,
            last_name,
            parent:parents!inner(
              first_name,
              last_name
            ),
            school:schools!inner(
              name
            )
          )
        `)
        .eq('menu_id', menuId)
        .eq('date', date);

      if (error) throw error;

      const formattedOrders: OrderDetail[] = (reservationsData || []).map((reservation: any) => ({
        id: reservation.id,
        child_name: `${reservation.child.first_name} ${reservation.child.last_name}`,
        parent_name: `${reservation.child.parent.first_name} ${reservation.child.parent.last_name}`,
        school_name: reservation.child.school.name,
        supplements: reservation.supplements,
      }));

      setOrders(formattedOrders);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Détails des commandes</Text>
        </View>
        <TouchableOpacity style={styles.exportButton}>
          <FileDown size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.menuName}>{menuName}</Text>
        <Text style={styles.dateText}>{formatDate(date)}</Text>
        <View style={styles.totalBadge}>
          <UsersIcon size={20} color="#FFFFFF" />
          <Text style={styles.totalText}>{orders.length} commande{orders.length > 1 ? 's' : ''}</Text>
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
            <UsersIcon size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>Aucune commande pour ce menu</Text>
          </View>
        ) : (
          orders.map((order, index) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderNumber}>
                <Text style={styles.orderNumberText}>#{index + 1}</Text>
              </View>
              <View style={styles.orderContent}>
                <View style={styles.orderRow}>
                  <User size={18} color="#6B7280" />
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderLabel}>Élève</Text>
                    <Text style={styles.orderValue}>{order.child_name}</Text>
                  </View>
                </View>
                <View style={styles.orderRow}>
                  <User size={18} color="#6B7280" />
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderLabel}>Parent</Text>
                    <Text style={styles.orderValue}>{order.parent_name}</Text>
                  </View>
                </View>
                <View style={styles.orderRow}>
                  <UsersIcon size={18} color="#6B7280" />
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderLabel}>École</Text>
                    <Text style={styles.orderValue}>{order.school_name}</Text>
                  </View>
                </View>
                {order.supplements && (
                  <View style={styles.supplementsContainer}>
                    <Text style={styles.supplementsLabel}>Suppléments</Text>
                    <Text style={styles.supplementsText}>{order.supplements}</Text>
                  </View>
                )}
              </View>
            </View>
          ))
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#111827',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  menuName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  totalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderNumber: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  orderNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  orderContent: {
    padding: 16,
    gap: 12,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  orderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  supplementsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  supplementsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  supplementsText: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
});
