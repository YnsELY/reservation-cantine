import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, ShoppingCart, DollarSign, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

type PeriodType = 'day' | 'week' | 'month' | 'year';

interface ChartData {
  labels: string[];
  orders: number[];
  revenue: number[];
}

interface Provider {
  id: string;
  company_name: string;
}

export default function AdminStatistics() {
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [chartData, setChartData] = useState<ChartData>({ labels: [], orders: [], revenue: [] });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    loadData();
  }, [periodType, currentDate, selectedProviderId]);

  const loadProviders = async () => {
    try {
      const { data } = await supabase
        .from('providers')
        .select('id, company_name')
        .order('company_name');

      setProviders(data || []);
    } catch (err) {
      console.error('Error loading providers:', err);
    }
  };

  const getDateRange = () => {
    const date = new Date(currentDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (periodType === 'day') {
      const start = formatDate(new Date(year, month, day));
      const end = formatDate(new Date(year, month, day));
      return { start, end };
    }

    if (periodType === 'week') {
      const currentDay = date.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay;
      const weekStart = new Date(year, month, day + diff);
      const weekEnd = new Date(year, month, day + diff + 4);
      return { start: formatDate(weekStart), end: formatDate(weekEnd) };
    }

    if (periodType === 'month') {
      const start = formatDate(new Date(year, month, 1));
      const end = formatDate(new Date(year, month + 1, 0));
      return { start, end };
    }

    if (periodType === 'year') {
      const start = formatDate(new Date(year, 0, 1));
      const end = formatDate(new Date(year, 11, 31));
      return { start, end };
    }

    return { start: formatDate(date), end: formatDate(date) };
  };

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { start, end } = getDateRange();

      let reservationsQuery = supabase
        .from('reservations')
        .select('date, total_price, menu:menus(provider_id)')
        .gte('date', start)
        .lte('date', end);

      const { data: reservations } = await reservationsQuery;

      let filteredReservations = reservations || [];

      if (selectedProviderId) {
        filteredReservations = filteredReservations.filter(r => r.menu?.provider_id === selectedProviderId);
      }

      const orders = filteredReservations.length;
      const revenue = filteredReservations.reduce((sum, r) => sum + Number(r.total_price), 0);

      setTotalOrders(orders);
      setTotalRevenue(revenue);

      const chartLabels = generateLabels();
      const ordersData = new Array(chartLabels.length).fill(0);
      const revenueData = new Array(chartLabels.length).fill(0);

      filteredReservations.forEach(reservation => {
        const index = getDataIndex(reservation.date, chartLabels);
        if (index >= 0 && index < ordersData.length) {
          ordersData[index]++;
          revenueData[index] += Number(reservation.total_price);
        }
      });

      setChartData({
        labels: chartLabels,
        orders: ordersData,
        revenue: revenueData,
      });
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateLabels = (): string[] => {
    if (periodType === 'day') {
      return ['Aujourd\'hui'];
    }

    if (periodType === 'week') {
      return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    }

    if (periodType === 'month') {
      return ['S1', 'S2', 'S3', 'S4', 'S5'];
    }

    if (periodType === 'year') {
      return ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    }

    return [];
  };

  const getDataIndex = (dateStr: string, labels: string[]): number => {
    if (periodType === 'day') {
      return 0;
    }

    if (periodType === 'week') {
      const { start } = getDateRange();
      const [startYear, startMonth, startDay] = start.split('-').map(Number);
      const [dateYear, dateMonth, dateDay] = dateStr.split('-').map(Number);

      const weekStartDate = new Date(startYear, startMonth - 1, startDay);
      const checkDate = new Date(dateYear, dateMonth - 1, dateDay);

      const day = checkDate.getDay();
      if (day === 0 || day === 6) return -1;

      const diffDays = Math.floor((checkDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0 || diffDays >= 5) return -1;

      return diffDays;
    }

    if (periodType === 'month') {
      const [, , day] = dateStr.split('-').map(Number);
      const weekOfMonth = Math.floor((day - 1) / 7);
      return Math.min(weekOfMonth, labels.length - 1);
    }

    if (periodType === 'year') {
      const [, month] = dateStr.split('-').map(Number);
      return month - 1;
    }

    return -1;
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);

    if (periodType === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (periodType === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (periodType === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (periodType === 'year') {
      newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1));
    }

    setCurrentDate(newDate);
  };

  const getPeriodLabel = (): string => {
    const date = currentDate;

    if (periodType === 'day') {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    if (periodType === 'week') {
      const { start, end } = getDateRange();
      const [startYear, startMonth, startDay] = start.split('-').map(Number);
      const [endYear, endMonth, endDay] = end.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      return `${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }

    if (periodType === 'month') {
      return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }

    if (periodType === 'year') {
      return date.getFullYear().toString();
    }

    return '';
  };

  const getProviderLabel = () => {
    if (!selectedProviderId) return 'Tous les prestataires';
    const provider = providers.find(p => p.id === selectedProviderId);
    return provider?.company_name || 'Tous les prestataires';
  };

  const handleSelectProvider = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    setIsProviderDropdownOpen(false);
  };

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.providerFilterContainer}>
          <TouchableOpacity
            style={styles.providerDropdown}
            onPress={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
          >
            <Text style={styles.providerDropdownText}>{getProviderLabel()}</Text>
            <ChevronDown size={20} color="#6B7280" />
          </TouchableOpacity>

          {isProviderDropdownOpen && (
            <View style={styles.providerDropdownMenu}>
              <TouchableOpacity
                style={[styles.providerDropdownMenuItem, !selectedProviderId && styles.providerDropdownMenuItemActive]}
                onPress={() => handleSelectProvider(null)}
              >
                <Text style={[styles.providerDropdownMenuItemText, !selectedProviderId && styles.providerDropdownMenuItemTextActive]}>
                  Tous les prestataires
                </Text>
              </TouchableOpacity>
              {providers.map(provider => (
                <TouchableOpacity
                  key={provider.id}
                  style={[styles.providerDropdownMenuItem, selectedProviderId === provider.id && styles.providerDropdownMenuItemActive]}
                  onPress={() => handleSelectProvider(provider.id)}
                >
                  <Text style={[styles.providerDropdownMenuItemText, selectedProviderId === provider.id && styles.providerDropdownMenuItemTextActive]}>
                    {provider.company_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.periodSelector}>
          <TouchableOpacity
            style={[styles.periodButton, periodType === 'day' && styles.periodButtonActive]}
            onPress={() => setPeriodType('day')}
          >
            <Text style={[styles.periodButtonText, periodType === 'day' && styles.periodButtonTextActive]}>
              Jour
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, periodType === 'week' && styles.periodButtonActive]}
            onPress={() => setPeriodType('week')}
          >
            <Text style={[styles.periodButtonText, periodType === 'week' && styles.periodButtonTextActive]}>
              Semaine
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, periodType === 'month' && styles.periodButtonActive]}
            onPress={() => setPeriodType('month')}
          >
            <Text style={[styles.periodButtonText, periodType === 'month' && styles.periodButtonTextActive]}>
              Mois
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, periodType === 'year' && styles.periodButtonActive]}
            onPress={() => setPeriodType('year')}
          >
            <Text style={[styles.periodButtonText, periodType === 'year' && styles.periodButtonTextActive]}>
              Année
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.periodNavigation}>
          <TouchableOpacity onPress={() => navigatePeriod('prev')} style={styles.navButton}>
            <ChevronLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{getPeriodLabel()}</Text>
          <TouchableOpacity onPress={() => navigatePeriod('next')} style={styles.navButton}>
            <ChevronRight size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
            <View style={styles.statIconContainer}>
              <ShoppingCart size={24} color="#1E40AF" />
            </View>
            <Text style={styles.statValue}>{totalOrders}</Text>
            <Text style={styles.statLabel}>Commandes</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
            <View style={styles.statIconContainer}>
              <DollarSign size={24} color="#065F46" />
            </View>
            <Text style={styles.statValue}>{totalRevenue.toFixed(2)} €</Text>
            <Text style={styles.statLabel}>Revenu total</Text>
          </View>
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.chartTitleBadge}>
            <Text style={styles.chartTitle}>Commandes</Text>
          </View>
          <LineChart data={chartData.orders} labels={chartData.labels} color="#3B82F6" showDecimals={false} />
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.chartTitleBadge}>
            <Text style={styles.chartTitle}>Volume généré</Text>
          </View>
          <LineChart data={chartData.revenue} labels={chartData.labels} color="#10B981" showDecimals={true} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LineChart({ data, labels, color, showDecimals }: { data: number[]; labels: string[]; color: string; showDecimals: boolean }) {
  const width = 340;
  const height = 200;
  const paddingLeft = 16;
  const paddingRight = 16;
  const paddingTop = 40;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(...data, 1);
  const minValue = 0;
  const range = maxValue - minValue || 1;

  const points = data.map((value, index) => {
    const x = paddingLeft + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = height - paddingBottom - ((value - minValue) / range) * chartHeight;
    return { x, y, value };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.chartWrapper}>
      <Svg width={width} height={height}>
        <Line
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
          stroke="#111827"
          strokeWidth="2"
        />
        <Line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={height - paddingBottom}
          stroke="#E5E7EB"
          strokeWidth="2"
        />

        {points.map((p, i) => (
          <Line
            key={`tick-${i}`}
            x1={p.x}
            y1={height - paddingBottom - 5}
            x2={p.x}
            y2={height - paddingBottom}
            stroke="#111827"
            strokeWidth="2"
          />
        ))}

        {points.map((p, i) => (
          <Line
            key={`bar-${i}`}
            x1={p.x}
            y1={height - paddingBottom}
            x2={p.x}
            y2={p.y}
            stroke={color}
            strokeWidth="3"
            strokeOpacity="0.3"
          />
        ))}

        <Polyline
          points={pathData.replace(/[ML]/g, '')}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r="5" fill={color} />
        ))}

        {labels.map((label, i) => (
          <SvgText
            key={i}
            x={points[i]?.x || paddingLeft + (chartWidth / Math.max(labels.length - 1, 1)) * i}
            y={height - paddingBottom + 20}
            fontSize="12"
            fill="#111827"
            fontWeight="600"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}

        {points.map((p, i) => (
          <SvgText
            key={i}
            x={p.x}
            y={p.y - 10}
            fontSize="12"
            fill="#111827"
            textAnchor="middle"
            fontWeight="600"
          >
            {showDecimals ? p.value.toFixed(2) : p.value.toFixed(0)}
          </SvgText>
        ))}
      </Svg>
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  providerFilterContainer: {
    marginBottom: 24,
    position: 'relative',
    zIndex: 1000,
  },
  providerDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  providerDropdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  providerDropdownMenu: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1001,
    maxHeight: 300,
  },
  providerDropdownMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  providerDropdownMenuItemActive: {
    backgroundColor: '#EEF2FF',
  },
  providerDropdownMenuItemText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  providerDropdownMenuItemTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#111827',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  periodNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  navButton: {
    padding: 4,
  },
  periodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitleBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chartWrapper: {
    alignItems: 'center',
  },
});
