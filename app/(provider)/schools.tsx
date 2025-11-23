import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Provider, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Building2, MapPin, Mail, Phone, Search } from 'lucide-react-native';

interface SchoolWithAccess extends School {
  granted_at?: string;
}

export default function ProviderSchools() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolWithAccess[]>([]);
  const [filteredSchools, setFilteredSchools] = useState<SchoolWithAccess[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredSchools(schools);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = schools.filter(school =>
        school.name.toLowerCase().includes(query) ||
        (school.address && school.address.toLowerCase().includes(query))
      );
      setFilteredSchools(filtered);
    }
  }, [searchQuery, schools]);

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      setProvider(currentProvider);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('*, schools(*)')
        .eq('provider_id', currentProvider.id)
        .order('granted_at', { ascending: false });

      const schoolsList = (schoolAccess || []).map(sa => ({
        ...(sa as any).schools,
        granted_at: (sa as any).granted_at,
      }));

      setSchools(schoolsList);
      setFilteredSchools(schoolsList);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Écoles partenaires</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{schools.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher une école..."
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {filteredSchools.length === 0 ? (
          <View style={styles.emptyState}>
            <Building2 size={48} color="#9CA3AF" />
            <Text style={styles.emptyStateTitle}>
              {searchQuery ? 'Aucune école trouvée' : 'Aucune école partenaire'}
            </Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? 'Essayez une autre recherche'
                : 'Vous n\'avez pas encore d\'école partenaire'
              }
            </Text>
          </View>
        ) : (
          <View style={styles.schoolsList}>
            {filteredSchools.map(school => (
              <View key={school.id} style={styles.schoolCard}>
                <View style={styles.schoolHeader}>
                  <View style={styles.schoolIcon}>
                    <Building2 size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.schoolInfo}>
                    <Text style={styles.schoolName}>{school.name}</Text>
                    {school.granted_at && (
                      <Text style={styles.grantedDate}>
                        Depuis le {new Date(school.granted_at).toLocaleDateString('fr-FR')}
                      </Text>
                    )}
                  </View>
                </View>

                {school.address && (
                  <View style={styles.schoolDetail}>
                    <MapPin size={16} color="#6B7280" />
                    <Text style={styles.schoolDetailText}>{school.address}</Text>
                  </View>
                )}

                {school.contact_email && (
                  <View style={styles.schoolDetail}>
                    <Mail size={16} color="#6B7280" />
                    <Text style={styles.schoolDetailText}>{school.contact_email}</Text>
                  </View>
                )}

                {school.contact_phone && (
                  <View style={styles.schoolDetail}>
                    <Phone size={16} color="#6B7280" />
                    <Text style={styles.schoolDetailText}>{school.contact_phone}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  badgeContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  schoolsList: {
    gap: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  schoolCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  schoolIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  schoolInfo: {
    flex: 1,
  },
  schoolName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  grantedDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  schoolDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  schoolDetailText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
  },
});
