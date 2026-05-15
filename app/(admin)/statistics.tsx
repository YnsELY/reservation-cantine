import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import {
  ArrowLeft, ShoppingCart, DollarSign, ChevronLeft, ChevronRight,
  XCircle, Clock, Calendar as CalendarIcon, Building2, Truck,
} from 'lucide-react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText, Rect } from 'react-native-svg';

type PeriodType = 'day' | 'week' | 'month' | 'year';

interface RawReservation {
  date: string;
  total_price: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  cancelled_at: string | null;
  created_at: string;
  child: { school: { id: string; name: string } | null } | null;
  menu: { provider: { id: string; company_name: string } | null } | null;
}

interface ChartData {
  labels: string[];
  values: number[];
}

interface Distribution {
  name: string;
  count: number;
  revenue: number;
}

const formatDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AdminStatistics() {
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservations, setReservations] = useState<RawReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    void loadData();
  }, [periodType, currentDate]);

  const dateRange = useMemo(() => {
    const date = currentDate;
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (periodType === 'day') {
      return { start: formatDate(new Date(year, month, day)), end: formatDate(new Date(year, month, day)) };
    }
    if (periodType === 'week') {
      const currentDay = date.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay;
      return {
        start: formatDate(new Date(year, month, day + diff)),
        end: formatDate(new Date(year, month, day + diff + 6)),
      };
    }
    if (periodType === 'month') {
      return { start: formatDate(new Date(year, month, 1)), end: formatDate(new Date(year, month + 1, 0)) };
    }
    return { start: formatDate(new Date(year, 0, 1)), end: formatDate(new Date(year, 11, 31)) };
  }, [periodType, currentDate]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data } = await supabase
        .from('reservations')
        .select(`
          date, total_price, payment_status, cancelled_at, created_at,
          child:children!child_id(school:schools(id, name)),
          menu:menus(provider:providers(id, company_name))
        `)
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .limit(5000);

      const formatted: RawReservation[] = (data || []).map((r: any) => ({
        date: r.date,
        total_price: Number(r.total_price) || 0,
        payment_status: r.payment_status,
        cancelled_at: r.cancelled_at,
        created_at: r.created_at,
        child: r.child,
        menu: r.menu,
      }));
      setReservations(formatted);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = reservations.length;
    const cancelled = reservations.filter(r => r.payment_status === 'cancelled' || r.cancelled_at).length;
    const active = total - cancelled;
    const revenue = reservations.filter(r => r.payment_status !== 'cancelled').reduce((s, r) => s + r.total_price, 0);
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;
    return { total, active, cancelled, revenue, cancellationRate };
  }, [reservations]);

  const ordersChart: ChartData = useMemo(() => {
    if (periodType === 'day') {
      return { labels: ['Aujourd\'hui'], values: [reservations.length] };
    }
    if (periodType === 'week') {
      const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      const values = new Array(7).fill(0);
      reservations.forEach(r => {
        const [y, m, d] = r.date.split('-').map(Number);
        const day = new Date(y, m - 1, d).getDay();
        const idx = day === 0 ? 6 : day - 1;
        values[idx] += 1;
      });
      return { labels, values };
    }
    if (periodType === 'month') {
      const labels = ['S1', 'S2', 'S3', 'S4', 'S5'];
      const values = new Array(5).fill(0);
      reservations.forEach(r => {
        const [, , d] = r.date.split('-').map(Number);
        const idx = Math.min(Math.floor((d - 1) / 7), 4);
        values[idx] += 1;
      });
      return { labels, values };
    }
    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const values = new Array(12).fill(0);
    reservations.forEach(r => {
      const [, m] = r.date.split('-').map(Number);
      values[m - 1] += 1;
    });
    return { labels, values };
  }, [reservations, periodType]);

  const peakHours: ChartData = useMemo(() => {
    const buckets = new Array(24).fill(0);
    reservations.forEach(r => {
      const h = new Date(r.created_at).getHours();
      buckets[h] += 1;
    });
    return {
      labels: ['0', '3', '6', '9', '12', '15', '18', '21'],
      values: buckets,
    };
  }, [reservations]);

  const peakWeekday: ChartData = useMemo(() => {
    const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const values = new Array(7).fill(0);
    reservations.forEach(r => {
      const d = new Date(r.created_at);
      const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      values[idx] += 1;
    });
    return { labels, values };
  }, [reservations]);

  const schoolDist: Distribution[] = useMemo(() => {
    const map = new Map<string, Distribution>();
    reservations.forEach(r => {
      const name = r.child?.school?.name || 'Sans école';
      const e = map.get(name) || { name, count: 0, revenue: 0 };
      e.count += 1;
      if (r.payment_status !== 'cancelled') e.revenue += r.total_price;
      map.set(name, e);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reservations]);

  const providerDist: Distribution[] = useMemo(() => {
    const map = new Map<string, Distribution>();
    reservations.forEach(r => {
      const name = r.menu?.provider?.company_name || 'Sans prestataire';
      const e = map.get(name) || { name, count: 0, revenue: 0 };
      e.count += 1;
      if (r.payment_status !== 'cancelled') e.revenue += r.total_price;
      map.set(name, e);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reservations]);

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const d = new Date(currentDate);
    if (periodType === 'day') d.setDate(d.getDate() + (direction === 'next' ? 1 : -1));
    else if (periodType === 'week') d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
    else if (periodType === 'month') d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    else d.setFullYear(d.getFullYear() + (direction === 'next' ? 1 : -1));
    setCurrentDate(d);
  };

  const periodLabel = useMemo(() => {
    const d = currentDate;
    if (periodType === 'day') return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    if (periodType === 'week') {
      const [sy, sm, sd] = dateRange.start.split('-').map(Number);
      const [ey, em, ed] = dateRange.end.split('-').map(Number);
      const s = new Date(sy, sm - 1, sd);
      const e = new Date(ey, em - 1, ed);
      return `${s.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${e.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (periodType === 'month') return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return d.getFullYear().toString();
  }, [currentDate, periodType, dateRange]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(admin)')} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.periodSelector}>
          {(['day', 'week', 'month', 'year'] as PeriodType[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodButton, periodType === p && styles.periodButtonActive]}
              onPress={() => setPeriodType(p)}
            >
              <Text style={[styles.periodButtonText, periodType === p && styles.periodButtonTextActive]}>
                {p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Année'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.periodNavigation}>
          <TouchableOpacity onPress={() => navigatePeriod('prev')} style={styles.navButton}>
            <ChevronLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{periodLabel}</Text>
          <TouchableOpacity onPress={() => navigatePeriod('next')} style={styles.navButton}>
            <ChevronRight size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <KpiCard icon={ShoppingCart} value={stats.active.toString()} label="Commandes actives" color="#1E40AF" bg="#DBEAFE" />
          <KpiCard icon={DollarSign} value={`${stats.revenue.toFixed(0)} DH`} label="Revenu" color="#065F46" bg="#D1FAE5" />
        </View>
        <View style={styles.statsGrid}>
          <KpiCard icon={XCircle} value={stats.cancelled.toString()} label="Annulées" color="#991B1B" bg="#FEE2E2" />
          <KpiCard icon={XCircle} value={`${stats.cancellationRate}%`} label="Taux d'annulation" color="#92400E" bg="#FEF3C7" />
        </View>

        <Section title="Commandes sur la période" icon={ShoppingCart}>
          <BarChart data={ordersChart.values} labels={ordersChart.labels} color="#3B82F6" />
        </Section>

        <Section title="Pic d'activité par heure (commande)" icon={Clock}>
          <BarChart data={peakHours.values} labels={Array.from({ length: 24 }, (_, i) => `${i}h`)} color="#8B5CF6" compact />
        </Section>

        <Section title="Pic d'activité par jour" icon={CalendarIcon}>
          <BarChart data={peakWeekday.values} labels={peakWeekday.labels} color="#F59E0B" />
        </Section>

        <Section title="Stats par école" icon={Building2}>
          <DistributionList items={schoolDist} accent="#0EA5E9" />
        </Section>

        <Section title="Stats par prestataire" icon={Truck}>
          <DistributionList items={providerDist} accent="#10B981" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon: Icon, value, label, color, bg }: { icon: any; value: string; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: bg }]}>
      <Icon size={22} color={color} />
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon size={16} color="#111827" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DistributionList({ items, accent }: { items: Distribution[]; accent: string }) {
  if (items.length === 0) {
    return <Text style={styles.emptyText}>Aucune donnée</Text>;
  }
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <View style={{ gap: 10 }}>
      {items.slice(0, 8).map(item => (
        <View key={item.name}>
          <View style={styles.distRow}>
            <Text style={styles.distName} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.distCount, { color: accent }]}>{item.count}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(item.count / max) * 100}%`, backgroundColor: accent }]} />
          </View>
          {item.revenue > 0 && (
            <Text style={styles.distRevenue}>{item.revenue.toFixed(0)} DH</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function BarChart({ data, labels, color, compact = false }: { data: number[]; labels: string[]; color: string; compact?: boolean }) {
  const width = 320;
  const height = compact ? 160 : 200;
  const paddingLeft = 24;
  const paddingRight = 12;
  const paddingTop = 30;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const max = Math.max(...data, 1);
  const barCount = data.length;
  const barGap = compact ? 1 : 4;
  const barWidth = Math.max(2, (chartWidth - barGap * (barCount - 1)) / barCount);

  const labelStep = compact ? Math.max(1, Math.floor(barCount / labels.length)) : 1;

  return (
    <View style={styles.chartWrap}>
      <Svg width={width} height={height}>
        <Line
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
          stroke="#E5E7EB"
          strokeWidth={1}
        />
        {data.map((v, i) => {
          const x = paddingLeft + i * (barWidth + barGap);
          const h = (v / max) * chartHeight;
          const y = height - paddingBottom - h;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={color}
              rx={2}
            />
          );
        })}
        {!compact && data.map((v, i) => {
          if (v === 0) return null;
          const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2;
          const y = height - paddingBottom - (v / max) * chartHeight - 6;
          return (
            <SvgText key={`v-${i}`} x={x} y={y} fontSize={10} fill="#111827" textAnchor="middle" fontWeight="600">
              {v}
            </SvgText>
          );
        })}
        {labels.map((label, i) => {
          const showAt = compact ? i * labelStep : i;
          const x = paddingLeft + showAt * (barWidth + barGap) + barWidth / 2;
          return (
            <SvgText
              key={`l-${i}`}
              x={x}
              y={height - paddingBottom + 16}
              fontSize={10}
              fill="#6B7280"
              textAnchor="middle"
              fontWeight="600"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  content: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  periodSelector: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 16 },
  periodButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  periodButtonActive: { backgroundColor: '#111827' },
  periodButtonText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  periodButtonTextActive: { color: '#FFFFFF' },
  periodNavigation: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  navButton: { padding: 4 },
  periodLabel: { fontSize: 15, fontWeight: '600', color: '#111827', textAlign: 'center', flex: 1 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  kpiValue: { fontSize: 22, fontWeight: '700', marginTop: 6 },
  kpiLabel: { fontSize: 11, color: '#374151', fontWeight: '600', marginTop: 2 },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  chartWrap: { alignItems: 'center' },
  distRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  distName: { fontSize: 13, color: '#111827', fontWeight: '600', flex: 1, marginRight: 8 },
  distCount: { fontSize: 14, fontWeight: '700' },
  distRevenue: { fontSize: 11, color: '#6B7280', marginTop: 4, textAlign: 'right' },
  barTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 16 },
});
