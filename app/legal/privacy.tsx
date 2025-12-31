import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confidentialité</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Politique de confidentialité</Text>
        <Text style={styles.pageSubtitle}>Application Children's Kitchen</Text>
        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Collecte des données personnelles</Text>
          <Text style={styles.paragraph}>
            Dans le cadre de l'utilisation de l'application Children's Kitchen, les données suivantes peuvent être collectées :
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• nom et prénom,</Text>
            <Text style={styles.bulletItem}>• coordonnées (email, numéro de téléphone),</Text>
            <Text style={styles.bulletItem}>• informations relatives aux réservations de repas,</Text>
            <Text style={styles.bulletItem}>• données de paiement traitées par un prestataire externe.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Utilisation des données</Text>
          <Text style={styles.paragraph}>Les données collectées sont utilisées exclusivement pour :</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• la gestion des réservations et des paiements,</Text>
            <Text style={styles.bulletItem}>• la communication avec les utilisateurs,</Text>
            <Text style={styles.bulletItem}>• le respect des obligations légales et réglementaires.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Paiement sécurisé</Text>
          <Text style={styles.paragraph}>
            Les paiements sont traités par la plateforme sécurisée Payzone. CHILDREN'S KITCHEN ne conserve aucune donnée bancaire.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Conservation des données</Text>
          <Text style={styles.paragraph}>
            Les données personnelles sont conservées pendant la durée strictement nécessaire à la réalisation des finalités pour lesquelles elles ont été collectées, conformément à la législation en vigueur.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Droits des utilisateurs</Text>
          <Text style={styles.paragraph}>Les utilisateurs disposent d'un droit :</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• d'accès à leurs données,</Text>
            <Text style={styles.bulletItem}>• de rectification,</Text>
            <Text style={styles.bulletItem}>• de suppression.</Text>
          </View>
          <Text style={styles.paragraph}>
            Toute demande peut être adressée à l'adresse suivante : kitchenschool60@gmail.com
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Sécurité des données</Text>
          <Text style={styles.paragraph}>
            CHILDREN'S KITCHEN met en œuvre toutes les mesures techniques et organisationnelles nécessaires afin de garantir la sécurité et la confidentialité des données personnelles.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Droit applicable</Text>
          <Text style={styles.paragraph}>La présente politique de confidentialité est régie par le droit marocain.</Text>
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
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 8,
  },
  bulletList: {
    paddingLeft: 10,
    marginBottom: 8,
  },
  bulletItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 6,
  },
});
