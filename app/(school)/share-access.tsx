import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard } from '@/lib/clipboard';
import { ArrowLeft, Key, Share2, Copy } from 'lucide-react-native';

export default function ShareAccessScreen() {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);
    } catch (err) {
      console.error('Error loading school:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!school?.access_code) return;

    try {
      await copyToClipboard(school.access_code);
      Alert.alert('Succès', 'Code copié dans le presse-papier');
    } catch (err) {
      console.error('Error copying code:', err);
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  };

  const handleShareCode = async () => {
    if (!school?.access_code) return;

    const message = `Code d'accès pour ${school.name}: ${school.access_code}\n\nUtilisez ce code pour affilier votre compte parent à notre école dans l'application de réservation de repas.`;

    try {
      await Share.share({
        message,
      });
    } catch (err) {
      console.error('Error sharing:', err);
    }
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
          <Text style={styles.badgeText}>Partager l'accès</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoCard}>
          <Key size={48} color="#4F46E5" />
          <Text style={styles.infoTitle}>Code d'accès école</Text>
          <Text style={styles.infoText}>
            Partagez ce code avec les parents pour qu'ils puissent affilier leur compte à votre école
          </Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Code d'accès</Text>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{school?.access_code}</Text>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCopyCode}>
            <View style={styles.actionIconContainer}>
              <Copy size={24} color="#4F46E5" />
            </View>
            <Text style={styles.actionButtonText}>Copier le code</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShareCode}>
            <View style={styles.actionIconContainer}>
              <Share2 size={24} color="#4F46E5" />
            </View>
            <Text style={styles.actionButtonText}>Partager le code</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Instructions pour les parents</Text>
          <Text style={styles.instructionsText}>
            1. Téléchargez l'application de réservation de repas
          </Text>
          <Text style={styles.instructionsText}>
            2. Lors de l'inscription, utilisez le code d'accès fourni
          </Text>
          <Text style={styles.instructionsText}>
            3. Ajoutez les informations de votre enfant
          </Text>
          <Text style={styles.instructionsText}>
            4. Commencez à réserver des repas
          </Text>
        </View>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#EEF2FF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  codeBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4F46E5',
    letterSpacing: 2,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  instructionsCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  instructionsText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 24,
    marginBottom: 8,
  },
});
