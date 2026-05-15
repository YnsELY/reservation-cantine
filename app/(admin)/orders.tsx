import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import {
  ArrowLeft, Calendar, User, ShoppingBag, Search, X,
  ChevronRight, Building2, Truck, ListOrdered,
} from 'lucide-react-native';

type TabKey = 'all' | 'date' | 'provider' | 'school';

interface OrderData {
  id: string;
  date: string;
  total_price: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  cancelled_at: string | null;
  child: {
    id: string;
    first_name: string;
    last_name: string;
    grade: string | null;
  };
  parent: {
    first_name: string;
    last_name: string;
    email: string | null;
  };
  menu: {
    meal_name: string;
    id: string;
  };
  school: {
    name: string;
    id: string;
  };
  provider: {
    name: string;
    id: string;
  } | null;
  created_at: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatLongDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  const formatted = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const statusLabel = (s: OrderData['payment_status']) => {
  if (s === 'paid') return 'Payée';
  if (s === 'pending') return 'En attente';
  return 'Annulée';
};

const statusColor = (s: OrderData['payment_status']) => {
  if (s === 'paid') return { bg: '#D1FAE5', fg: '#065F46' };
  if (s === 'pending') return { bg: '#FEF3C7', fg: '#92400E' };
  return { bg: '#FEE2E2', fg: '#991B1B' };
};

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: reservationsRaw } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          payment_status,
          cancelled_at,
          created_at,
          parent_id,
          child:children!child_id(
            id,
            first_name,
            last_name,
            grade,
            school:schools(id, name)
          ),
          menu:menus(
            id,
            meal_name,
            provider:providers(id, company_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(2000);

      let parentsById = new Map<string, any>();
      const parentIds = Array.from(
        new Set((reservationsRaw || []).map((r: any) => r.parent_id).filter(Boolean))
      );
      if (parentIds.length > 0) {
        const { data: parentsData } = await supabase
          .from('parents')
          .select('id, first_name, last_name, email')
          .in('id', parentIds);
        parentsById = new Map((parentsData || []).map((p: any) => [p.id, p]));
      }

      const formatted: OrderData[] = (reservationsRaw || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        total_price: Number(r.total_price),
        payment_status: r.payment_status,
        cancelled_at: r.cancelled_at,
        child: r.child,
        parent: parentsById.get(r.parent_id) || { first_name: '', last_name: '', email: null },
        menu: { id: r.menu.id, meal_name: r.menu.meal_name },
        school: r.child.school,
        provider: r.menu.provider
          ? { id: r.menu.provider.id, name: r.menu.provider.company_name || 'Sans nom' }
          : null,
        created_at: r.created_at,
      }));

      setOrders(formatted);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    return orders.filter(order =>
      order.child.first_name.toLowerCase().includes(searchQuery) ||
      order.child.last_name.toLowerCase().includes(searchQuery) ||
      order.parent.first_name.toLowerCase().includes(searchQuery) ||
      order.parent.last_name.toLowerCase().includes(searchQuery) ||
      order.menu.meal_name.toLowerCase().includes(searchQuery) ||
      order.school.name.toLowerCase().includes(searchQuery) ||
      (order.provider?.name?.toLowerCase().includes(searchQuery) ?? false) ||
      (order.child.grade?.toLowerCase().includes(searchQuery) ?? false)
    );
  }, [orders, searchQuery]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, OrderData[]>();
    filteredOrders.forEach(o => {
      const list = map.get(o.date) || [];
      list.push(o);
      map.set(o.date, list);
    });
    return Array.from(map.entries())
      .map(([date, list]) => ({
        date,
        count: list.length,
        schools: new Set(list.map(o => o.school.id)).size,
        providers: new Set(list.map(o => o.provider?.id).filter(Boolean)).size,
        revenue: list.reduce((s, o) => s + o.total_price, 0),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredOrders]);

  const providerGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; list: OrderData[] }>();
    filteredOrders.forEach(o => {
      if (!o.provider) return;
      const entry = map.get(o.provider.id) || { id: o.provider.id, name: o.provider.name, list: [] };
      entry.list.push(o);
      map.set(o.provider.id, entry);
    });
    return Array.from(map.values())
      .map(g => ({
        id: g.id,
        name: g.name,
        count: g.list.length,
        schools: new Set(g.list.map(o => o.school.id)).size,
        revenue: g.list.reduce((s, o) => s + o.total_price, 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredOrders]);

  const schoolGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; list: OrderData[] }>();
    filteredOrders.forEach(o => {
      const entry = map.get(o.school.id) || { id: o.school.id, name: o.school.name, list: [] };
      entry.list.push(o);
      map.set(o.school.id, entry);
    });
    return Array.from(map.values())
      .map(g => ({
        id: g.id,
        name: g.name,
        count: g.list.length,
        children: new Set(g.list.map(o => o.child.id)).size,
        providers: new Set(g.list.map(o => o.provider?.id).filter(Boolean)).size,
        revenue: g.list.reduce((s, o) => s + o.total_price, 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredOrders]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(admin)')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Liste des commandes</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <ShoppingBag size={26} color="#4F46E5" />
          <Text style={styles.statValue}>{filteredOrders.length}</Text>
          <Text style={styles.statLabel}>Commandes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statCurrency}>DH</Text>
          <Text style={styles.statValue}>
            {filteredOrders.reduce((s, o) => s + o.total_price, 0).toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Revenu</Text>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher (élève, parent, école, classe...)"
            value={searchInput}
            onChangeText={setSearchInput}
            placeholderTextColor="#9CA3AF"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity onPress={() => setSearchInput('')}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {([
            { key: 'all', label: 'Toutes', icon: ListOrdered },
            { key: 'date', label: 'Par date', icon: Calendar },
            { key: 'provider', label: 'Par prestataire', icon: Truck },
            { key: 'school', label: 'Par école', icon: Building2 },
          ] as { key: TabKey; label: string; icon: any }[]).map(t => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(t.key)}
              >
                <Icon size={16} color={active ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {activeTab === 'all' && <AllOrdersList orders={filteredOrders} />}
      {activeTab === 'date' && <DateGroupList groups={dateGroups} />}
      {activeTab === 'provider' && <ProviderGroupList groups={providerGroups} />}
      {activeTab === 'school' && <SchoolGroupList groups={schoolGroups} />}
    </SafeAreaView>
  );
}

function AllOrdersList({ orders }: { orders: OrderData[] }) {
  if (orders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ShoppingBag size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Aucune commande</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {orders.map(order => {
        const sColor = statusColor(order.payment_status);
        return (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View style={styles.schoolBadge}>
                <Text style={styles.schoolBadgeText}>{order.school.name}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: sColor.bg }]}>
                <Text style={[styles.statusBadgeText, { color: sColor.fg }]}>
                  {statusLabel(order.payment_status)}
                </Text>
              </View>
            </View>

            <View style={styles.orderBody}>
              <Row icon={Calendar} label="Menu du" value={formatLongDate(order.date)} />
              <Row icon={ShoppingBag} label="Repas" value={order.menu.meal_name} />
              <Row
                icon={User}
                label="Élève"
                value={`${order.child.first_name} ${order.child.last_name}${order.child.grade ? ` — ${order.child.grade}` : ''}`}
              />
              {order.provider && <Row icon={Truck} label="Prestataire" value={order.provider.name} />}
              <Row
                icon={User}
                label="Parent"
                value={`${order.parent.first_name} ${order.parent.last_name}`}
                subValue={order.parent.email || undefined}
              />
            </View>

            <View style={styles.orderFooter}>
              <Text style={styles.orderDate}>Commandé le {formatDateTime(order.created_at)}</Text>
              <Text style={styles.orderPrice}>{order.total_price.toFixed(2)} DH</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Row({ icon: Icon, label, value, subValue }: { icon: any; label: string; value: string; subValue?: string }) {
  return (
    <View style={styles.orderRow}>
      <View style={styles.iconContainer}>
        <Icon size={18} color="#6B7280" />
      </View>
      <View style={styles.orderRowContent}>
        <Text style={styles.orderRowLabel}>{label}</Text>
        <Text style={styles.orderRowValue}>{value}</Text>
        {subValue && <Text style={styles.orderRowSubValue}>{subValue}</Text>}
      </View>
    </View>
  );
}

function DateGroupList({ groups }: { groups: { date: string; count: number; schools: number; providers: number; revenue: number }[] }) {
  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Calendar size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Aucune date</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {groups.map(g => (
        <TouchableOpacity
          key={g.date}
          style={styles.groupCard}
          onPress={() => router.push({ pathname: '/(admin)/orders-date-detail' as any, params: { date: g.date } })}
        >
          <View style={styles.groupHeader}>
            <Calendar size={20} color="#4F46E5" />
            <Text style={styles.groupTitle}>{formatLongDate(g.date)}</Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
          <View style={styles.groupMetrics}>
            <Metric label="Commandes" value={g.count} accent="#4F46E5" />
            <Metric label="Écoles" value={g.schools} accent="#0EA5E9" />
            <Metric label="Prestataires" value={g.providers} accent="#10B981" />
          </View>
          <Text style={styles.groupRevenue}>{g.revenue.toFixed(2)} DH</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ProviderGroupList({ groups }: { groups: { id: string; name: string; count: number; schools: number; revenue: number }[] }) {
  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Truck size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Aucun prestataire</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {groups.map(g => (
        <TouchableOpacity
          key={g.id}
          style={styles.groupCard}
          onPress={() => router.push({ pathname: '/(admin)/orders-provider-detail' as any, params: { providerId: g.id } })}
        >
          <View style={styles.groupHeader}>
            <Truck size={20} color="#10B981" />
            <Text style={styles.groupTitle}>{g.name}</Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
          <View style={styles.groupMetrics}>
            <Metric label="Repas" value={g.count} accent="#10B981" />
            <Metric label="Écoles" value={g.schools} accent="#0EA5E9" />
          </View>
          <Text style={styles.groupRevenue}>{g.revenue.toFixed(2)} DH</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function SchoolGroupList({ groups }: { groups: { id: string; name: string; count: number; children: number; providers: number; revenue: number }[] }) {
  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Building2 size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Aucune école</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {groups.map(g => (
        <TouchableOpacity
          key={g.id}
          style={styles.groupCard}
          onPress={() => router.push({ pathname: '/(admin)/orders-school-detail' as any, params: { schoolId: g.id } })}
        >
          <View style={styles.groupHeader}>
            <Building2 size={20} color="#0EA5E9" />
            <Text style={styles.groupTitle}>{g.name}</Text>
            <ChevronRight size={20} color="#9CA3AF" />
          </View>
          <View style={styles.groupMetrics}>
            <Metric label="Commandes" value={g.count} accent="#0EA5E9" />
            <Metric label="Élèves" value={g.children} accent="#4F46E5" />
            <Metric label="Prestataires" value={g.providers} accent="#10B981" />
          </View>
          <Text style={styles.groupRevenue}>{g.revenue.toFixed(2)} DH</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  topSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, backgroundColor: '#F9FAFB' },
  backButton: {
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12,
  },
  badge: { alignSelf: 'flex-start', backgroundColor: '#4F46E5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  badgeText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  statsContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  statCurrency: { fontSize: 22, fontWeight: '700', color: '#4F46E5' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 4 },
  statLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 },
  searchSection: { paddingHorizontal: 16, marginBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, height: 48, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  tabsContainer: { marginBottom: 12 },
  tabsScroll: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
  },
  tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },
  content: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  schoolBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  schoolBadgeText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  orderBody: { padding: 16, gap: 12 },
  orderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconContainer: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
  },
  orderRowContent: { flex: 1 },
  orderRowLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  orderRowValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  orderRowSubValue: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  orderFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  orderDate: { fontSize: 12, color: '#9CA3AF' },
  orderPrice: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16 },
  groupCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  groupMetrics: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metric: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center',
  },
  metricValue: { fontSize: 20, fontWeight: '700' },
  metricLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  groupRevenue: { fontSize: 13, fontWeight: '600', color: '#10B981', textAlign: 'right' },
});
