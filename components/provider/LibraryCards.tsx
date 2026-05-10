import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle, Edit, Trash2, XCircle } from 'lucide-react-native';

export interface LibraryMenu {
  id: string;
  meal_name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  card_color?: string | null;
  supplements?: string[] | null;
}

export interface LibrarySupplement {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  menu_id?: string | null;
  menu_name?: string | null;
  supplement_ids: string[];
  school_ids: string[];
  school_names: string[];
}

interface MenuCardProps {
  menu: LibraryMenu;
  onEdit: () => void;
  onDelete: () => void;
}

interface SupplementCardProps {
  supplement: LibrarySupplement;
  allSchoolsCount: number;
  onToggle: () => void;
  onDelete: () => void;
}

const getSchoolsLabel = (schoolIds: string[], schoolNames: string[], allSchoolsCount: number) => {
  if (allSchoolsCount > 0 && schoolIds.length === allSchoolsCount) {
    return 'Toutes les écoles';
  }

  return schoolNames.join(', ');
};

export function ProviderMenuCard({ menu, onEdit, onDelete }: MenuCardProps) {
  return (
    <View style={styles.menuCard}>
      <View style={styles.menuCardBody}>
        {menu.image_url ? (
          <Image source={{ uri: menu.image_url }} style={styles.menuImage} resizeMode="cover" />
        ) : (
          <View style={[styles.menuImage, styles.menuImagePlaceholder, { backgroundColor: menu.card_color || '#FDE2DE' }]} />
        )}

        <View style={styles.menuTextContent}>
          <Text style={styles.menuName} numberOfLines={1}>{menu.meal_name}</Text>
          {!!menu.description && (
            <Text style={styles.menuDescription} numberOfLines={2}>{menu.description}</Text>
          )}
          <Text style={styles.menuPrice}>{Number(menu.price).toFixed(2)} DH</Text>
        </View>
      </View>

      <View style={styles.menuActions}>
        <TouchableOpacity style={[styles.menuActionButton, styles.editAction]} onPress={onEdit}>
          <Edit size={14} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Modifier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuActionButton, styles.deleteAction]} onPress={onDelete}>
          <Trash2 size={14} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ProviderSupplementCard({ supplement, allSchoolsCount, onToggle, onDelete }: SupplementCardProps) {
  const isSpecific = !!supplement.menu_id;
  const schoolLabel = getSchoolsLabel(supplement.school_ids, supplement.school_names, allSchoolsCount);

  return (
    <View style={[styles.supplementCard, isSpecific ? styles.supplementCardSpecific : styles.supplementCardGeneric]}>
      <View style={styles.supplementCardBody}>
        <View style={styles.supplementHeader}>
          <Text style={styles.supplementName} numberOfLines={1}>{supplement.name}</Text>
          <View style={[styles.statusBadge, supplement.available ? styles.statusActive : styles.statusInactive]}>
            {supplement.available ? (
              <CheckCircle size={14} color="#10B981" />
            ) : (
              <XCircle size={14} color="#EF4444" />
            )}
            <Text style={[styles.statusText, supplement.available ? styles.statusTextActive : styles.statusTextInactive]}>
              {supplement.available ? 'Actif' : 'Inactif'}
            </Text>
          </View>
        </View>

        {isSpecific && !!supplement.menu_name && (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>Menu : {supplement.menu_name}</Text>
          </View>
        )}

        {!!supplement.description && (
          <Text style={styles.supplementDescription} numberOfLines={2}>{supplement.description}</Text>
        )}

        <Text style={styles.supplementPrice}>+{Number(supplement.price).toFixed(2)} DH</Text>

        <View style={[styles.schoolBadge, isSpecific ? styles.schoolBadgeSpecific : styles.schoolBadgeGeneric]}>
          <Text style={[styles.schoolBadgeText, isSpecific ? styles.schoolBadgeTextSpecific : styles.schoolBadgeTextGeneric]} numberOfLines={1}>
            {schoolLabel}
          </Text>
        </View>
      </View>

      <View style={styles.supplementActions}>
        <TouchableOpacity
          style={[styles.supplementActionButton, supplement.available ? styles.deactivateAction : styles.activateAction]}
          onPress={onToggle}
        >
          {supplement.available ? (
            <XCircle size={14} color="#EF4444" />
          ) : (
            <CheckCircle size={14} color="#10B981" />
          )}
          <Text style={[styles.toggleActionText, supplement.available ? styles.deactivateActionText : styles.activateActionText]}>
            {supplement.available ? 'Désactiver' : 'Activer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.supplementActionButton, styles.deleteAction]} onPress={onDelete}>
          <Trash2 size={14} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuCardBody: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  menuImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  menuImagePlaceholder: {
    backgroundColor: '#FDE2DE',
  },
  menuTextContent: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  menuName: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuDescription: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  menuPrice: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  menuActions: {
    flexDirection: 'row',
    height: 40,
  },
  menuActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editAction: {
    backgroundColor: '#4F46E5',
  },
  deleteAction: {
    backgroundColor: '#EF4444',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  supplementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  supplementCardGeneric: {
    borderLeftColor: '#10B981',
  },
  supplementCardSpecific: {
    borderLeftColor: '#4F46E5',
  },
  supplementCardBody: {
    padding: 16,
  },
  supplementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  supplementName: {
    flex: 1,
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#10B981',
  },
  statusTextInactive: {
    color: '#EF4444',
  },
  supplementDescription: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  supplementPrice: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  schoolBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  schoolBadgeGeneric: {
    backgroundColor: '#EEF2FF',
  },
  schoolBadgeSpecific: {
    backgroundColor: '#EEF2FF',
  },
  schoolBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  schoolBadgeTextGeneric: {
    color: '#4F46E5',
  },
  schoolBadgeTextSpecific: {
    color: '#4F46E5',
  },
  menuBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    maxWidth: '100%',
  },
  menuBadgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  supplementActions: {
    flexDirection: 'row',
    height: 40,
  },
  supplementActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deactivateAction: {
    backgroundColor: '#FEE2E2',
  },
  activateAction: {
    backgroundColor: '#D1FAE5',
  },
  toggleActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deactivateActionText: {
    color: '#EF4444',
  },
  activateActionText: {
    color: '#10B981',
  },
});
