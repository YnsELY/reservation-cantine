import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Search, ArrowLeft, Users as UsersIcon, Building2, Store, ChevronRight } from 'lucide-react-native';

type FilterType = 'all' | 'parent' | 'school' | 'provider';

interface UserData {
  id: string;
  email: string | null;
  first_name?: string;
  last_name?: string;
  name?: string;
  company_name?: string;
  type: 'parent' | 'school' | 'provider';
  created_at: string;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'parent', label: 'Parents' },
  { key: 'school', label: 'Écoles' },
  { key: 'provider', label: 'Prestataires' },
];

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, filterType, users]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const [
        { data: parents },
        { data: schools },
        { data: providers }
      ] = await Promise.all([
        supabase.from('parents').select('*').order('created_at', { ascending: false }),
        supabase.from('schools').select('*').order('created_at', { ascending: false }),
        supabase.from('providers').select('*').order('created_at', { ascending: false })
      ]);

      const allUsers: UserData[] = [
        ...(parents || []).map(p => ({
          id: p.id,
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
          type: 'parent' as const,
          created_at: p.created_at
        })),
        ...(schools || []).map(s => ({
          id: s.id,
          email: s.contact_email,
          name: s.name,
          type: 'school' as const,
          created_at: s.created_at
        })),
        ...(providers || []).map(pr => ({
          id: pr.id,
          email: pr.email,
          name: pr.name,
          company_name: pr.company_name,
          type: 'provider' as const,
          created_at: pr.created_at
        }))
      ];

      allUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setUsers(allUsers);
      setFilteredUsers(allUsers);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = users;

    if (filterType !== 'all') {
      filtered = filtered.filter(u => u.type === filterType);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => {
        const email = u.email?.toLowerCase() || '';
        const firstName = u.first_name?.toLowerCase() || '';
        const lastName = u.last_name?.toLowerCase() || '';
        const name = u.name?.toLowerCase() || '';
        const companyName = u.company_name?.toLowerCase() || '';

        return email.includes(query) ||
               firstName.includes(query) ||
               lastName.includes(query) ||
               name.includes(query) ||
               companyName.includes(query);
      });
    }

    setFilteredUsers(filtered);
  };

  const countFor = (key: FilterType) =>
    key === 'all' ? users.length : users.filter(u => u.type === key).length;

  const getUserIcon = (type: string) => {
    switch (type) {
      case 'parent':
        return <UsersIcon size={24} color="#4F46E5" />;
      case 'school':
        return <Building2 size={24} color="#10B981" />;
      case 'provider':
        return <Store size={24} color="#F59E0B" />;
      default:
        return <UsersIcon size={24} color="#6B7280" />;
    }
  };

  const getUserBadgeColor = (type: string) => {
    switch (type) {
      case 'parent':
        return { bg: '#EEF2FF', text: '#4F46E5' };
      case 'school':
        return { bg: '#D1FAE5', text: '#10B981' };
      case 'provider':
        return { bg: '#FEF3C7', text: '#F59E0B' };
      default:
        return { bg: '#F3F4F6', text: '#6B7280' };
    }
  };

  const getUserTypeLabel = (type: string) => {
    switch (type) {
      case 'parent':
        return 'Parent';
      case 'school':
        return 'École';
      case 'provider':
        return 'Prestataire';
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const openAccount = (user: UserData) => {
    router.push({
      pathname: '/(admin)/account-detail',
      params: { type: user.type, id: user.id },
    });
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
      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeBack('/(admin)')}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Liste des utilisateurs</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un utilisateur..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.pillsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContent}
        >
          {FILTERS.map((f) => {
            const active = filterType === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setFilterType(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{f.label}</Text>
                <View style={[styles.pillCount, active && styles.pillCountActive]}>
                  <Text style={[styles.pillCountText, active && styles.pillCountTextActive]}>
                    {countFor(f.key)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur'}
            </Text>
          </View>
        ) : (
          filteredUsers.map((user) => {
            const colors = getUserBadgeColor(user.type);
            return (
              <TouchableOpacity
                key={user.id}
                style={styles.userCard}
                activeOpacity={0.7}
                onPress={() => openAccount(user)}
              >
                <View style={[styles.userIconContainer, { backgroundColor: colors.bg }]}>
                  {getUserIcon(user.type)}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>
                    {user.first_name && user.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : user.name || user.company_name || 'Sans nom'}
                  </Text>
                  {user.email && (
                    <Text style={styles.userEmail}>{user.email}</Text>
                  )}
                  <View style={[styles.typeBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.typeBadgeText, { color: colors.text }]}>
                      {getUserTypeLabel(user.type)}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            );
          })
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
  pillsContainer: {
    marginBottom: 12,
  },
  pillsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillCount: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pillCountActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  pillCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  pillCountTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  userIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
