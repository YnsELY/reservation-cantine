import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { MenuIcon, User, LogOut, Users as UsersIcon, ShoppingBag, BarChart3, Key } from 'lucide-react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, Text as SvgText, Polyline, Circle, Line } from 'react-native-svg';

const WhatsAppIcon = ({ size = 22, color = '#25D366' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      fill={color}
    />
  </Svg>
);

interface WeeklyRevenue {
  day: string;
  revenue: number;
}

export default function AdminDashboard() {
  const [providersCount, setProvidersCount] = useState(0);
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [parentsCount, setParentsCount] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [weeklyData, setWeeklyData] = useState<WeeklyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMenuCardOpen, setIsMenuCardOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const currentDay = today.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay;
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
      const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff + 6);

      const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const weekStartStr = formatDate(weekStart);
      const weekEndStr = formatDate(weekEnd);

      const [
        { count: providerCount },
        { count: schoolCount },
        { count: parentCount },
        { data: todayReservations },
        { data: weekReservations }
      ] = await Promise.all([
        supabase.from('providers').select('*', { count: 'exact', head: true }),
        supabase.from('schools').select('*', { count: 'exact', head: true }),
        supabase.from('parents').select('*', { count: 'exact', head: true }),
        supabase
          .from('reservations')
          .select('id, total_price, created_at')
          .eq('date', todayStr),
        supabase
          .from('reservations')
          .select('total_price, created_at')
          .gte('created_at', weekStartStr)
          .lte('created_at', weekEndStr)
      ]);

      setProvidersCount(providerCount || 0);
      setSchoolsCount(schoolCount || 0);
      setParentsCount(parentCount || 0);
      setTodayOrders(todayReservations?.length || 0);

      const todayTotal = (todayReservations || []).reduce(
        (sum, r) => sum + parseFloat(r.total_price),
        0
      );
      setTodayRevenue(todayTotal);

      const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      const revenueByDay: { [key: string]: number } = {};

      dayLabels.forEach(label => {
        revenueByDay[label] = 0;
      });

      (weekReservations || []).forEach((reservation) => {
        const date = new Date(reservation.created_at);
        const dayOfWeek = date.getDay();
        const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const label = dayLabels[dayIndex];
        revenueByDay[label] += parseFloat(reservation.total_price);
      });

      const weeklyArray: WeeklyRevenue[] = dayLabels.map(day => ({
        day,
        revenue: revenueByDay[day]
      }));

      setWeeklyData(weeklyArray);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMenuCard = () => {
    setIsMenuCardOpen(!isMenuCardOpen);
  };

  const handleWhatsAppContact = () => {
    const phoneNumber = '33612345678';
    const message = encodeURIComponent('Bonjour, j\'ai une question concernant l\'administration.');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(whatsappUrl).catch(() => {});
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
      <View style={styles.topHeader}>
        <View style={styles.menuButtonContainer}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleMenuCard}>
            <MenuIcon size={24} color="#111827" />
          </TouchableOpacity>

          {isMenuCardOpen && (
            <View style={styles.dropdownCard}>
              <TouchableOpacity
                style={[styles.dropdownItem, styles.dropdownItemFirst]}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/users');
                }}
              >
                <UsersIcon size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Voir les utilisateurs</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/orders');
                }}
              >
                <ShoppingBag size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Voir les commandes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/statistics');
                }}
              >
                <BarChart3 size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Statistiques</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/provider-access');
                }}
              >
                <Key size={22} color="#4F46E5" />
                <Text style={styles.dropdownItemText}>Codes Prestataire</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/school-access');
                }}
              >
                <Key size={22} color="#F59E0B" />
                <Text style={styles.dropdownItemText}>Codes École</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(admin)/profile');
                }}
              >
                <User size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Mon compte</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dropdownItem, styles.dropdownItemLogout, styles.dropdownItemLast]}
                onPress={async () => {
                  setIsMenuCardOpen(false);
                  await authService.signOut();
                  router.replace('/auth');
                }}
              >
                <LogOut size={22} color="#EF4444" />
                <Text style={[styles.dropdownItemText, styles.dropdownItemLogoutText]}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.accountButton} onPress={() => router.push('/(admin)/profile')}>
          <User size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Vue d'ensemble des comptes inscrits</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardThird, { backgroundColor: '#E0F2FE' }]}>
            <Text style={styles.statLabelSimple}>Prestataires</Text>
            <Text style={styles.statValue}>{providersCount}</Text>
          </View>

          <View style={[styles.statCard, styles.statCardThird, { backgroundColor: '#DCFCE7' }]}>
            <Text style={styles.statLabelSimple}>Écoles</Text>
            <Text style={styles.statValue}>{schoolsCount}</Text>
          </View>

          <View style={[styles.statCard, styles.statCardThird, { backgroundColor: '#FEF3C7' }]}>
            <Text style={styles.statLabelSimple}>Parents</Text>
            <Text style={styles.statValue}>{parentsCount}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Statistiques du jour</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardHalf, { backgroundColor: '#FCE7F3' }]}>
            <Text style={styles.statLabel}>Commandes aujourd'hui</Text>
            <Text style={styles.statValue}>{todayOrders}</Text>
          </View>

          <View style={[styles.statCard, styles.statCardHalf, { backgroundColor: '#D1FAE5' }]}>
            <Text style={styles.statLabel}>Revenus du jour</Text>
            <Text style={styles.statValue}>{todayRevenue.toFixed(2)} €</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleBadge}>
              <Text style={styles.chartTitleText}>Volume généré</Text>
            </View>
            <Text style={styles.weekLabel}>Semaine actuelle</Text>
          </View>
          <LineChartComponent
            data={weeklyData.map(d => d.revenue)}
            labels={weeklyData.map(d => d.day)}
            color="#10B981"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LineChartComponent({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
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
          <Circle key={i} cx={p.x} cy={p.y} r="5" fill="#000000" />
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
            fill="#000000"
            textAnchor="middle"
            fontWeight="600"
          >
            {p.value.toFixed(2)}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    zIndex: 100,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  accountButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuButtonContainer: {
    position: 'relative',
    zIndex: 101,
  },
  dropdownCard: {
    position: 'absolute',
    top: 48,
    left: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    minWidth: 220,
    zIndex: 102,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  dropdownItemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dropdownItemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  dropdownItemLogout: {
    backgroundColor: '#FEF2F2',
  },
  dropdownItemLogoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    borderRadius: 24,
    padding: 24,
    justifyContent: 'space-between',
  },
  statCardThird: {
    flex: 1,
  },
  statCardHalf: {
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.7,
  },
  statLabelSimple: {
    fontSize: 9,
    color: '#111827',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    marginTop: 8,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartTitleBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chartTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  weekLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  chartWrapper: {
    alignItems: 'center',
  },
});
