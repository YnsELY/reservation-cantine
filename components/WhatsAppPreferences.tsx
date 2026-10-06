import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { normalizeWhatsAppPhone, type WhatsAppRole } from '@/lib/whatsapp';

export function WhatsAppPreferences({ role, defaultPhone = '' }: { role: WhatsAppRole; defaultPhone?: string | null }) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_whatsapp_preferences', { p_role: role });
        if (!current) return;
        if (error) throw error;
        setPhone(data?.phone || defaultPhone || '');
        setEnabled(data?.enabled === true);
        setAvailable(data?.delivery_available === true);
        setLoadFailed(false);
      } catch { if (current) setLoadFailed(true); }
      finally { if (current) setLoaded(true); }
    })();
    return () => { current = false; };
  }, [role, defaultPhone]);

  const save = async () => {
    const normalized = phone.trim() ? normalizeWhatsAppPhone(phone) : null;
    if ((phone.trim() && !normalized) || (enabled && !normalized)) {
      setNotice('Indiquez un numéro valide : 06… / 07… au Maroc, ou + suivi de l’indicatif du pays.');
      return;
    }
    setSaving(true); setNotice('');
    try {
      const { error } = await supabase.rpc('set_whatsapp_preferences', { p_role: role, p_phone: normalized, p_enabled: enabled });
      if (error) throw error;
      setPhone(normalized || '');
      setNotice(enabled ? available ? 'Préférences enregistrées. Vous recevrez les prochaines confirmations sur WhatsApp.' : 'Préférences enregistrées. Les messages commenceront après l’activation du service.' : 'Préférences enregistrées. Les confirmations WhatsApp sont désactivées.');
    } catch {
      setNotice('Enregistrement impossible. Réessayez dans un instant.');
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}><MessageCircle size={22} color="#0E5FC0" /><Text style={styles.title}>Confirmations WhatsApp</Text></View>
      <Text style={styles.description}>{role === 'provider'
        ? 'Recevez le récapitulatif des commandes payées avec une cagnotte : parent, repas, montant utilisé et solde disponible après l’achat.'
        : 'Après un achat avec votre cagnotte, recevez le récapitulatif et votre solde disponible sur WhatsApp.'}</Text>
      {!loaded ? <ActivityIndicator color="#0E5FC0" /> : loadFailed ? (
        <Text style={styles.notice}>Les réglages WhatsApp sont momentanément indisponibles.</Text>
      ) : <>
        {!available && <Text style={styles.pending}>Service en préparation · Les envois automatiques ne sont pas encore actifs.</Text>}
        <Text style={styles.label}>Votre numéro WhatsApp</Text>
        <TextInput accessibilityLabel="Votre numéro WhatsApp" autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!saving} placeholder="+212 6 12 34 56 78" placeholderTextColor="#68788F" style={styles.input} />
        <View style={styles.row}>
          <Text style={[styles.description, { flex: 1 }]}>J’accepte de recevoir mes confirmations de commande sur WhatsApp.</Text>
          <Switch accessibilityLabel="Recevoir les confirmations sur WhatsApp" value={enabled} onValueChange={setEnabled} disabled={saving} trackColor={{ false: '#CFD8E5', true: '#0E5FC0' }} />
        </View>
        <Text style={styles.help}>Vous pouvez modifier ce choix ici ou répondre STOP sur WhatsApp. Les messages sont envoyés sur WhatsApp uniquement.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={save} style={[styles.button, saving && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Enregistrer</Text>}
        </TouchableOpacity>
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 20, backgroundColor: '#FFFFFF', marginBottom: 24, gap: 13, borderWidth: 1, borderColor: '#E4EAF2' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#142742' },
  description: { fontSize: 14, lineHeight: 21, color: '#465974' },
  pending: { fontSize: 13, lineHeight: 19, color: '#66491C', padding: 12, borderRadius: 12, backgroundColor: '#FFF4DE' },
  label: { color: '#142742', fontSize: 13, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#CFD8E5', paddingHorizontal: 14, fontSize: 16, color: '#142742' },
  help: { fontSize: 12, lineHeight: 18, color: '#68788F' },
  button: { borderRadius: 12, minHeight: 46, backgroundColor: '#0E5FC0', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  notice: { color: '#142742', fontSize: 13, lineHeight: 20 },
});
