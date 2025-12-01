import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from 'lucide-react-native';

interface OrderDetails {
  id: string;
  child: {
    first_name: string;
    last_name: string;
    grade: string | null;
    allergies: string[];
    dietary_restrictions: string[];
  };
  parent: {
    first_name: string;
    last_name: string;
    phone: string | null;
  };
  supplements: any[];
  annotations: string | null;
  total_price: number;
  created_at: string;
}

export default function OrdersPage() {
  const { menuId, menuName, date } = useLocalSearchParams();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, [menuId]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          total_price,
          supplements,
          annotations,
          created_at,
          child:children(
            first_name,
            last_name,
            grade,
            allergies,
            dietary_restrictions
          ),
          parent:parents(
            first_name,
            last_name,
            phone
          )
        `)
        .eq('menu_id', menuId)
        .eq('date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data as any || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{formatDate(date as string)}</Text>
          </View>
          <Text style={styles.menuTitle}>{menuName}</Text>
          <Text style={styles.orderCount}>{orders.length} commande{orders.length !== 1 ? 's' : ''}</Text>
        </View>
        {orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <User size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Aucune commande</Text>
            <Text style={styles.emptyDescription}>
              Aucun élève n'a commandé ce menu pour le moment
            </Text>
          </View>
        ) : (
          orders.map((order, index) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <View style={styles.studentInfo}>
                  <View style={styles.studentAvatar}>
                    <Text style={styles.studentAvatarText}>
                      {order.child.first_name[0]}{order.child.last_name[0]}
                    </Text>
                  </View>
                  <View style={styles.studentDetails}>
                    <Text style={styles.studentName}>
                      {order.child.first_name} {order.child.last_name}
                    </Text>
                    {order.child.grade && (
                      <Text style={styles.studentGrade}>{order.child.grade}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.orderNumber}>
                  <Text style={styles.orderNumberText}>#{index + 1}</Text>
                </View>
              </View>

              {(order.child.allergies?.length > 0 || order.child.dietary_restrictions?.length > 0) && (
                <View style={styles.allergySection}>
                  {order.child.allergies?.length > 0 && (
                    <View style={styles.allergyContainer}>
                      <Text style={styles.allergyLabel}>Allergies:</Text>
                      <Text style={styles.allergyText}>
                        {order.child.allergies.join(', ')}
                      </Text>
                    </View>
                  )}
                  {order.child.dietary_restrictions?.length > 0 && (
                    <View style={styles.allergyContainer}>
                      <Text style={styles.allergyLabel}>Restrictions:</Text>
                      <Text style={styles.allergyText}>
                        {order.child.dietary_restrictions.join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {order.annotations && (
                <View style={styles.annotationsSection}>
                  <Text style={styles.annotationsLabel}>Annotations:</Text>
                  <Text style={styles.annotationsText}>{order.annotations}</Text>
                </View>
              )}

              <View style={styles.orderCardFooter}>
                <View style={styles.parentInfo}>
                  <Text style={styles.parentLabel}>Parent</Text>
                  <Text style={styles.parentName}>
                    {order.parent.first_name} {order.parent.last_name}
                  </Text>
                  {order.parent.phone && (
                    <Text style={styles.parentPhone}>{order.parent.phone}</Text>
                  )}
                </View>
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
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  dateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  dateBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  menuTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  orderCount: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  studentGrade: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  orderNumber: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  orderNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  allergySection: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  allergyContainer: {
    marginBottom: 8,
  },
  allergyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  allergyText: {
    fontSize: 14,
    color: '#78350F',
    fontWeight: '500',
  },
  annotationsSection: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  annotationsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  annotationsText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  orderCardFooter: {
    padding: 20,
    paddingTop: 16,
  },
  parentInfo: {
    gap: 4,
  },
  parentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  parentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  parentPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
});
