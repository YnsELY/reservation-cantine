import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { showAlert } from '@/lib/alert';
import {
  exportData, sanitizeFileName, sortGrades, NO_GRADE_LABEL, ExportFormat,
} from '@/lib/exports';
import { ExportRow } from '@/components/ExportRow';
import {
  ArrowLeft, ShoppingBag, Building2, GraduationCap, User,
  Truck, Calendar,
} from 'lucide-react-native';

interface Row {
  id: string;
  date: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: string | null;
  parent_name: string;
  menu_name: string;
  school_id: string;
  school_name: string;
  payment_status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  total_price: number;
}

const formatShortDate = (s: string) => {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const formatTime = (s: string) => {
  const d = new Date(s);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const statusLabel = (s: Row['payment_status']) =>
  s === 'paid' ? 'Payée' : s === 'pending' ? 'En attente' : 'Annulée';

const statusColor = (s: Row['payment_status']) =>
  s === 'paid' ? { bg: '#D1FAE5', fg: '#065F46' }
    : s === 'pending' ? { bg: '#FEF3C7', fg: '#92400E' }
    : { bg: '#FEE2E2', fg: '#991B1B' };

export default function OrdersProviderDetail() {
  const params = useLocalSearchParams<{ providerId: string }>();
  const providerId = Array.isArray(params.providerId) ? params.providerId[0] : params.providerId || '';

  const [providerName, setProviderName] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadData();
  }, [providerId]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: provider } = await supabase
        .from('providers').select('id, company_name').eq('id', providerId).maybeSingle();
      setProviderName(provider?.company_name || 'Prestataire');

      const { data: menus } = await supabase
        .from('menus').select('id').eq('provider_id', providerId);
      const menuIds = (menus || []).map((m: any) => m.id);
      if (menuIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: raw } = await supabase
        .from('reservations')
        .select(`
          id, date, total_price, payment_status, created_at, parent_id,
          child:children!child_id(first_name, last_name, grade, school:schools(id, name)),
          menu:menus(meal_name)
        `)
        .in('menu_id', menuIds)
        .order('date', { ascending: false })
        .limit(5000);

      const parentIds = Array.from(new Set((raw || []).map((r: any) => r.parent_id).filter(Boolean)));
      const parentsById = new Map<string, any>();
      if (parentIds.length > 0) {
        const { data: parentsData } = await supabase
          .from('parents').select('id, first_name, last_name').in('id', parentIds);
        (parentsData || []).forEach((p: any) => parentsById.set(p.id, p));
      }

      const formatted: Row[] = (raw || []).map((r: any) => {
        const p = parentsById.get(r.parent_id);
        return {
          id: r.id,
          date: r.date,
          child_first_name: r.child?.first_name || '',
          child_last_name: r.child?.last_name || '',
          child_grade: r.child?.grade || null,
          parent_name: p ? `${p.first_name} ${p.last_name}`.trim() : '',
          menu_name: r.menu?.meal_name || '',
          school_id: r.child?.school?.id || '',
          school_name: r.child?.school?.name || '',
          payment_status: r.payment_status,
          created_at: r.created_at,
          total_price: Number(r.total_price) || 0,
        };
      });
      setRows(formatted);
    } catch (err) {
      console.error('Error loading provider detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => ({
    total: rows.length,
    schools: new Set(rows.map(r => r.school_id)).size,
    classes: new Set(rows.map(r => r.child_grade || NO_GRADE_LABEL)).size,
    revenue: rows.reduce((s, r) => s + r.total_price, 0),
  }), [rows]);

  const bySchool = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    rows.forEach(r => {
      const e = map.get(r.school_id) || { name: r.school_name, count: 0 };
      e.count += 1;
      map.set(r.school_id, e);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows]);

  const byClass = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const key = r.child_grade || NO_GRADE_LABEL;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => sortGrades(a.name, b.name));
  }, [rows]);

  const handleExport = async (format: ExportFormat) => {
    if (rows.length === 0) {
      showAlert('Aucune donnée', 'Pas de commandes à exporter.');
      return;
    }
    try {
      setExporting(true);
      const sorted = [...rows].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const s = a.school_name.localeCompare(b.school_name, 'fr');
        if (s !== 0) return s;
        const g = sortGrades(a.child_grade || NO_GRADE_LABEL, b.child_grade || NO_GRADE_LABEL);
        if (g !== 0) return g;
        return `${a.child_last_name} ${a.child_first_name}`.localeCompare(`${b.child_last_name} ${b.child_first_name}`, 'fr');
      });

      const header = ['Date', 'Heure', 'École', 'Classe', 'Élève', 'Parent', 'Repas', 'Statut', 'Prix (DH)'];
      const dataRows = sorted.map(r => [
        r.date,
        formatTime(r.created_at),
        r.school_name,
        r.child_grade || '',
        `${r.child_first_name} ${r.child_last_name}`.trim(),
        r.parent_name,
        r.menu_name,
        statusLabel(r.payment_status),
        r.total_price.toFixed(2),
      ]);

      await exportData(format, {
        fileName: `prestataire-${sanitizeFileName(providerName)}`,
        sheetName: 'Commandes',
        header,
        rows: dataRows,
        title: `Commandes — ${providerName}`,
        meta: [
          { label: 'Repas à préparer', value: String(stats.total) },
          { label: 'Écoles', value: String(stats.schools) },
          { label: 'Classes', value: String(stats.classes) },
          { label: 'Revenu', value: `${stats.revenue.toFixed(2)} DH` },
        ],
      });
    } catch (err) {
      console.error('Export error:', err);
      showAlert('Erreur', 'Impossible de générer le fichier.');
    } finally {
      setExporting(false);
    }
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
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(admin)/orders')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerKicker}>Vue prestataire</Text>
          <Text style={styles.headerTitle}>{providerName}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <StatCard icon={ShoppingBag} value={stats.total} label="Repas à préparer" color="#10B981" />
          <StatCard icon={Building2} value={stats.schools} label="Écoles" color="#0EA5E9" />
          <StatCard icon={GraduationCap} value={stats.classes} label="Classes" color="#4F46E5" />
        </View>

        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Revenu total</Text>
          <Text style={styles.revenueValue}>{stats.revenue.toFixed(2)} DH</Text>
        </View>

        <ExportRow exporting={exporting} onExport={handleExport} />

        <Text style={styles.sectionTitle}>Répartition par école</Text>
        {bySchool.length === 0 ? (
          <Text style={styles.emptyText}>Aucune donnée.</Text>
        ) : (
          bySchool.map(s => (
            <View key={s.name} style={styles.distRow}>
              <Building2 size={16} color="#0EA5E9" />
              <Text style={styles.distName}>{s.name}</Text>
              <Text style={styles.distCount}>{s.count}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Répartition par classe</Text>
        {byClass.length === 0 ? (
          <Text style={styles.emptyText}>Aucune donnée.</Text>
        ) : (
          byClass.map(c => (
            <View key={c.name} style={styles.distRow}>
              <GraduationCap size={16} color="#4F46E5" />
              <Text style={styles.distName}>{c.name}</Text>
              <Text style={styles.distCount}>{c.count}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Liste des commandes</Text>
        {rows.length === 0 ? (
          <Text style={styles.emptyText}>Aucune commande pour ce prestataire.</Text>
        ) : (
          rows.map(r => {
            const sc = statusColor(r.payment_status);
            return (
              <View key={r.id} style={styles.orderCard}>
                <View style={styles.orderTopRow}>
                  <View style={styles.dateBadge}>
                    <Calendar size={12} color="#4F46E5" />
                    <Text style={styles.dateBadgeText}>{formatShortDate(r.date)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.fg }]}>{statusLabel(r.payment_status)}</Text>
                  </View>
                </View>
                <View style={styles.orderLine}>
                  <User size={14} color="#6B7280" />
                  <Text style={styles.orderText}>
                    {r.child_first_name} {r.child_last_name}
                    {r.child_grade ? ` — ${r.child_grade}` : ''}
                  </Text>
                </View>
                <View style={styles.orderLine}>
                  <Building2 size={14} color="#6B7280" />
                  <Text style={styles.orderText}>{r.school_name}</Text>
                </View>
                <View style={styles.orderLine}>
                  <ShoppingBag size={14} color="#6B7280" />
                  <Text style={styles.orderText}>{r.menu_name}</Text>
                </View>
                <View style={styles.orderLine}>
                  <Truck size={14} color="#6B7280" />
                  <Text style={styles.orderText}>Commandé à {formatTime(r.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon: Icon, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Icon size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  backButton: {
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  headerTextWrap: { flex: 1 },
  headerKicker: { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 22, fontWeight: '700', marginTop: 6 },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, textAlign: 'center' },
  revenueCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  revenueLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  revenueValue: { color: '#10B981', fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 8, marginBottom: 10 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginVertical: 16 },
  distRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 8,
  },
  distName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },
  distCount: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 28, textAlign: 'right' },
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 8,
  },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  dateBadgeText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderText: { fontSize: 13, color: '#374151', flex: 1 },
});
