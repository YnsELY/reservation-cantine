import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { showAlert } from '@/lib/alert';
import { exportData, ExportFormat } from '@/lib/exports';
import { ExportSheet } from '@/components/ExportSheet';
import { ArrowLeft, Search, X, FileDown, Check, UtensilsCrossed, FileText, ChevronDown, ChevronUp } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_id: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: string | null;
  child_allergies: string[];
  child_genre: 'fille' | 'garcon' | null;
  parent_name: string;
  menu_id: string;
  menu_name: string;
  annotations: string | null;
}

interface MenuOption {
  id: string;
  name: string;
}

const GRADE_ORDER: string[] = [
  'Petite Section', 'Moyenne Section', 'Grande Section',
  'CP', 'CE1', 'CE2', 'CM1', 'CM2',
  '6ème', '5ème', '4ème', '3ème',
  '2nde', '1ère', 'Terminale',
];

const NO_GRADE_LABEL = 'Sans classe';

const sortGrades = (a: string, b: string) => {
  if (a === NO_GRADE_LABEL) return 1;
  if (b === NO_GRADE_LABEL) return -1;
  const ia = GRADE_ORDER.indexOf(a);
  const ib = GRADE_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

const formatLongDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  const formatted = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const sanitizeFileName = (value: string) => (
  value.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'
);

const genreLabel = (g: 'fille' | 'garcon' | null) =>
  g === 'fille' ? 'Fille' : g === 'garcon' ? 'Garçon' : '—';

export default function AllOrders() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const date = (Array.isArray(params.date) ? params.date[0] : params.date) || '';

  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [menus, setMenus] = useState<MenuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [exportClass, setExportClass] = useState<string>('all');
  const [exportMenuId, setExportMenuId] = useState<string>('all');
  const [exportGenre, setExportGenre] = useState<'all' | 'fille' | 'garcon'>('all');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadData();
  }, [date]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }
      await loadOrders(currentSchool, date);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOrders = async (school: School, dateStr: string) => {
    if (!dateStr) {
      setOrders([]);
      setMenus([]);
      return;
    }

    const { data: reservationsRaw, error: resError } = await supabase
      .from('reservations')
      .select(`
        id, parent_id, annotations,
        child:children!child_id(id, first_name, last_name, grade, allergies, school_id, genre),
        menu:menus!menu_id(id, meal_name)
      `)
      .eq('date', dateStr)
      .neq('payment_status', 'cancelled');

    if (resError) throw resError;

    const filtered = (reservationsRaw || []).filter(
      (r: any) => r.child?.school_id === school.id
    );

    const parentIds = Array.from(new Set(filtered.map((r: any) => r.parent_id).filter(Boolean)));
    let parentsById = new Map<string, any>();
    if (parentIds.length > 0) {
      const { data: parentsData } = await supabase
        .from('parents')
        .select('id, first_name, last_name')
        .in('id', parentIds);
      parentsById = new Map((parentsData || []).map((p: any) => [p.id, p]));
    }

    const ordersList: OrderDetail[] = filtered.map((r: any) => {
      const parent = parentsById.get(r.parent_id);
      return {
        id: r.id,
        child_id: r.child?.id || '',
        child_first_name: r.child?.first_name || '',
        child_last_name: r.child?.last_name || '',
        child_grade: r.child?.grade || null,
        child_allergies: Array.isArray(r.child?.allergies) ? r.child.allergies : [],
        child_genre: r.child?.genre || null,
        parent_name: parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() : 'Parent',
        menu_id: r.menu?.id || '',
        menu_name: r.menu?.meal_name || '',
        annotations: (r.annotations || '').trim() || null,
      };
    });

    setOrders(ordersList);

    const menusMap = new Map<string, MenuOption>();
    ordersList.forEach(o => {
      if (o.menu_id && !menusMap.has(o.menu_id)) {
        menusMap.set(o.menu_id, { id: o.menu_id, name: o.menu_name });
      }
    });
    setMenus(Array.from(menusMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr-FR')));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (selectedMenuId !== 'all' && o.menu_id !== selectedMenuId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = `${o.child_first_name} ${o.child_last_name}`.toLowerCase();
        if (!name.includes(q) && !o.parent_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [orders, selectedMenuId, searchQuery]);

  const countsByMenu = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      map.set(o.menu_id, (map.get(o.menu_id) || 0) + 1);
    });
    return map;
  }, [orders]);

  const sectionsByClass = useMemo(() => {
    const groups = new Map<string, OrderDetail[]>();
    filteredOrders.forEach(o => {
      const grade = o.child_grade || NO_GRADE_LABEL;
      if (!groups.has(grade)) groups.set(grade, []);
      groups.get(grade)!.push(o);
    });
    return Array.from(groups.entries())
      .sort((a, b) => sortGrades(a[0], b[0]))
      .map(([title, data]) => ({
        title,
        data: data.sort((x, y) =>
          `${x.child_last_name} ${x.child_first_name}`.localeCompare(
            `${y.child_last_name} ${y.child_first_name}`, 'fr-FR'
          )
        ),
      }));
  }, [filteredOrders]);

  const totalClassesCount = useMemo(() => (
    new Set(orders.map(o => o.child_grade || NO_GRADE_LABEL)).size
  ), [orders]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => set.add(o.child_grade || NO_GRADE_LABEL));
    return Array.from(set).sort(sortGrades);
  }, [orders]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const toExport = orders
        .filter(o => {
          if (exportMenuId !== 'all' && o.menu_id !== exportMenuId) return false;
          if (exportClass !== 'all' && (o.child_grade || NO_GRADE_LABEL) !== exportClass) return false;
          if (exportGenre !== 'all' && o.child_genre !== exportGenre) return false;
          return true;
        })
        .sort((a, b) => {
          const g = sortGrades(a.child_grade || NO_GRADE_LABEL, b.child_grade || NO_GRADE_LABEL);
          if (g !== 0) return g;
          return `${a.child_last_name} ${a.child_first_name}`.localeCompare(
            `${b.child_last_name} ${b.child_first_name}`, 'fr-FR'
          );
        });

      if (toExport.length === 0) {
        showAlert('Export impossible', 'Aucune commande à exporter avec ces filtres.');
        return;
      }

      const header = ['Classe', 'Élève', 'Sexe', 'Parent', 'Menu', 'Allergies', 'Instructions'];
      const rows = toExport.map(o => [
        o.child_grade || '',
        `${o.child_first_name} ${o.child_last_name}`.trim(),
        genreLabel(o.child_genre),
        o.parent_name,
        o.menu_name,
        o.child_allergies.join(', ') || 'Aucune',
        o.annotations || '',
      ] as (string | number)[]);

      const menuLabel = exportMenuId === 'all'
        ? 'Tous les menus'
        : (menus.find(m => m.id === exportMenuId)?.name || '—');
      const classeLabel = exportClass === 'all' ? 'Toutes' : exportClass;
      const sexeLabel = exportGenre === 'all' ? 'Tous' : exportGenre === 'fille' ? 'Filles' : 'Garçons';

      const scopeLabel = [
        exportMenuId !== 'all' && sanitizeFileName(menus.find(m => m.id === exportMenuId)?.name || 'menu'),
        exportClass !== 'all' && sanitizeFileName(exportClass),
        exportGenre !== 'all' && exportGenre,
      ].filter(Boolean).join('-') || 'toutes';

      await exportData(exportFormat, {
        fileName: `commandes-${sanitizeFileName(date)}-${scopeLabel}`,
        sheetName: 'Commandes',
        title: 'Récapitulatif des commandes',
        subtitle: formatLongDate(date),
        meta: [
          { label: 'Menu', value: menuLabel },
          { label: 'Classe', value: classeLabel },
          { label: 'Sexe', value: sexeLabel },
        ],
        totals: [{ label: 'Commandes', value: rows.length }],
        header,
        rows,
      });

      setShowExportModal(false);
    } catch (err) {
      console.error('Error exporting:', err);
      showAlert('Erreur', 'Impossible de générer le fichier.');
    } finally {
      setExporting(false);
    }
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
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(school)/calendar')}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>Récapitulatif des commandes</Text>
          <Text style={styles.headerSubtitle}>{formatLongDate(date)}</Text>
        </View>
        <TouchableOpacity style={styles.exportButton} onPress={() => setShowExportModal(true)}>
          <FileDown size={14} color="#111827" />
          <Text style={styles.exportButtonText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{orders.length}</Text>
          <Text style={styles.statLabel}>commande{orders.length > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{menus.length}</Text>
          <Text style={styles.statLabel}>menu{menus.length > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalClassesCount}</Text>
          <Text style={styles.statLabel}>classe{totalClassesCount > 1 ? 's' : ''}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        style={styles.tabsContainer}
      >
        <TouchableOpacity
          style={[styles.tabPill, selectedMenuId === 'all' && styles.tabPillActive]}
          onPress={() => setSelectedMenuId('all')}
        >
          <Text style={[styles.tabPillText, selectedMenuId === 'all' && styles.tabPillTextActive]}>
            Tous ({orders.length})
          </Text>
        </TouchableOpacity>
        {menus.map(menu => (
          <TouchableOpacity
            key={menu.id}
            style={[styles.tabPill, selectedMenuId === menu.id && styles.tabPillActive]}
            onPress={() => setSelectedMenuId(menu.id)}
          >
            <View style={styles.tabPillDot} />
            <Text style={[styles.tabPillText, selectedMenuId === menu.id && styles.tabPillTextActive]}>
              {menu.name} ({countsByMenu.get(menu.id) || 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchContainer}>
        <Search size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un élève ou parent..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(); }} />
        }
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <UtensilsCrossed size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {orders.length === 0 ? 'Aucune commande pour ce jour' : 'Aucune commande ne correspond aux filtres'}
            </Text>
          </View>
        ) : (
          sectionsByClass.map(section => (
            <View key={section.title} style={styles.classSection}>
              <View style={styles.classHeader}>
                <Text style={styles.classHeaderTitle}>{section.title}</Text>
                <Text style={styles.classHeaderCount}>{section.data.length}</Text>
              </View>
              <View style={styles.classUnderline} />
              {section.data.map(order => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push(`/(school)/student-details?childId=${order.child_id}&reservationId=${order.id}`)
                  }
                >
                  <View style={styles.orderCardLeft}>
                    <Text style={styles.orderCardName} numberOfLines={1}>
                      {order.child_first_name} {order.child_last_name}
                    </Text>
                    <Text style={styles.orderCardParent} numberOfLines={1}>
                      Parent: {order.parent_name}
                    </Text>
                    <Text style={styles.orderCardMenu} numberOfLines={1}>{order.menu_name}</Text>
                    {order.annotations ? (
                      <View style={styles.noteWrap}>
                        <TouchableOpacity
                          style={styles.notePill}
                          activeOpacity={0.7}
                          onPress={() => setExpandedNotes(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                        >
                          <FileText size={13} color="#92400E" />
                          <Text style={styles.notePillText}>Instruction</Text>
                          {expandedNotes[order.id]
                            ? <ChevronUp size={14} color="#92400E" />
                            : <ChevronDown size={14} color="#92400E" />}
                        </TouchableOpacity>
                        {expandedNotes[order.id] && (
                          <Text style={styles.noteText}>{order.annotations}</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                  {order.child_allergies.length > 0 && (
                    <View style={styles.orderCardAllergyBadge}>
                      <Text style={styles.orderCardAllergyText}>Allergies</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <ExportSheet
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        format={exportFormat}
        onFormatChange={setExportFormat}
        onExport={handleExport}
        exporting={exporting}
        title="Exporter les commandes"
      >
        <Text style={styles.modalSectionTitle}>MENU</Text>
        <ScrollView style={styles.modalScrollSection} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <TouchableOpacity style={styles.modalOption} onPress={() => setExportMenuId('all')}>
            <Text style={[styles.modalOptionText, exportMenuId === 'all' && styles.modalOptionTextActive]}>
              Tous les menus
            </Text>
            {exportMenuId === 'all' && <Check size={18} color="#4F46E5" />}
          </TouchableOpacity>
          {menus.map(m => (
            <TouchableOpacity key={m.id} style={styles.modalOption} onPress={() => setExportMenuId(m.id)}>
              <Text style={[styles.modalOptionText, exportMenuId === m.id && styles.modalOptionTextActive]}>
                {m.name}
              </Text>
              {exportMenuId === m.id && <Check size={18} color="#4F46E5" />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.modalSectionTitle}>CLASSE</Text>
        <ScrollView style={styles.modalScrollSection} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <TouchableOpacity style={styles.modalOption} onPress={() => setExportClass('all')}>
            <Text style={[styles.modalOptionText, exportClass === 'all' && styles.modalOptionTextActive]}>
              Toutes les classes
            </Text>
            {exportClass === 'all' && <Check size={18} color="#4F46E5" />}
          </TouchableOpacity>
          {availableClasses.map(c => (
            <TouchableOpacity key={c} style={styles.modalOption} onPress={() => setExportClass(c)}>
              <Text style={[styles.modalOptionText, exportClass === c && styles.modalOptionTextActive]}>
                {c}
              </Text>
              {exportClass === c && <Check size={18} color="#4F46E5" />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.modalSectionTitle}>SEXE</Text>
        <View style={[styles.modalRow, { marginBottom: 4 }]}>
          {([['all', 'Tous'], ['fille', 'Filles'], ['garcon', 'Garçons']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.modalChip, exportGenre === key && styles.modalChipActive]}
              onPress={() => setExportGenre(key)}
            >
              <Text style={[styles.modalChipText, exportGenre === key && styles.modalChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ExportSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  exportButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
  },
  exportButtonText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  statsStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: '#0F172A', marginHorizontal: 16, marginTop: 4,
    paddingVertical: 16, borderRadius: 14,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },
  tabsContainer: { marginTop: 14, marginBottom: 6, maxHeight: 44 },
  tabsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  tabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: '#F3F4F6', borderRadius: 999,
  },
  tabPillActive: { backgroundColor: '#0F172A' },
  tabPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  tabPillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabPillTextActive: { color: '#FFFFFF' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, backgroundColor: '#F3F4F6',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 12, textAlign: 'center' },
  classSection: { marginBottom: 16 },
  classHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, paddingBottom: 6,
  },
  classHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  classHeaderCount: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },
  classUnderline: { height: 1.5, backgroundColor: '#4F46E5', marginBottom: 10 },
  orderCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  orderCardLeft: { flex: 1 },
  orderCardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  orderCardParent: { fontSize: 13, color: '#4F46E5', marginTop: 2 },
  orderCardMenu: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  orderCardAllergyBadge: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    marginLeft: 12,
  },
  orderCardAllergyText: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  noteWrap: { marginTop: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  notePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  notePillText: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  noteText: {
    marginTop: 6, fontSize: 13, color: '#111827',
    backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center', paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6,
    marginTop: 14, marginBottom: 8,
  },
  modalRow: { flexDirection: 'row', gap: 8 },
  modalChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  modalChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  modalChipText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  modalChipTextActive: { color: '#FFFFFF' },
  modalScrollSection: { maxHeight: 140 },
  modalOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4, paddingVertical: 10,
  },
  modalOptionText: { fontSize: 14, color: '#111827' },
  modalOptionTextActive: { color: '#4F46E5', fontWeight: '700' },
  modalSubmitButton: {
    backgroundColor: '#0F172A', paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', marginTop: 16,
  },
  modalSubmitButtonDisabled: { opacity: 0.6 },
  modalSubmitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
