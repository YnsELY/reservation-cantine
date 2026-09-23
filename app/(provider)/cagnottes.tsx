import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { showAlert } from '@/lib/alert';
import { safeBack } from '@/lib/navigation';
import { comparePeopleByLastName, normalizeSearchText } from '@/lib/people';
import { ParentCredit, supabase } from '@/lib/supabase';

const ACCENT = '#065F46';
const ACCENT_BG = '#D1FAE5';

interface ManagedParent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  children_names: string[] | null;
  school_names: string[] | null;
}

const remaining = (credit: ParentCredit) =>
  Number(credit.amount) - Number(credit.used_amount);
const round2 = (value: number) => Math.round(value * 100) / 100;
const formatAmount = (value: number) => `${round2(value).toFixed(2)} DH`;

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const parseAmount = (raw: string): number | null => {
  const value = Number(raw.replace(',', '.').trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return round2(value);
};

const parentName = (parent: ManagedParent | null) => {
  if (!parent) return '';
  return `${parent.first_name || ''} ${parent.last_name || ''}`.trim() || 'Parent';
};

export default function ProviderCagnottesScreen() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [parents, setParents] = useState<ManagedParent[]>([]);
  const [creditsByParent, setCreditsByParent] = useState<Record<string, ParentCredit[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [amountModal, setAmountModal] = useState<
    | { mode: 'add'; parentId: string }
    | { mode: 'edit'; credit: ParentCredit }
    | null
  >(null);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const provider = await authService.getCurrentProviderFromAuth();
      if (!provider || provider.is_active === false) {
        router.replace('/auth');
        return;
      }

      const [{ data: parentRows, error: parentError }, { data: creditRows, error: creditError }] =
        await Promise.all([
          supabase.rpc('provider_managed_parents'),
          supabase.from('parent_credits').select('*').order('created_at', { ascending: false }),
        ]);

      if (parentError) throw parentError;
      if (creditError) throw creditError;

      const managedParents = (parentRows || []) as ManagedParent[];
      const managedIds = new Set(managedParents.map((parent) => parent.id));
      const grouped: Record<string, ParentCredit[]> = {};
      ((creditRows || []) as ParentCredit[]).forEach((credit) => {
        if (managedIds.has(credit.parent_id)) {
          (grouped[credit.parent_id] ||= []).push(credit);
        }
      });

      setParents(managedParents);
      setCreditsByParent(grouped);
      setSelectedParentId((current) =>
        current && managedIds.has(current) ? current : null
      );
    } catch (caught: any) {
      console.error('provider cagnottes load error', caught);
      setError(caught?.message || 'Impossible de charger les cagnottes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const balanceOf = useCallback(
    (parentId: string) =>
      (creditsByParent[parentId] || [])
        .filter((credit) => credit.is_active !== false)
        .reduce((sum, credit) => sum + remaining(credit), 0),
    [creditsByParent]
  );

  const filteredParents = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    const filtered = query
      ? parents.filter((parent) =>
          [
            parentName(parent),
            `${parent.last_name || ''} ${parent.first_name || ''}`.trim(),
            parent.email || '',
            ...(parent.children_names || []),
            ...(parent.school_names || []),
          ].some((value) => normalizeSearchText(value).includes(query))
        )
      : parents;

    return [...filtered].sort(comparePeopleByLastName);
  }, [parents, searchQuery]);

  const selectedParent = useMemo(
    () => parents.find((parent) => parent.id === selectedParentId) || null,
    [parents, selectedParentId]
  );
  const selectedCredits = selectedParentId
    ? creditsByParent[selectedParentId] || []
    : [];

  const openAddModal = (parentId: string) => {
    setAmountInput('');
    setAmountModal({ mode: 'add', parentId });
  };

  const openEditModal = (credit: ParentCredit) => {
    setAmountInput(String(credit.amount));
    setAmountModal({ mode: 'edit', credit });
  };

  const submitAmount = async () => {
    if (!amountModal) return;
    const amount = parseAmount(amountInput);
    if (amount === null) {
      showAlert('Montant invalide', 'Entrez un montant valide, par exemple 50 ou 50,50.');
      return;
    }

    if (amountModal.mode === 'add' && amount <= 0) {
      showAlert('Montant invalide', 'Le montant à ajouter doit être supérieur à 0.');
      return;
    }

    if (
      amountModal.mode === 'edit' &&
      amount < Number(amountModal.credit.used_amount)
    ) {
      showAlert(
        'Montant trop bas',
        `${formatAmount(Number(amountModal.credit.used_amount))} ont déjà été consommés.`
      );
      return;
    }

    setProcessing(true);
    try {
      const result =
        amountModal.mode === 'add'
          ? await supabase.from('parent_credits').insert({
              parent_id: amountModal.parentId,
              amount,
              used_amount: 0,
              source_reservation_id: null,
              is_active: true,
            })
          : await supabase
              .from('parent_credits')
              .update({ amount })
              .eq('id', amountModal.credit.id);

      if (result.error) throw result.error;
      setAmountModal(null);
      await loadData();
      showAlert(
        amountModal.mode === 'add' ? 'Cagnotte créditée' : 'Cagnotte modifiée',
        amountModal.mode === 'add'
          ? `${formatAmount(amount)} ont été ajoutés.`
          : `Nouveau montant : ${formatAmount(amount)}.`
      );
    } catch (caught: any) {
      console.error('provider submit credit error', caught);
      showAlert('Erreur', caught?.message || "L'opération a échoué.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleActive = async (credit: ParentCredit) => {
    const activate = credit.is_active === false;
    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('parent_credits')
        .update({ is_active: activate })
        .eq('id', credit.id);
      if (updateError) throw updateError;
      await loadData();
    } catch (caught: any) {
      console.error('provider toggle credit error', caught);
      showAlert('Erreur', caught?.message || "Impossible de modifier l'état de la cagnotte.");
    } finally {
      setProcessing(false);
    }
  };

  const confirmToggle = (credit: ParentCredit) => {
    const deactivate = credit.is_active !== false;
    showAlert(
      deactivate ? 'Désactiver cette cagnotte ?' : 'Réactiver cette cagnotte ?',
      deactivate
        ? 'Le parent ne pourra plus utiliser ce crédit tant qu’il est désactivé.'
        : 'Le parent pourra de nouveau utiliser ce crédit.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: deactivate ? 'Désactiver' : 'Réactiver',
          style: deactivate ? 'destructive' : 'default',
          onPress: () => toggleActive(credit),
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            selectedParentId ? setSelectedParentId(null) : safeBack('/(provider)')
          }
          style={styles.iconButton}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {selectedParent ? parentName(selectedParent) : 'Cagnottes'}
        </Text>
        <View style={styles.iconButton} />
      </View>

      {error ? (
        <View style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadData} style={styles.retryButton}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : selectedParent ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Solde disponible</Text>
            <Text style={styles.summaryAmount}>{formatAmount(balanceOf(selectedParent.id))}</Text>
            <Text style={styles.summaryMeta}>
              {(selectedParent.children_names || []).join(', ') || 'Aucun élève'}
            </Text>
            <Text style={styles.summaryMeta}>
              {(selectedParent.school_names || []).join(', ') || 'École non renseignée'}
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => openAddModal(selectedParent.id)}
              disabled={processing}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Ajouter de l’argent</Text>
            </TouchableOpacity>
          </View>

          {selectedCredits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Wallet size={36} color="#9CA3AF" />
              <Text style={styles.emptyText}>Aucune cagnotte pour ce parent.</Text>
            </View>
          ) : (
            selectedCredits.map((credit) => {
              const inactive = credit.is_active === false;
              return (
                <View key={credit.id} style={[styles.creditCard, inactive && styles.inactiveCard]}>
                  <View style={styles.creditHeader}>
                    <Text style={styles.creditAmount}>{formatAmount(remaining(credit))}</Text>
                    <View style={[styles.statusBadge, inactive && styles.inactiveBadge]}>
                      <Text style={[styles.statusText, inactive && styles.inactiveText]}>
                        {inactive ? 'Désactivée' : 'Active'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.creditMeta}>
                    Montant : {formatAmount(Number(credit.amount))} · Utilisé :{' '}
                    {formatAmount(Number(credit.used_amount))}
                  </Text>
                  <Text style={styles.creditMeta}>Créée le {formatDate(credit.created_at)}</Text>
                  <Text style={styles.creditMeta}>
                    Origine : {credit.source_reservation_id ? 'annulation de repas' : 'ajout manuel'}
                  </Text>
                  <View style={styles.creditActions}>
                    <TouchableOpacity
                      style={styles.smallAction}
                      onPress={() => openEditModal(credit)}
                      disabled={processing}
                    >
                      <Pencil size={18} color="#374151" />
                      <Text style={styles.smallActionText}>Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallAction}
                      onPress={() => confirmToggle(credit)}
                      disabled={processing}
                    >
                      <Power size={18} color={inactive ? ACCENT : '#B45309'} />
                      <Text style={styles.smallActionText}>
                        {inactive ? 'Réactiver' : 'Désactiver'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Search size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Parent, élève ou école..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {filteredParents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Wallet size={42} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>Aucun parent accessible</Text>
                <Text style={styles.emptyText}>
                  Seuls les parents ayant un élève dans une de vos écoles partenaires apparaissent ici.
                </Text>
              </View>
            ) : (
              filteredParents.map((parent) => {
                const creditCount = creditsByParent[parent.id]?.length || 0;
                return (
                  <TouchableOpacity
                    key={parent.id}
                    style={styles.parentCard}
                    onPress={() => setSelectedParentId(parent.id)}
                  >
                    <View style={styles.walletIcon}>
                      <Wallet size={22} color={ACCENT} />
                    </View>
                    <View style={styles.parentInfo}>
                      <Text style={styles.parentName}>{parentName(parent)}</Text>
                      <Text style={styles.parentMeta} numberOfLines={1}>
                        {(parent.children_names || []).join(', ') || parent.email || 'Parent'}
                      </Text>
                      <Text style={styles.schoolMeta} numberOfLines={1}>
                        {(parent.school_names || []).join(', ')}
                      </Text>
                    </View>
                    <View style={styles.balanceBlock}>
                      <Text style={styles.balanceText}>{formatAmount(balanceOf(parent.id))}</Text>
                      <Text style={styles.countText}>
                        {creditCount} crédit{creditCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <ChevronRight size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </>
      )}

      <Modal visible={amountModal !== null} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {amountModal?.mode === 'add' ? "Ajouter de l'argent" : 'Modifier le montant'}
              </Text>
              <TouchableOpacity onPress={() => setAmountModal(null)} disabled={processing}>
                <X size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            {amountModal?.mode === 'edit' && (
              <Text style={styles.modalHint}>
                Déjà consommé : {formatAmount(Number(amountModal.credit.used_amount))}
              </Text>
            )}
            <View style={styles.amountInputWrap}>
              <TextInput
                style={styles.amountInput}
                value={amountInput}
                onChangeText={setAmountInput}
                placeholder="0,00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.currency}>DH</Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmButton, processing && styles.disabledButton]}
              onPress={submitAmount}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '700', color: '#111827' },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  searchWrap: {
    margin: 20,
    marginBottom: 0,
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  parentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_BG,
  },
  parentInfo: { flex: 1 },
  parentName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  parentMeta: { marginTop: 3, fontSize: 12, color: '#6B7280' },
  schoolMeta: { marginTop: 2, fontSize: 11, color: ACCENT, fontWeight: '600' },
  balanceBlock: { alignItems: 'flex-end' },
  balanceText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  countText: { marginTop: 3, fontSize: 11, color: '#9CA3AF' },
  summaryCard: { padding: 20, borderRadius: 18, backgroundColor: ACCENT_BG },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: ACCENT },
  summaryAmount: { marginTop: 4, fontSize: 30, fontWeight: '800', color: '#064E3B' },
  summaryMeta: { marginTop: 5, fontSize: 12, color: '#047857' },
  addButton: {
    marginTop: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  creditCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inactiveCard: { opacity: 0.7, backgroundColor: '#F3F4F6' },
  creditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditAmount: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: '#D1FAE5' },
  inactiveBadge: { backgroundColor: '#E5E7EB' },
  statusText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  inactiveText: { color: '#6B7280' },
  creditMeta: { marginTop: 5, fontSize: 12, color: '#6B7280' },
  creditActions: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 },
  smallActionText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  deleteText: { color: '#DC2626' },
  emptyCard: { alignItems: 'center', padding: 36, borderRadius: 14, backgroundColor: '#FFFFFF' },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyText: { marginTop: 7, textAlign: 'center', fontSize: 13, lineHeight: 19, color: '#6B7280' },
  messageCard: { margin: 20, padding: 20, alignItems: 'center', borderRadius: 14, backgroundColor: '#FEF2F2' },
  errorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: ACCENT },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(17, 24, 39, 0.55)' },
  modalCard: { width: '100%', maxWidth: 440, padding: 22, borderRadius: 18, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#111827' },
  modalHint: { marginTop: 10, fontSize: 13, color: '#6B7280' },
  amountInputWrap: { marginTop: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12 },
  amountInput: { flex: 1, minHeight: 52, fontSize: 20, fontWeight: '700', color: '#111827' },
  currency: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  confirmButton: { marginTop: 18, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: ACCENT },
  disabledButton: { opacity: 0.6 },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
