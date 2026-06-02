import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase, Child, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { exportData } from '@/lib/exports';
import { showAlert } from '@/lib/alert';
import { Search, ArrowLeft, ChevronDown, ChevronUp, Download, SlidersHorizontal } from 'lucide-react-native';

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

const groupChildrenByGrade = (list: any[]): { title: string; data: any[] }[] => {
  const groups = new Map<string, any[]>();
  for (const child of list) {
    const key = child.grade && child.grade.trim() ? child.grade : NO_GRADE_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(child);
  }
  return Array.from(groups.keys())
    .sort(sortGrades)
    .map(title => ({ title, data: groups.get(title)! }));
};

type ActivityFilter = 'all' | '3d' | '7d' | '3m';

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString('fr-FR') : '');

function Pill({ label, active, onPress, color = '#4F46E5' }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function SchoolChildrenScreen() {
  const [school, setSchool] = useState<School | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [lastMeals, setLastMeals] = useState<Record<string, number>>({});
  const [todayRef, setTodayRef] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<'all' | 'fille' | 'garcon'>('all');
  const [allergyFilter, setAllergyFilter] = useState<'all' | 'with' | 'without'>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

      // Tous les élèves de l'école
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select(`*, parents:parent_id ( first_name, last_name )`)
        .eq('school_id', currentSchool.id)
        .order('last_name')
        .order('first_name');

      if (childrenError) throw childrenError;
      setChildren(childrenData || []);

      // Repas réservés des 3 derniers mois (jusqu'à aujourd'hui), pour le filtre d'activité.
      // On se base sur la date du repas (reservations.date), pas sur la date de commande.
      const toDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const threeMonthsAgo = new Date(startOfToday);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      // Pagination COMPLÈTE : Supabase/PostgREST plafonne à 1000 lignes par réponse.
      // Sans cela, lastMeals serait faux pour une école ayant > 1000 réservations
      // sur la fenêtre de 3 mois (filtre d'activité et "dernier repas" erronés).
      const map: Record<string, number> = {};
      const PAGE = 1000;
      for (let from = 0; from < 100000; from += PAGE) {
        const { data: page, error: resError } = await supabase
          .from('reservations')
          .select('child_id, date, child:children!inner(school_id)')
          .eq('child.school_id', currentSchool.id)
          .gte('date', toDateStr(threeMonthsAgo))
          .lte('date', toDateStr(startOfToday))
          .order('date', { ascending: false })
          .range(from, from + PAGE - 1);
        if (resError) {
          console.error('Error loading reservations:', resError);
          break;
        }
        const rows = (page || []) as any[];
        for (const r of rows) {
          if (!r.child_id || !r.date) continue;
          // Parse en minuit LOCAL (sinon 'YYYY-MM-DD' est interprété en UTC).
          const t = new Date(`${r.date}T00:00:00`).getTime();
          if (!map[r.child_id] || t > map[r.child_id]) map[r.child_id] = t;
        }
        if (rows.length < PAGE) break;
      }
      setLastMeals(map);
      setTodayRef(startOfToday.getTime());
    } catch (err) {
      console.error('Error loading children:', err);
    } finally {
      setLoading(false);
    }
  };

  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    children.forEach((child: any) => {
      if (child.grade && child.grade.trim()) set.add(child.grade);
    });
    return Array.from(set).sort(sortGrades);
  }, [children]);

  const visibleChildren = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let threshold: number | null = null;
    if (activityFilter !== 'all' && todayRef) {
      // Même référence temporelle (minuit local du jour de chargement) que la
      // fenêtre de données, pour éviter toute dérive si la session passe minuit.
      const d = new Date(todayRef);
      if (activityFilter === '3d') d.setDate(d.getDate() - 3);
      else if (activityFilter === '7d') d.setDate(d.getDate() - 7);
      else if (activityFilter === '3m') d.setMonth(d.getMonth() - 3);
      threshold = d.getTime();
    }

    return children.filter((c: any) => {
      if (gradeFilter !== 'all' && (c.grade || '') !== gradeFilter) return false;
      if (genreFilter !== 'all' && c.genre !== genreFilter) return false;
      const hasAllergy = Array.isArray(c.allergies) && c.allergies.length > 0;
      if (allergyFilter === 'with' && !hasAllergy) return false;
      if (allergyFilter === 'without' && hasAllergy) return false;
      if (threshold !== null) {
        const last = lastMeals[c.id];
        if (!last || last < threshold) return false;
      }
      if (q) {
        const match =
          c.first_name.toLowerCase().includes(q) ||
          c.last_name.toLowerCase().includes(q) ||
          (c.grade && c.grade.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [children, lastMeals, todayRef, searchQuery, gradeFilter, genreFilter, allergyFilter, activityFilter]);

  const sections = useMemo(() => groupChildrenByGrade(visibleChildren), [visibleChildren]);

  const activeCount = [
    gradeFilter !== 'all',
    genreFilter !== 'all',
    allergyFilter !== 'all',
    activityFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setGradeFilter('all');
    setGenreFilter('all');
    setAllergyFilter('all');
    setActivityFilter('all');
  };

  const handleExport = async () => {
    if (visibleChildren.length === 0) {
      showAlert('Export', 'Aucun élève à exporter avec ces filtres.');
      return;
    }
    setExporting(true);
    try {
      const genreText = (g: any) => (g === 'fille' ? 'Fille' : g === 'garcon' ? 'Garçon' : '');
      const header = ['Nom', 'Prénom', 'Classe', 'Sexe', 'Allergies', 'Parent', 'Dernier repas réservé'];
      const rows = visibleChildren.map((c: any) => [
        c.last_name || '',
        c.first_name || '',
        c.grade || '',
        genreText(c.genre),
        Array.isArray(c.allergies) && c.allergies.length > 0 ? c.allergies.join(', ') : '',
        c.parents ? `${c.parents.first_name || ''} ${c.parents.last_name || ''}`.trim() : '',
        fmtDate(lastMeals[c.id]),
      ]);
      const activityName =
        activityFilter === '3d' ? '3j' : activityFilter === '7d' ? '7j' : activityFilter === '3m' ? '3mois' : null;
      const parts = [
        gradeFilter !== 'all' ? gradeFilter : null,
        genreFilter === 'fille' ? 'filles' : genreFilter === 'garcon' ? 'garcons' : null,
        allergyFilter === 'with' ? 'avec-allergie' : allergyFilter === 'without' ? 'sans-allergie' : null,
        activityName ? `repas-${activityName}` : null,
      ].filter(Boolean);
      await exportData('xlsx', {
        fileName: `eleves-${school?.name || 'ecole'}${parts.length ? '-' + parts.join('-') : ''}`,
        sheetName: 'Élèves',
        header,
        rows,
      });
    } catch (e: any) {
      console.error('export error', e);
      showAlert('Erreur', e?.message || "Impossible d'exporter la liste");
    } finally {
      setExporting(false);
    }
  };

  const renderChild = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.childCard}
      activeOpacity={0.8}
      onPress={() => router.push(`/(school)/student-details?childId=${item.id}`)}
    >
      <View style={styles.childInfo}>
        <Text style={styles.childName}>
          {item.first_name} {item.last_name}
        </Text>
        {item.parents && (
          <Text style={styles.parentName}>
            Parent: {item.parents.first_name} {item.parents.last_name}
          </Text>
        )}
        <Text style={styles.childMeta}>
          {lastMeals[item.id] ? `Dernier repas réservé : ${fmtDate(lastMeals[item.id])}` : 'Aucun repas réservé (3 mois)'}
        </Text>
      </View>
      {Array.isArray(item.allergies) && item.allergies.length > 0 && (
        <View style={styles.allergyBadge}>
          <Text style={styles.allergyText}>Allergies</Text>
        </View>
      )}
    </TouchableOpacity>
  );

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
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(school)')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Liste des élèves</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un élève..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.filtersToggle, activeCount > 0 && styles.filtersToggleActive]}
          onPress={() => setFiltersOpen(o => !o)}
          activeOpacity={0.85}
        >
          <SlidersHorizontal size={18} color={activeCount > 0 ? '#4F46E5' : '#374151'} />
          <Text style={[styles.filtersToggleText, activeCount > 0 && { color: '#4F46E5' }]}>Filtres</Text>
          {activeCount > 0 && (
            <View style={styles.filtersBadge}>
              <Text style={styles.filtersBadgeText}>{activeCount}</Text>
            </View>
          )}
          {filtersOpen ? <ChevronUp size={16} color="#6B7280" /> : <ChevronDown size={16} color="#6B7280" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportButton, (exporting || visibleChildren.length === 0) && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting || visibleChildren.length === 0}
          activeOpacity={0.85}
        >
          {exporting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Download size={18} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>Exporter ({visibleChildren.length})</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {filtersOpen && (
        <ScrollView
          style={styles.filterPanel}
          contentContainerStyle={styles.filterPanelContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Classe</Text>
            <View style={styles.pillsWrap}>
              <Pill label="Toutes" active={gradeFilter === 'all'} onPress={() => setGradeFilter('all')} />
              {availableGrades.map(g => (
                <Pill key={g} label={g} active={gradeFilter === g} onPress={() => setGradeFilter(g)} />
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>A commandé</Text>
            <View style={styles.pillsWrap}>
              <Pill label="Tous" active={activityFilter === 'all'} onPress={() => setActivityFilter('all')} />
              <Pill label="3 jours" active={activityFilter === '3d'} onPress={() => setActivityFilter('3d')} color="#0EA5E9" />
              <Pill label="7 jours" active={activityFilter === '7d'} onPress={() => setActivityFilter('7d')} color="#0EA5E9" />
              <Pill label="3 mois" active={activityFilter === '3m'} onPress={() => setActivityFilter('3m')} color="#0EA5E9" />
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Sexe</Text>
            <View style={styles.pillsWrap}>
              <Pill label="Tous" active={genreFilter === 'all'} onPress={() => setGenreFilter('all')} />
              <Pill label="Filles" active={genreFilter === 'fille'} onPress={() => setGenreFilter('fille')} color="#EC4899" />
              <Pill label="Garçons" active={genreFilter === 'garcon'} onPress={() => setGenreFilter('garcon')} color="#3B82F6" />
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Allergie</Text>
            <View style={styles.pillsWrap}>
              <Pill label="Tous" active={allergyFilter === 'all'} onPress={() => setAllergyFilter('all')} />
              <Pill label="Avec" active={allergyFilter === 'with'} onPress={() => setAllergyFilter('with')} color="#F59E0B" />
              <Pill label="Sans" active={allergyFilter === 'without'} onPress={() => setAllergyFilter('without')} color="#10B981" />
            </View>
          </View>

          {activeCount > 0 && (
            <TouchableOpacity style={styles.resetLink} onPress={resetFilters}>
              <Text style={styles.resetLinkText}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <View style={styles.summaryLine}>
        <Text style={styles.summaryText}>
          {visibleChildren.length} élève{visibleChildren.length > 1 ? 's' : ''} affiché{visibleChildren.length > 1 ? 's' : ''} sur {children.length}
        </Text>
      </View>

      {visibleChildren.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {children.length === 0 ? 'Aucun élève dans cet établissement' : 'Aucun élève pour ces filtres'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderChild}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section: { title, data } }) => (
            <View style={styles.sectionHeaderWrapper}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderTitle}>{title}</Text>
                <Text style={styles.sectionHeaderCount}>{data.length}</Text>
              </View>
              <View style={styles.sectionHeaderUnderline} />
            </View>
          )}
          stickySectionHeadersEnabled={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#111827',
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  filtersToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filtersToggleActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  filtersToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  filtersBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filtersBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 340,
  },
  filterPanelContent: {
    padding: 16,
    gap: 14,
  },
  filterGroup: {
    gap: 8,
  },
  filterGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  resetLink: {
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  resetLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  summaryLine: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  list: {
    flex: 1,
  },
  sectionHeaderWrapper: {
    backgroundColor: '#F9FAFB',
    paddingTop: 12,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sectionHeaderCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
  },
  sectionHeaderUnderline: {
    height: 1.5,
    backgroundColor: '#4F46E5',
    marginBottom: 10,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  parentName: {
    fontSize: 14,
    color: '#4F46E5',
    marginBottom: 2,
  },
  childMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  allergyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  allergyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
