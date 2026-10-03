import { useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  UtensilsCrossed,
  Sandwich,
} from 'lucide-react-native';
import { type MealCategory } from '@/lib/meal-category';

export const palette = {
  blue: '#0E5FC0',
  ink: '#142742',
  muted: '#68788F',
  bg: '#F4F6FB',
  peach: '#FFE8E0',
  line: '#E4EAF2',
  white: '#FFFFFF',
};
export const type = {
  body: 'Manrope',
  medium: 'ManropeSemiBold',
  bold: 'ManropeBold',
  heavy: 'ManropeExtraBold',
};

export function CategoryIcon({
  category,
  color = palette.blue,
  size = 24,
}: {
  category: MealCategory;
  color?: string;
  size?: number;
}) {
  return category === 'snack' ? (
    <Sandwich size={size} color={color} />
  ) : (
    <UtensilsCrossed size={size} color={color} />
  );
}

/** Only published menu photography; missing/broken images have a neutral icon. */
export function MenuPhoto({
  uri,
  category,
  style,
  label,
}: {
  uri?: string | null;
  category: MealCategory;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <View
      style={[
        {
          backgroundColor: category === 'snack' ? '#FFF3ED' : '#EAF1FA',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          accessibilityLabel={label}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <CategoryIcon category={category} size={42} />
      )}
    </View>
  );
}

export function RoundButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={ui.round}
    >
      {children}
    </TouchableOpacity>
  );
}
export function CartButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <RoundButton
      label={`Panier, ${count} article${count > 1 ? 's' : ''}`}
      onPress={onPress}
    >
      <ShoppingCart size={21} color={palette.ink} />
      {count > 0 && (
        <View style={ui.count}>
          <Text style={ui.countText}>{count}</Text>
        </View>
      )}
    </RoundButton>
  );
}
export function Header({
  title,
  back,
  right,
}: {
  title: string;
  back: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={ui.header}>
      <RoundButton label="Retour" onPress={back}>
        <ArrowLeft size={21} color={palette.ink} />
      </RoundButton>
      <Text style={ui.headerTitle}>{title}</Text>
      {right || <View style={{ width: 44 }} />}
    </View>
  );
}
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  children?: ReactNode;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        ui.button,
        secondary && ui.secondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      {children}
      <Text style={[ui.buttonText, secondary && { color: palette.blue }]}>
        {label}
      </Text>
      <ArrowRight size={19} color={secondary ? palette.blue : '#fff'} />
    </TouchableOpacity>
  );
}
export function Avatar({
  firstName,
  lastName = '',
  size = 42,
}: {
  firstName: string;
  lastName?: string;
  size?: number;
}) {
  return (
    <View
      style={[ui.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={ui.avatarText}>
        {firstName.charAt(0)}
        {lastName.charAt(0)}
      </Text>
    </View>
  );
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: type.heavy,
    fontSize: 18,
    color: palette.ink,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  count: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    backgroundColor: palette.blue,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#fff', fontFamily: type.bold, fontSize: 10 },
  eyebrow: {
    fontFamily: type.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: palette.blue,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: type.heavy,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -1,
    color: palette.ink,
  },
  sectionTitle: {
    fontFamily: type.heavy,
    fontSize: 21,
    letterSpacing: -0.5,
    color: palette.ink,
  },
  body: {
    fontFamily: type.body,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  small: {
    fontFamily: type.medium,
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  strong: { fontFamily: type.bold, fontSize: 15, color: palette.ink },
  link: { fontFamily: type.bold, fontSize: 12, color: palette.blue },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ECF0F6',
  },
  button: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: palette.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    flexShrink: 1,
    fontFamily: type.bold,
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },
  secondary: { backgroundColor: '#EEF4FD' },
  avatar: {
    backgroundColor: '#EAF1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: type.heavy, fontSize: 13, color: palette.blue },
  error: {
    margin: 16,
    padding: 14,
    backgroundColor: '#FEECEC',
    borderRadius: 14,
  },
  errorText: { color: '#A52424', fontFamily: type.medium, fontSize: 13 },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    gap: 12,
  },
});
