import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase, ParentCredit } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { showAlert } from '@/lib/alert';
import {
  ArrowLeft, Search, Wallet, ChevronRight, Plus, Pencil, Trash2,
  Power, X,
} from 'lucide-react-native';

const ACCENT = '#4F46E5';
const ACCENT_BG = '#EEF2FF';

interface ParentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const remaining = (c: ParentCredit) => Number(c.amount) - Number(c.used_amount);
const round2 = (n: number) => Math.round(n * 100) / 100;

const fmtAmount = (n: number) => `${round2(n).toFixed(2)} DH`;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const parsePositiveAmount = (raw: string): number | null => {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!isFinite(n) || n < 0) return null;
  return round2(n);
};

export default function AdminCagnottesScreen() {
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [creditsByParent, setCreditsByParent] = useState<Record<string, ParentCredit[]>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Modal de saisie de montant (ajout / modification)
  const [amountModal, setAmountModal] = useState<
    | { mode: 'add'; parentId: string }
    | { mode: 'edit'; credit: ParentCredit }
    | null
  >(null);
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const [{ data: parentRows }, { data: creditRows }] = await Promise.all([
        supabase
          .from('parents')
          .select('id, first_name, last_name, email')
          .order('created_at', { ascending: false }),
        supabase
          .from('parent_credits')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      setParents((parentRows || []) as ParentRow[]);

      const grouped: Record<string, ParentCredit[]> = {};
      ((creditRows || []) as ParentCredit[]).forEach((c) => {
        (grouped[c.parent_id] ||= []).push(c);
      });
      setCreditsByParent(grouped);
    } catch (e) {
      console.error('cagnottes load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const balanceOf = useCallback(
    (parentId: string) =>
      (creditsByParent[parentId] || [])
        .filter((c) => c.is_active !== false)
        .reduce((s, c) => s + remaining(c), 0),
    [creditsByParent]
  );

  const filteredParents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const withBalance = (p: ParentRow) => (creditsByParent[p.id]?.length ?? 0) > 0;
    const list = q
      ? parents.filter((p) => {
          const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
          return name.includes(q) || (p.email || '').toLowerCase().includes(q);
        })
      : parents;
    // Les parents avec au moins une cagnotte d'abord, puis tri par solde décroissant.
    return [...list].sort((a, b) => {
      const aw = withBalance(a) ? 1 : 0;
      const bw = withBalance(b) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return balanceOf(b.id) - balanceOf(a.id);
    });
  }, [parents, creditsByParent, searchQuery, balanceOf]);

  const selectedParent = useMemo(
    () => parents.find((p) => p.id === selectedParentId) || null,
    [parents, selectedParentId]
  );
  const selectedCredits = selectedParentId ? creditsByParent[selectedParentId] || [] : [];

  const parentName = (p: ParentRow | null) =>
    p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent' : '';

  // ---------- Mutations ----------

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
    const amount = parsePositiveAmount(amountInput);
    if (amount === null) {
      showAlert('Montant invalide', 'Entrez un montant valide (ex : 50 ou 50.5).');
      return;
    }

    setProcessing(true);
    try {
      if (amountModal.mode === 'add') {
        if (amount <= 0) {
          showAlert('Montant invalide', 'Le montant à ajouter doit être supérieur à 0.');
          setProcessing(false);
          return;
        }
        const { error } = await supabase.from('parent_credits').insert({
          parent_id: amountModal.parentId,
          amount,
          used_amount: 0,
          source_reservation_id: null,
          is_active: true,
        });
        if (error) throw error;
        await loadData();
        setAmountModal(null);
        showAlert('Cagnotte créée', `${fmtAmount(amount)} ont été ajoutés.`);
      } else {
        const credit = amountModal.credit;
        const used = Number(credit.used_amount);
        if (amount < used) {
          showAlert(
            'Montant trop bas',
            `Déjà ${fmtAmount(used)} consommés sur cette cagnotte. Le montant ne peut pas être inférieur.`
          );
          setProcessing(false);
          return;
        }
        const { error } = await supabase
          .from('parent_credits')
          .update({ amount })
          .eq('id', credit.id);
        if (error) throw error;
        await loadData();
        setAmountModal(null);
        showAlert('Cagnotte modifiée', `Nouveau montant : ${fmtAmount(amount)}.`);
      }
    } catch (e: any) {
      console.error('submitAmount error', e);
      showAlert('Erreur', e?.message || "L'opération a échoué.");
    } finally {
      setProcessing(false);
    }
  };

  const toggleActive = async (credit: ParentCredit) => {
    const next = credit.is_active === false;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('parent_credits')
        .update({ is_active: next })
        .eq('id', credit.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      console.error('toggleActive error', e);
      showAlert('Erreur', e?.message || "Impossible de modifier l'état de la cagnotte.");
    } finally {
      setProcessing(false);
    }
  };

  const askToggleActive = (credit: ParentCredit) => {
    const willDeactivate = credit.is_active !== false;
    showAlert(
      willDeactivate ? 'Désactiver cette cagnotte ?' : 'Réactiver cette cagnotte ?',
      willDeactivate
        ? 'Le parent ne pourra plus utiliser ce crédit tant qu’il est désactivé.'
        : 'Le parent pourra de nouveau utiliser ce crédit.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: willDeactivate ? 'Désactiver' : 'Réactiver',
          style: willDeactivate ? 'destructive' : 'default',
          onPress: () => toggleActive(credit),
        },
      ]
    );
  };

  const deleteCredit = async (credit: ParentCredit) => {
    setProcessing(true);
    try {
      const { error } = await supabase.from('parent_credits').delete().eq('id', credit.id);
      if (error) throw error;
      await loadData();
    } catch (e: any) {
      console.error('deleteCredit error', e);
      showAlert('Erreur', e?.message || 'Impossible de supprimer la cagnotte.');
    } finally {
      setProcessing(false);
    }
  };

  const askDeleteCredit = (credit: ParentCredit) => {
    showAlert(
      'Supprimer cette cagnotte ?',
      `Cette action est définitive et supprime ${fmtAmount(remaining(credit))} de crédit disponible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteCredit(credit) },
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
        <TouchableOpacity onPress={() => safeBack('/(admin)')} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cagnottes</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un parent…"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredParents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>Aucun parent trouvé.</Text>
          </View>
        ) : (
          filteredParents.map((p) => {
            const credits = creditsByParent[p.id] || [];
            const balance = balanceOf(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.parentCard}
                onPress={() => setSelectedParentId(p.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.walletBadge, { backgroundColor: ACCENT_BG }]}>
                  <Wallet size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.parentName} numberOfLines={1}>{parentName(p)}</Text>
                  <Text style={styles.parentMeta} numberOfLines={1}>
                    {credits.length > 0
                      ? `${credits.length} cagnotte${credits.length > 1 ? 's' : ''}`
                      : 'Aucune cagnotte'}
                  </Text>
                </View>
                <View style={styles.balanceWrap}>
                  <Text style={styles.balanceValue}>{fmtAmount(balance)}</Text>
                  <ChevronRight size={18} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ---------- Détail d'un parent ---------- */}
      <Modal
        visible={!!selectedParentId}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedParentId(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{parentName(selectedParent)}</Text>
                <Text style={styles.sheetSubtitle}>
                  Solde disponible : {fmtAmount(selectedParentId ? balanceOf(selectedParentId) : 0)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedParentId(null)} style={styles.iconBtn}>
                <X size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => selectedParentId && openAddModal(selectedParentId)}
              disabled={processing}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Ajouter de l'argent</Text>
            </TouchableOpacity>

            <ScrollView
              style={{ marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedCredits.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>Aucune cagnotte pour ce parent.</Text>
                </View>
              ) : (
                selectedCredits.map((c) => {
                  const inactive = c.is_active === false;
                  const isManual = !c.source_reservation_id;
                  return (
                    <View key={c.id} style={[styles.creditCard, inactive && styles.creditCardInactive]}>
                      <View style={styles.creditTop}>
                        <Text style={styles.creditAmount}>{fmtAmount(remaining(c))}</Text>
                        <View style={[styles.statusPill, inactive ? styles.statusOff : styles.statusOn]}>
                          <Text style={[styles.statusText, inactive ? styles.statusTextOff : styles.statusTextOn]}>
                            {inactive ? 'Désactivée' : 'Active'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.creditMeta}>
                        Montant : {fmtAmount(Number(c.amount))} · Utilisé : {fmtAmount(Number(c.used_amount))}
                      </Text>
                      <Text style={styles.creditMeta}>
                        {isManual ? 'Ajout manuel (admin)' : 'Annulation de repas'} · {formatDate(c.created_at)}
                      </Text>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openEditModal(c)}
                          disabled={processing}
                        >
                          <Pencil size={16} color={ACCENT} />
                          <Text style={[styles.actionText, { color: ACCENT }]}>Modifier</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => askToggleActive(c)}
                          disabled={processing}
                        >
                          <Power size={16} color={inactive ? '#10B981' : '#F59E0B'} />
                          <Text style={[styles.actionText, { color: inactive ? '#10B981' : '#F59E0B' }]}>
                            {inactive ? 'Activer' : 'Désactiver'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => askDeleteCredit(c)}
                          disabled={processing}
                        >
                          <Trash2 size={16} color="#DC2626" />
                          <Text style={[styles.actionText, { color: '#DC2626' }]}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Saisie de montant (ajout / modification) ---------- */}
      <Modal
        visible={!!amountModal}
        transparent
        animationType="fade"
        onRequestClose={() => !processing && setAmountModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.dialogBackdrop}
        >
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {amountModal?.mode === 'add' ? "Ajouter de l'argent" : 'Modifier le montant'}
            </Text>
            {amountModal?.mode === 'edit' && (
              <Text style={styles.dialogHint}>
                Déjà consommé : {fmtAmount(Number(amountModal.credit.used_amount))}
              </Text>
            )}
            <View style={styles.amountInputWrap}>
              <TextInput
                style={styles.amountInput}
                value={amountInput}
                onChangeText={setAmountInput}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.amountSuffix}>DH</Text>
            </View>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnCancel]}
                onPress={() => setAmountModal(null)}
                disabled={processing}
              >
                <Text style={styles.dialogBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogBtnConfirm]}
                onPress={submitAmount}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogBtnConfirmText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  scrollView: { flex: 1 },
  parentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  walletBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  parentName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  parentMeta: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  balanceWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 14, color: '#9CA3AF' },

  // Sheet détail parent
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  iconBtn: { padding: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  creditCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  creditCardInactive: { opacity: 0.7, backgroundColor: '#F9FAFB' },
  creditTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  creditAmount: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusOn: { backgroundColor: '#D1FAE5' },
  statusOff: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextOn: { color: '#059669' },
  statusTextOff: { color: '#DC2626' },
  creditMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    justifyContent: 'space-between',
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  actionText: { fontSize: 13, fontWeight: '600' },

  // Dialog saisie montant
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 360, padding: 20 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
  dialogHint: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  amountInput: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', paddingVertical: 14 },
  amountSuffix: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  dialogButtons: { flexDirection: 'row', gap: 12 },
  dialogBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dialogBtnCancel: { backgroundColor: '#F3F4F6' },
  dialogBtnCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  dialogBtnConfirm: { backgroundColor: ACCENT },
  dialogBtnConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
