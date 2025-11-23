import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { Search, ArrowLeft, Users as UsersIcon, Building2, Store, ChevronDown } from 'lucide-react-native';

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

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'parent' | 'school' | 'provider'>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

  const getFilterLabel = () => {
    switch (filterType) {
      case 'all':
        return `Tous les utilisateurs (${users.length})`;
      case 'parent':
        return `Parents (${users.filter(u => u.type === 'parent').length})`;
      case 'school':
        return `Écoles (${users.filter(u => u.type === 'school').length})`;
      case 'provider':
        return `Prestataires (${users.filter(u => u.type === 'provider').length})`;
    }
  };

  const handleSelectFilter = (type: 'all' | 'parent' | 'school' | 'provider') => {
    setFilterType(type);
    setIsDropdownOpen(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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
          onPress={() => router.back()}
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

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <Text style={styles.dropdownText}>{getFilterLabel()}</Text>
          <ChevronDown size={20} color="#6B7280" />
        </TouchableOpacity>

        {isDropdownOpen && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={[styles.dropdownMenuItem, filterType === 'all' && styles.dropdownMenuItemActive]}
              onPress={() => handleSelectFilter('all')}
            >
              <Text style={[styles.dropdownMenuItemText, filterType === 'all' && styles.dropdownMenuItemTextActive]}>
                Tous les utilisateurs ({users.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownMenuItem, filterType === 'parent' && styles.dropdownMenuItemActive]}
              onPress={() => handleSelectFilter('parent')}
            >
              <Text style={[styles.dropdownMenuItemText, filterType === 'parent' && styles.dropdownMenuItemTextActive]}>
                Parents ({users.filter(u => u.type === 'parent').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownMenuItem, filterType === 'school' && styles.dropdownMenuItemActive]}
              onPress={() => handleSelectFilter('school')}
            >
              <Text style={[styles.dropdownMenuItemText, filterType === 'school' && styles.dropdownMenuItemTextActive]}>
                Écoles ({users.filter(u => u.type === 'school').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownMenuItem, filterType === 'provider' && styles.dropdownMenuItemActive]}
              onPress={() => handleSelectFilter('provider')}
            >
              <Text style={[styles.dropdownMenuItemText, filterType === 'provider' && styles.dropdownMenuItemTextActive]}>
                Prestataires ({users.filter(u => u.type === 'provider').length})
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
              <View key={user.id} style={styles.userCard}>
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
                  <Text style={styles.userDate}>Inscrit le {formatDate(user.created_at)}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.text }]}>
                    {getUserTypeLabel(user.type)}
                  </Text>
                </View>
              </View>
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
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
    position: 'relative',
    zIndex: 1000,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
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
  },
  dropdownMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownMenuItemActive: {
    backgroundColor: '#EEF2FF',
  },
  dropdownMenuItemText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  dropdownMenuItemTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
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
    marginBottom: 2,
  },
  userDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
