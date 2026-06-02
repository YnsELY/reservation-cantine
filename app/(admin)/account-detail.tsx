import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import {
  ArrowLeft, User, Building2, Store, Mail, Phone, MapPin, Key,
  GraduationCap, School as SchoolIcon, ShoppingBag,
} from 'lucide-react-native';

type AccountType = 'parent' | 'school' | 'provider';

const TYPE_LABEL: Record<AccountType, string> = {
  parent: 'Parent',
  school: 'École',
  provider: 'Prestataire',
};

const ACCENT: Record<AccountType, string> = {
  parent: '#4F46E5',
  school: '#10B981',
  provider: '#F59E0B',
};

const ACCENT_BG: Record<AccountType, string> = {
  parent: '#EEF2FF',
  school: '#D1FAE5',
  provider: '#FEF3C7',
};

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  if (isNaN(birth.getTime()) || birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const genreLabel = (g: string | null) => (g === 'fille' ? 'Fille' : g === 'garcon' ? 'Garçon' : null);

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const type = (Array.isArray(params.type) ? params.type[0] : params.type) as AccountType;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);

  const [genreFilter, setGenreFilter] = useState<'all' | 'fille' | 'garcon'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [type, id]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }
      if (!type || !id) {
        safeBack('/(admin)/users');
        return;
      }

      if (type === 'parent') {
        const { data: p } = await supabase.from('parents').select('*').eq('id', id).maybeSingle();
        setAccount(p);
        const { data: ch } = await supabase
          .from('children').select('*').eq('parent_id', id).order('first_name');
        setChildren(ch || []);
        const { data: aff } = await supabase
          .from('parent_school_affiliations')
          .select('schools(*)').eq('parent_id', id).eq('status', 'active');
        setSchools((aff || []).map((a: any) => a.schools).filter(Boolean));
        const { data: res } = await supabase
          .from('reservations')
          .select('id, date, total_price, payment_status, menus(meal_name), children(first_name, last_name)')
          .eq('parent_id', id)
          .order('date', { ascending: false })
          .limit(50);
        setReservations(res || []);
      } else if (type === 'provider') {
        const { data: pr } = await supabase.from('providers').select('*').eq('id', id).maybeSingle();
        setAccount(pr);
        const { data: acc } = await supabase
          .from('provider_school_access')
          .select('granted_at, schools(*)').eq('provider_id', id);
        setSchools((acc || []).map((a: any) => ({ ...(a.schools || {}), granted_at: a.granted_at })).filter((s: any) => s.id));
      } else if (type === 'school') {
        const { data: s } = await supabase.from('schools').select('*').eq('id', id).maybeSingle();
        setAccount(s);
        const { data: ch } = await supabase
          .from('children').select('*').eq('school_id', id).order('last_name');
        setChildren(ch || []);
        const { data: acc } = await supabase
          .from('provider_school_access')
          .select('granted_at, providers(*)').eq('school_id', id);
        setProviders((acc || []).map((a: any) => ({ ...(a.providers || {}), granted_at: a.granted_at })).filter((p: any) => p.id));
      }
    } catch (e) {
      console.error('account-detail load error', e);
    } finally {
      setLoading(false);
    }
  };

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    children.forEach((c) => { if (c.grade) set.add(c.grade); });
    return Array.from(set);
  }, [children]);

  const filteredStudents = useMemo(() => {
    return children.filter((c) =>
      (genreFilter === 'all' || c.genre === genreFilter) &&
      (classFilter === 'all' || c.grade === classFilter)
    );
  }, [children, genreFilter, classFilter]);

  const title = account
    ? type === 'parent'
      ? `${account.first_name || ''} ${account.last_name || ''}`.trim() || 'Parent'
      : type === 'provider'
        ? account.company_name || account.name || 'Prestataire'
        : account.name || 'École'
    : '';

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!account) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack('/(admin)/users')} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Compte introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const accent = ACCENT[type] || '#4F46E5';
  const accentBg = ACCENT_BG[type] || '#EEF2FF';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(admin)/users')} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={[styles.avatarContainer, { backgroundColor: accentBg }]}>
          {type === 'parent' && <User size={32} color={accent} />}
          {type === 'school' && <Building2 size={32} color={accent} />}
          {type === 'provider' && <Store size={32} color={accent} />}
        </View>
        <Text style={styles.profileName}>{title}</Text>
        <View style={[styles.typeBadge, { backgroundColor: accentBg }]}>
          <Text style={[styles.typeBadgeText, { color: accent }]}>{TYPE_LABEL[type]}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------- Informations ---------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <View style={styles.infoCard}>
            {type === 'parent' && (
              <>
                <InfoRow icon={<Mail size={18} color="#6B7280" />} label="Email" value={account.email} />
                <InfoRow icon={<Phone size={18} color="#6B7280" />} label="Téléphone" value={account.phone} last />
              </>
            )}
            {type === 'provider' && (
              <>
                <InfoRow icon={<Mail size={18} color="#6B7280" />} label="Email" value={account.email || account.contact_email} />
                <InfoRow icon={<Phone size={18} color="#6B7280" />} label="Téléphone" value={account.phone || account.contact_phone} />
                <InfoRow icon={<MapPin size={18} color="#6B7280" />} label="Adresse" value={account.address} last={!account.description} />
                {account.description ? (
                  <InfoRow icon={<Store size={18} color="#6B7280" />} label="Description" value={account.description} last />
                ) : null}
              </>
            )}
            {type === 'school' && (
              <>
                <InfoRow icon={<Mail size={18} color="#6B7280" />} label="Email" value={account.contact_email} />
                <InfoRow icon={<Phone size={18} color="#6B7280" />} label="Téléphone" value={account.contact_phone} />
                <InfoRow icon={<MapPin size={18} color="#6B7280" />} label="Adresse" value={account.address} />
                <InfoRow icon={<Key size={18} color="#6B7280" />} label="Code d'accès" value={account.access_code} last />
              </>
            )}
          </View>
        </View>

        {/* ---------- PARENT : enfants ---------- */}
        {type === 'parent' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enfants ({children.length})</Text>
            {children.length === 0 ? (
              <EmptyCard text="Aucun enfant" />
            ) : (
              children.map((c) => (
                <View key={c.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{c.first_name} {c.last_name}</Text>
                  <View style={styles.tagRow}>
                    {c.grade ? <Tag text={c.grade} /> : null}
                    {genreLabel(c.genre) ? <Tag text={genreLabel(c.genre)!} /> : null}
                    {calculateAge(c.date_of_birth) !== null ? <Tag text={`${calculateAge(c.date_of_birth)} ans`} /> : null}
                  </View>
                  {Array.isArray(c.allergies) && c.allergies.length > 0 && (
                    <Text style={styles.itemSub}>Allergies : {c.allergies.join(', ')}</Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------- PARENT : écoles affiliées ---------- */}
        {type === 'parent' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Écoles affiliées ({schools.length})</Text>
            {schools.length === 0 ? (
              <EmptyCard text="Aucune école affiliée" />
            ) : (
              schools.map((s) => (
                <View key={s.id} style={styles.itemCard}>
                  <View style={styles.rowCenter}>
                    <SchoolIcon size={18} color="#10B981" />
                    <Text style={styles.itemTitleInline}>{s.name}</Text>
                  </View>
                  {s.address ? <Text style={styles.itemSub}>{s.address}</Text> : null}
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------- PARENT : historique commandes ---------- */}
        {type === 'parent' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historique des commandes ({reservations.length})</Text>
            {reservations.length === 0 ? (
              <EmptyCard text="Aucune commande" />
            ) : (
              reservations.map((r) => (
                <View key={r.id} style={styles.itemCard}>
                  <View style={styles.orderHeader}>
                    <View style={styles.rowCenter}>
                      <ShoppingBag size={16} color="#6B7280" />
                      <Text style={styles.orderDate}>{formatDate(r.date)}</Text>
                    </View>
                    <PaymentBadge status={r.payment_status} />
                  </View>
                  <Text style={styles.itemTitle}>{r.menus?.meal_name || 'Menu'}</Text>
                  <View style={styles.orderFooter}>
                    {r.children?.first_name ? (
                      <Text style={styles.itemSub}>Pour {r.children.first_name}</Text>
                    ) : <View />}
                    <Text style={styles.orderPrice}>{Number(r.total_price || 0).toFixed(2)} DH</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------- PROVIDER : écoles desservies ---------- */}
        {type === 'provider' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Écoles desservies ({schools.length})</Text>
            {schools.length === 0 ? (
              <EmptyCard text="Aucune école partenaire" />
            ) : (
              schools.map((s) => (
                <View key={s.id} style={styles.itemCard}>
                  <View style={styles.rowCenter}>
                    <SchoolIcon size={18} color="#10B981" />
                    <Text style={styles.itemTitleInline}>{s.name}</Text>
                  </View>
                  {s.address ? <Text style={styles.itemSub}>{s.address}</Text> : null}
                  {s.granted_at ? <Text style={styles.itemMeta}>Depuis le {formatDate(s.granted_at)}</Text> : null}
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------- SCHOOL : prestataires liés ---------- */}
        {type === 'school' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prestataires liés ({providers.length})</Text>
            {providers.length === 0 ? (
              <EmptyCard text="Aucun prestataire lié" />
            ) : (
              providers.map((p) => (
                <View key={p.id} style={styles.itemCard}>
                  <View style={styles.rowCenter}>
                    <Store size={18} color="#F59E0B" />
                    <Text style={styles.itemTitleInline}>{p.company_name || p.name || 'Prestataire'}</Text>
                  </View>
                  {(p.email || p.contact_email) ? <Text style={styles.itemSub}>{p.email || p.contact_email}</Text> : null}
                  {p.granted_at ? <Text style={styles.itemMeta}>Depuis le {formatDate(p.granted_at)}</Text> : null}
                </View>
              ))
            )}
          </View>
        )}

        {/* ---------- SCHOOL : aperçu élèves + filtres ---------- */}
        {type === 'school' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Élèves ({filteredStudents.length}/{children.length})</Text>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Sexe</Text>
              <View style={styles.filterPillsRow}>
                <FilterPill label="Tous" active={genreFilter === 'all'} onPress={() => setGenreFilter('all')} />
                <FilterPill label="Filles" active={genreFilter === 'fille'} onPress={() => setGenreFilter('fille')} color="#EC4899" />
                <FilterPill label="Garçons" active={genreFilter === 'garcon'} onPress={() => setGenreFilter('garcon')} color="#3B82F6" />
              </View>
            </View>

            {classOptions.length > 0 && (
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Classe</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
                  <FilterPill label="Toutes" active={classFilter === 'all'} onPress={() => setClassFilter('all')} />
                  {classOptions.map((g) => (
                    <FilterPill key={g} label={g} active={classFilter === g} onPress={() => setClassFilter(g)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {filteredStudents.length === 0 ? (
              <EmptyCard text="Aucun élève pour ces filtres" />
            ) : (
              filteredStudents.map((c) => (
                <View key={c.id} style={styles.itemCard}>
                  <View style={styles.rowCenter}>
                    <GraduationCap size={18} color="#4F46E5" />
                    <Text style={styles.itemTitleInline}>{c.first_name} {c.last_name}</Text>
                  </View>
                  <View style={styles.tagRow}>
                    {c.grade ? <Tag text={c.grade} /> : null}
                    {genreLabel(c.genre) ? <Tag text={genreLabel(c.genre)!} /> : null}
                    {calculateAge(c.date_of_birth) !== null ? <Tag text={`${calculateAge(c.date_of_birth)} ans`} /> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, last }: { icon: ReactNode; label: string; value: string | null | undefined; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.rowCenter}>
        {icon}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={2}>{value || 'Non renseigné'}</Text>
    </View>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyCardText}>{text}</Text>
    </View>
  );
}

function FilterPill({ label, active, onPress, color = '#4F46E5' }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: '#D1FAE5', text: '#059669', label: 'Payé' },
    pending: { bg: '#FEF3C7', text: '#D97706', label: 'En attente' },
    cancelled: { bg: '#FEE2E2', text: '#DC2626', label: 'Annulé' },
  };
  const s = map[status] || { bg: '#F3F4F6', text: '#6B7280', label: status || '—' };
  return (
    <View style={[styles.payBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.payBadgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  scrollView: { flex: 1 },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'right',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  itemTitleInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  itemSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  itemMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  orderPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  payBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  payBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterGroup: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
