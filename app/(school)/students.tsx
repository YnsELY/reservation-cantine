import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, Child, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Search, ArrowLeft } from 'lucide-react-native';

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SchoolChildrenScreen() {
  const [school, setSchool] = useState<School | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [filteredChildren, setFilteredChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredChildren(children);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = children.filter(child =>
        child.first_name.toLowerCase().includes(query) ||
        child.last_name.toLowerCase().includes(query) ||
        (child.grade && child.grade.toLowerCase().includes(query))
      );
      setFilteredChildren(filtered);
    }
  }, [searchQuery, children]);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 6);

      const startDateString = formatDateToLocal(today);
      const endDateString = formatDateToLocal(endDate);

      const { data: activeReservations, error: activeError } = await supabase
        .from('reservations')
        .select('child_id, child:children!inner(school_id)')
        .eq('child.school_id', currentSchool.id)
        .gte('date', startDateString)
        .lte('date', endDateString);

      if (activeError) throw activeError;

      const activeChildIds = Array.from(
        new Set((activeReservations || []).map((res: any) => res.child_id).filter(Boolean))
      );

      if (activeChildIds.length === 0) {
        setChildren([]);
        setFilteredChildren([]);
        return;
      }

      const { data: childrenData } = await supabase
        .from('children')
        .select(`
          *,
          parents:parent_id (
            first_name,
            last_name
          )
        `)
        .eq('school_id', currentSchool.id)
        .in('id', activeChildIds)
        .order('last_name')
        .order('first_name');

      setChildren(childrenData || []);
      setFilteredChildren(childrenData || []);
    } catch (err) {
      console.error('Error loading children:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderChild = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.childCard}
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/(school)/student-details', params: { childId: item.id } })}
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
        {item.grade && (
          <Text style={styles.childGrade}>Classe: {item.grade}</Text>
        )}
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
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

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{children.length}</Text>
          <Text style={styles.statLabel}>Élèves actifs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {children.filter(c => Array.isArray(c.allergies) && c.allergies.length > 0).length}
          </Text>
          <Text style={styles.statLabel}>Avec allergies</Text>
        </View>
      </View>

      {filteredChildren.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery ? 'Aucun élève trouvé' : 'Aucun élève actif'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChildren}
          renderItem={renderChild}
          keyExtractor={(item) => item.id}
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
    paddingBottom: 16,
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
    marginTop: 16,
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
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  childGrade: {
    fontSize: 14,
    color: '#6B7280',
  },
  allergyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
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
