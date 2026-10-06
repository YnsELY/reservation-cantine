import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Check, Clock } from 'lucide-react-native';

export function OrderDeadlineCard({ deadlineMs, label, missing, onExpire }: {
  deadlineMs: number; label: string;
  missing: { id: string; first_name: string; last_name: string }[];
  onExpire?: () => void;
}) {
  if (!missing.length) return (
    <View style={styles.complete}>
      <Check size={22} color="#227454" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.completeTitle}>Tout est commandé pour {label}</Text>
        <Text style={styles.completeHint}>Tout est prêt pour vos enfants.</Text>
      </View>
    </View>
  );
  return (
    <View style={styles.card} testID="order-deadline-card">
      <Text style={styles.title}>{label === "aujourd'hui" ? 'Les repas d’aujourd’hui' : `Les repas de ${label}`}</Text>
      <OrderCountdown deadlineMs={deadlineMs} onExpire={onExpire} />
      <View style={styles.missing}>
        <Text style={styles.missingLabel}>Encore à réserver pour</Text>
        <View style={styles.chips}>
          {missing.map(child => <View style={styles.chip} key={child.id}>
            <Text style={styles.chipText}>{child.first_name} {child.last_name}</Text>
          </View>)}
        </View>
      </View>
    </View>
  );
}

/** Uses the existing server-aligned deadline; returning to the app refreshes it. */
export function OrderCountdown({ deadlineMs, onExpire }: { deadlineMs: number; onExpire?: () => void }) {
  const [now, setNow] = useState(Date.now);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const { width, fontScale } = useWindowDimensions();

  useEffect(() => {
    let expired = false;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= deadlineMs && !expired) {
        expired = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [deadlineMs]);

  const seconds = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const urgent = seconds > 0 && seconds <= 3600;
  const compact = width < 370 || fontScale > 1.3;
  const units = [[hours, 'HEURES'], [minutes, 'MINUTES'], [seconds % 60, 'SECONDES']] as const;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Clock size={17} color="#FFFFFF" />
        <Text style={styles.eyebrow}>{seconds === 0 ? 'COMMANDES CLÔTURÉES' : urgent ? 'DERNIÈRE HEURE POUR COMMANDER' : 'TEMPS RESTANT POUR COMMANDER'}</Text>
      </View>
      <View accessible accessibilityLabel={`${hours} heures, ${minutes} minutes et ${seconds % 60} secondes restantes`} style={styles.digits}>
        {units.map(([value, label], index) => (
          <View key={label} style={styles.unitGroup}>
            {index > 0 && <Text accessible={false} style={[styles.separator, compact && styles.separatorCompact]}>:</Text>}
            <View style={styles.unit}>
              <Text accessible={false} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={[styles.number, compact && styles.numberCompact]}>{String(value).padStart(2, '0')}</Text>
              <Text accessible={false} style={styles.unitLabel}>{label}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.deadline}>Clôture à 7 h · heure du Maroc</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0E5FC0', borderRadius: 22, padding: 20, gap: 16, marginTop: 4, shadowColor: '#0E5FC0', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  title: { fontFamily: 'ManropeExtraBold', fontWeight: '800', fontSize: 24, lineHeight: 30, color: '#FFFFFF', letterSpacing: -0.5 },
  missing: { paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', gap: 9 },
  missingLabel: { fontFamily: 'ManropeSemiBold', fontSize: 12, color: '#DCEBFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 11 },
  chipText: { fontFamily: 'ManropeBold', fontSize: 12, color: '#0B4A98' },
  complete: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDF7F1', borderRadius: 18, padding: 18, gap: 12 },
  completeTitle: { fontFamily: 'ManropeBold', fontSize: 15, color: '#227454' },
  completeHint: { fontFamily: 'Manrope', fontSize: 13, color: '#456B59' },
  wrap: { gap: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flex: 1, fontFamily: 'ManropeBold', fontWeight: '700', fontSize: 10, letterSpacing: 1.1, lineHeight: 16, color: '#FFFFFF' },
  digits: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  unitGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  unit: { flex: 1, minWidth: 0, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 4 },
  number: { fontFamily: 'ManropeExtraBold', fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: 46, lineHeight: 56, letterSpacing: -1.5, color: '#FFFFFF' },
  numberCompact: { fontSize: 36, lineHeight: 46 },
  separator: { fontFamily: 'ManropeBold', fontSize: 28, color: '#BAD8FF', marginHorizontal: 7, marginBottom: 16 },
  separatorCompact: { marginHorizontal: 4, fontSize: 22 },
  unitLabel: { fontFamily: 'ManropeBold', fontSize: 8, letterSpacing: 0.8, color: '#DCEBFF' },
  deadline: { fontFamily: 'ManropeSemiBold', fontSize: 12, color: '#DCEBFF', textAlign: 'center' },
});
