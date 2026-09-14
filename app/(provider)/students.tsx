import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  GraduationCap,
  Search,
  UserRound,
  Users,
} from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';

const ALL = 'all';
const NO_GRADE = 'Sans classe';

interface AccessibleSchool {
  id: string;
  name: string;
}

interface ProviderStudent {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
}

function FilterPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, selected && styles.filterPillSelected]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.filterPillText, selected && styles.filterPillTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ProviderStudentsScreen() {
  const router = useRouter();
  const { schoolId: requestedSchoolId } = useLocalSearchParams<{ schoolId?: string }>();
  const [schools, setSchools] = useState<AccessibleSchool[]>([]);
  const [students, setStudents] = useState<ProviderStudent[]>([]);
  const [schoolFilter, setSchoolFilter] = useState(ALL);
  const [gradeFilter, setGradeFilter] = useState(ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      const { data: accessRows, error: accessError } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(id, name)')
        .eq('provider_id', currentProvider.id);

      if (accessError) throw accessError;

      const accessibleSchools = (accessRows || [])
        .map((row: any) => ({
          id: row.school_id,
          name: row.schools?.name || 'École sans nom',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr-FR'));
      const schoolIds = accessibleSchools.map(school => school.id);

      setSchools(accessibleSchools);
      if (requestedSchoolId && schoolIds.includes(requestedSchoolId)) {
        setSchoolFilter(requestedSchoolId);
      }

      if (schoolIds.length === 0) {
        setStudents([]);
        setError('');
        return;
      }

      const { data: childrenData, error: childrenError } = await supabase
        .rpc('get_provider_school_students');

      if (childrenError) throw childrenError;

      setStudents((childrenData || []) as ProviderStudent[]);
      setError('');
    } catch (err) {
      console.error('Error loading provider students:', err);
      setError("Impossible de charger la liste des élèves.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const schoolNames = useMemo(
    () => new Map(schools.map(school => [school.id, school.name])),
    [schools]
  );

  const availableGrades = useMemo(() => {
    const values = new Set<string>();
    students.forEach(student => {
      if (schoolFilter !== ALL && student.school_id !== schoolFilter) return;
      values.add(student.grade?.trim() || NO_GRADE);
    });
    return Array.from(values).sort((a, b) => {
      if (a === NO_GRADE) return 1;
      if (b === NO_GRADE) return -1;
      return a.localeCompare(b, 'fr-FR', { numeric: true });
    });
  }, [schoolFilter, students]);

  const visibleStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('fr-FR');

    return students.filter(student => {
      const grade = student.grade?.trim() || NO_GRADE;
      const parentName = `${student.parent_first_name || ''} ${student.parent_last_name || ''}`.trim();
      const schoolName = schoolNames.get(student.school_id) || '';

      if (schoolFilter !== ALL && student.school_id !== schoolFilter) return false;
      if (gradeFilter !== ALL && grade !== gradeFilter) return false;
      if (!query) return true;

      return [student.first_name, student.last_name, grade, parentName, schoolName]
        .some(value => value.toLocaleLowerCase('fr-FR').includes(query));
    });
  }, [gradeFilter, schoolFilter, schoolNames, searchQuery, students]);

  const selectSchool = (schoolId: string) => {
    setSchoolFilter(schoolId);
    setGradeFilter(ALL);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0E5FC0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeBack('/(provider)')}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeft size={23} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>RÉSEAU PARTENAIRE</Text>
          <Text style={styles.title}>Liste des élèves</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Users size={28} color="#FFFFFF" />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryValue}>{students.length}</Text>
            <Text style={styles.summaryLabel}>
              élève{students.length !== 1 ? 's' : ''} dans {schools.length} école{schools.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Search size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Élève, parent, école ou classe..."
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {schools.length > 1 && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>ÉCOLE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <FilterPill label="Toutes" selected={schoolFilter === ALL} onPress={() => selectSchool(ALL)} />
              {schools.map(school => (
                <FilterPill
                  key={school.id}
                  label={school.name}
                  selected={schoolFilter === school.id}
                  onPress={() => selectSchool(school.id)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {availableGrades.length > 0 && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>CLASSE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <FilterPill label="Toutes" selected={gradeFilter === ALL} onPress={() => setGradeFilter(ALL)} />
              {availableGrades.map(grade => (
                <FilterPill
                  key={grade}
                  label={grade}
                  selected={gradeFilter === grade}
                  onPress={() => setGradeFilter(grade)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Élèves accessibles</Text>
          <Text style={styles.resultsCount}>{visibleStudents.length}</Text>
        </View>

        {error ? (
          <View style={styles.messageCard}>
            <AlertCircle size={24} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : visibleStudents.length === 0 ? (
          <View style={styles.emptyCard}>
            <GraduationCap size={44} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Aucun élève trouvé</Text>
            <Text style={styles.emptyText}>
              {students.length === 0
                ? "Aucun élève n’est encore rattaché à vos écoles partenaires."
                : 'Essayez de modifier la recherche ou les filtres.'}
            </Text>
          </View>
        ) : (
          <View style={styles.studentsList}>
            {visibleStudents.map(student => {
              const parentName = `${student.parent_first_name || ''} ${student.parent_last_name || ''}`.trim();
              const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();
              const grade = student.grade?.trim() || NO_GRADE;

              return (
                <View key={student.id} style={styles.studentCard}>
                  <View style={styles.studentTopRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials || 'ÉL'}</Text>
                    </View>
                    <View style={styles.studentIdentity}>
                      <Text style={styles.studentName}>
                        {student.first_name} {student.last_name}
                      </Text>
                      <View style={styles.metaRow}>
                        <View style={styles.metaPill}>
                          <Building2 size={13} color="#0369A1" />
                          <Text style={styles.metaText} numberOfLines={1}>
                            {schoolNames.get(student.school_id) || 'École'}
                          </Text>
                        </View>
                        <View style={[styles.metaPill, styles.gradePill]}>
                          <GraduationCap size={13} color="#6D28D9" />
                          <Text style={[styles.metaText, styles.gradeText]}>{grade}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.parentRow}>
                    <View style={styles.parentIcon}>
                      <UserRound size={17} color="#065F46" />
                    </View>
                    <View style={styles.parentCopy}>
                      <Text style={styles.parentLabel}>PARENT AFFILIÉ</Text>
                      <Text style={styles.parentName}>
                        Parent : {parentName || 'Non renseigné'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#0E5FC0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E5FC0',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0E5FC0',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 14,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  summaryLabel: {
    color: '#DCEEFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 15,
    minHeight: 52,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    paddingVertical: 13,
  },
  filterGroup: {
    marginBottom: 14,
  },
  filterLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  filterRow: {
    gap: 8,
    paddingRight: 20,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterPillSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  filterPillTextSelected: {
    color: '#FFFFFF',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  resultsTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  resultsCount: {
    minWidth: 30,
    textAlign: 'center',
    color: '#0E5FC0',
    fontSize: 14,
    fontWeight: '900',
    backgroundColor: '#E0F2FE',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  studentsList: {
    gap: 12,
  },
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    marginRight: 13,
  },
  avatarText: {
    color: '#075985',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  studentIdentity: {
    flex: 1,
  },
  studentName: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 7,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    maxWidth: '70%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E0F2FE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: {
    flexShrink: 1,
    color: '#0369A1',
    fontSize: 11,
    fontWeight: '700',
  },
  gradePill: {
    backgroundColor: '#EDE9FE',
  },
  gradeText: {
    color: '#6D28D9',
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 13,
    padding: 11,
    marginTop: 14,
  },
  parentIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  parentCopy: {
    flex: 1,
  },
  parentLabel: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  parentName: {
    color: '#064E3B',
    fontSize: 14,
    fontWeight: '800',
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  errorText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
});
