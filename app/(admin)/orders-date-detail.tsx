import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { showAlert } from '@/lib/alert';
import {
  exportData, sanitizeFileName, sortGrades, NO_GRADE_LABEL, ExportFormat,
} from '@/lib/exports';
import { ExportRow } from '@/components/ExportRow';
import {
  ArrowLeft, ShoppingBag, Building2, Truck, ChevronRight,
} from 'lucide-react-native';

interface Row {
  id: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: string | null;
  parent_name: string;
  menu_name: string;
  school_id: string;
  school_name: string;
  provider_id: string | null;
  provider_name: string | null;
  payment_status: 'pending' | 'paid' | 'cancelled';
  total_price: number;
}

const formatLongDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  const f = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return f.charAt(0).toUpperCase() + f.slice(1);
};

export default function OrdersDateDetail() {
  const params = useLocalSearchParams<{ date: string }>();
  const date = Array.isArray(params.date) ? params.date[0] : params.date || '';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadData();
  }, [date]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: raw } = await supabase
        .from('reservations')
        .select(`
          id,
          total_price,
          payment_status,
          parent_id,
          child:children!child_id(first_name, last_name, grade, school:schools(id, name)),
          menu:menus(meal_name, provider:providers(id, company_name))
        `)
        .eq('date', date)
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
          child_first_name: r.child?.first_name || '',
          child_last_name: r.child?.last_name || '',
          child_grade: r.child?.grade || null,
          parent_name: p ? `${p.first_name} ${p.last_name}`.trim() : '',
          menu_name: r.menu?.meal_name || '',
          school_id: r.child?.school?.id || '',
          school_name: r.child?.school?.name || '',
          provider_id: r.menu?.provider?.id || null,
          provider_name: r.menu?.provider?.company_name || null,
          payment_status: r.payment_status,
          total_price: Number(r.total_price) || 0,
        };
      });

      setRows(formatted);
    } catch (err) {
      console.error('Error loading date detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const schools = new Set<string>();
    const providers = new Set<string>();
    rows.forEach(r => {
      if (r.school_id) schools.add(r.school_id);
      if (r.provider_id) providers.add(r.provider_id);
    });
    return {
      total: rows.length,
      schools: schools.size,
      providers: providers.size,
      revenue: rows.reduce((s, r) => s + r.total_price, 0),
    };
  }, [rows]);

  const groupedBySchool = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rows: Row[] }>();
    rows.forEach(r => {
      const entry = map.get(r.school_id) || { id: r.school_id, name: r.school_name, rows: [] };
      entry.rows.push(r);
      map.set(r.school_id, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [rows]);

  const handleExport = async (format: ExportFormat) => {
    if (rows.length === 0) {
      showAlert('Aucune donnée', 'Pas de commandes à exporter pour cette date.');
      return;
    }
    try {
      setExporting(true);
      const sorted = [...rows].sort((a, b) => {
        const s = a.school_name.localeCompare(b.school_name, 'fr');
        if (s !== 0) return s;
        const g = sortGrades(a.child_grade || NO_GRADE_LABEL, b.child_grade || NO_GRADE_LABEL);
        if (g !== 0) return g;
        return `${a.child_last_name} ${a.child_first_name}`.localeCompare(`${b.child_last_name} ${b.child_first_name}`, 'fr');
      });

      const header = ['École', 'Classe', 'Élève', 'Parent', 'Repas', 'Prestataire', 'Statut', 'Prix (DH)'];
      const dataRows = sorted.map(r => [
        r.school_name,
        r.child_grade || '',
        `${r.child_first_name} ${r.child_last_name}`.trim(),
        r.parent_name,
        r.menu_name,
        r.provider_name || '',
        r.payment_status === 'paid' ? 'Payée' : r.payment_status === 'pending' ? 'En attente' : 'Annulée',
        r.total_price.toFixed(2),
      ]);

      await exportData(format, {
        fileName: `commandes-${sanitizeFileName(formatLongDate(date))}`,
        sheetName: 'Commandes',
        header,
        rows: dataRows,
        title: `Commandes du ${formatLongDate(date)}`,
        meta: [
          { label: 'Commandes', value: String(stats.total) },
          { label: 'Écoles', value: String(stats.schools) },
          { label: 'Prestataires', value: String(stats.providers) },
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
          <Text style={styles.headerKicker}>Vue journalière</Text>
          <Text style={styles.headerTitle}>{formatLongDate(date)}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <StatCard icon={ShoppingBag} value={stats.total} label="Commandes" color="#4F46E5" />
          <StatCard icon={Building2} value={stats.schools} label="Écoles" color="#0EA5E9" />
          <StatCard icon={Truck} value={stats.providers} label="Prestataires" color="#10B981" />
        </View>

        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Revenu total</Text>
          <Text style={styles.revenueValue}>{stats.revenue.toFixed(2)} DH</Text>
        </View>

        <ExportRow exporting={exporting} onExport={handleExport} />

        <Text style={styles.sectionTitle}>Répartition par école</Text>
        {groupedBySchool.length === 0 ? (
          <Text style={styles.emptyText}>Aucune commande pour cette date.</Text>
        ) : (
          groupedBySchool.map(g => (
            <TouchableOpacity
              key={g.id}
              style={styles.schoolCard}
              onPress={() => router.push({ pathname: '/(admin)/orders-school-detail' as any, params: { schoolId: g.id, date } })}
            >
              <Building2 size={20} color="#0EA5E9" />
              <View style={styles.schoolCardText}>
                <Text style={styles.schoolCardName}>{g.name}</Text>
                <Text style={styles.schoolCardCount}>{g.rows.length} commande{g.rows.length > 1 ? 's' : ''}</Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ))
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
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  revenueCard: {
    backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  revenueLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  revenueValue: { color: '#10B981', fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4, marginBottom: 10 },
  schoolCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  schoolCardText: { flex: 1 },
  schoolCardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  schoolCardCount: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginVertical: 24 },
});
