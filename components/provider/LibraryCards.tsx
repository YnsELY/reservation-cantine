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
          <Edit size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Modifier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuActionButton, styles.deleteAction]} onPress={onDelete}>
          <Trash2 size={18} color="#FFFFFF" />
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
              <CheckCircle size={16} color="#00C781" />
            ) : (
              <XCircle size={16} color="#EF4444" />
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
            <XCircle size={18} color="#FF2D3F" />
          ) : (
            <CheckCircle size={18} color="#00A86B" />
          )}
          <Text style={[styles.toggleActionText, supplement.available ? styles.deactivateActionText : styles.activateActionText]}>
            {supplement.available ? 'Désactiver' : 'Activer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.supplementActionButton, styles.deleteAction]} onPress={onDelete}>
          <Trash2 size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 4,
  },
  menuCardBody: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 18,
  },
  menuImage: {
    width: 106,
    height: 106,
    borderRadius: 11,
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
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  menuDescription: {
    color: '#6B7280',
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 10,
  },
  menuPrice: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  menuActions: {
    flexDirection: 'row',
    height: 56,
  },
  menuActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editAction: {
    backgroundColor: '#5747F2',
  },
  deleteAction: {
    backgroundColor: '#FF2D3F',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  supplementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 18,
    overflow: 'hidden',
    borderLeftWidth: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 4,
  },
  supplementCardGeneric: {
    borderLeftColor: '#00C781',
  },
  supplementCardSpecific: {
    borderLeftColor: '#5747F2',
  },
  supplementCardBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  supplementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  supplementName: {
    flex: 1,
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 6,
    gap: 4,
  },
  statusActive: {
    backgroundColor: '#CFF8E3',
  },
  statusInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusTextActive: {
    color: '#00A86B',
  },
  statusTextInactive: {
    color: '#EF4444',
  },
  supplementDescription: {
    color: '#6B7280',
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 10,
  },
  supplementPrice: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  schoolBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  schoolBadgeGeneric: {
    backgroundColor: '#EEF2FF',
  },
  schoolBadgeSpecific: {
    backgroundColor: '#EEF2FF',
  },
  schoolBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  schoolBadgeTextGeneric: {
    color: '#4F46E5',
  },
  schoolBadgeTextSpecific: {
    color: '#4F46E5',
  },
  menuBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#D8EBFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
    maxWidth: '100%',
  },
  menuBadgeText: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '800',
  },
  supplementActions: {
    flexDirection: 'row',
    height: 56,
  },
  supplementActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deactivateAction: {
    backgroundColor: '#FFE0E0',
  },
  activateAction: {
    backgroundColor: '#D1FAE5',
  },
  toggleActionText: {
    fontSize: 18,
    fontWeight: '800',
  },
  deactivateActionText: {
    color: '#FF2D3F',
  },
  activateActionText: {
    color: '#00A86B',
  },
});
