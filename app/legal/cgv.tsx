import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

export default function CgvScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CGV</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Conditions générales de vente</Text>
        <Text style={styles.pageSubtitle}>Application Children's Kitchen</Text>
        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Identification de la société</Text>
          <Text style={styles.paragraph}>Raison sociale : CHILDREN'S KITCHEN</Text>
          <Text style={styles.paragraph}>Forme juridique : SARL Associé Unique</Text>
          <Text style={styles.paragraph}>Siège social : Apt 15 Imb 12 Lot Sidi Ali Mellah, Ait Melloul, Marrakech, Maroc</Text>
          <Text style={styles.paragraph}>Registre de commerce : RC n° 74339</Text>
          <Text style={styles.paragraph}>ICE : 002565498000016</Text>
          <Text style={styles.paragraph}>Responsable légal : Toumi Taiki</Text>
          <Text style={styles.paragraph}>Email de contact : kitchenschool60@gmail.com</Text>
          <Text style={styles.paragraph}>Téléphone : 07 06 06 11 55</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Objet</Text>
          <Text style={styles.paragraph}>
            Les présentes Conditions Générales de Vente ont pour objet de définir les modalités de réservation, de paiement et de fourniture des repas scolaires proposés via l'application mobile Children's Kitchen.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Description du service</Text>
          <Text style={styles.paragraph}>L'application Children's Kitchen permet aux utilisateurs de :</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• consulter les menus proposés,</Text>
            <Text style={styles.bulletItem}>• réserver des repas scolaires,</Text>
            <Text style={styles.bulletItem}>• payer en ligne les repas réservés.</Text>
          </View>
          <Text style={styles.paragraph}>
            Les services sont destinés aux élèves, à leurs représentants légaux et aux établissements scolaires partenaires.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Prix</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Les prix sont indiqués en dirhams marocains (MAD), toutes taxes comprises.</Text>
            <Text style={styles.bulletItem}>• Le prix moyen d'un repas est de 45 DH.</Text>
            <Text style={styles.bulletItem}>• Le prix applicable est celui affiché au moment de la validation de la commande.</Text>
            <Text style={styles.bulletItem}>• CHILDREN'S KITCHEN se réserve le droit de modifier les prix à tout moment, sans effet rétroactif.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Modalités de paiement</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Le paiement est exigible immédiatement lors de la réservation.</Text>
            <Text style={styles.bulletItem}>• Le paiement s'effectue exclusivement en ligne via la plateforme sécurisée Payzone.</Text>
            <Text style={styles.bulletItem}>• CHILDREN'S KITCHEN ne stocke aucune donnée bancaire.</Text>
            <Text style={styles.bulletItem}>• Toute commande validée et payée est considérée comme ferme.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Livraison / Exécution du service</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Les repas sont préparés et livrés au sein des établissements scolaires partenaires.</Text>
            <Text style={styles.bulletItem}>• La livraison est effectuée à la date choisie lors de la réservation.</Text>
            <Text style={styles.bulletItem}>• En cas d'absence de l'élève non signalée dans les délais, le repas est considéré comme livré.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Politique d'annulation</Text>
          <Text style={styles.paragraph}>
            Toute réservation peut être annulée sans frais jusqu'à 20h00 la veille du jour de la livraison du repas.
          </Text>
          <Text style={styles.paragraph}>Passé ce délai :</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• aucune annulation ne sera acceptée,</Text>
            <Text style={styles.bulletItem}>• aucun remboursement ne pourra être effectué,</Text>
          </View>
          <Text style={styles.paragraph}>le repas étant considéré comme engagé en production.</Text>
          <Text style={styles.paragraph}>
            Les annulations doivent être effectuées via l'application Children's Kitchen ou selon les modalités définies par l'établissement scolaire partenaire.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Remboursement</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Toute annulation effectuée dans le délai autorisé donne lieu à un remboursement intégral.</Text>
            <Text style={styles.bulletItem}>• Aucun remboursement ne sera accordé pour les annulations hors délai ou les absences non signalées.</Text>
            <Text style={styles.bulletItem}>• En cas d'annulation imputable à CHILDREN'S KITCHEN, le remboursement sera effectué selon le moyen de paiement utilisé.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Responsabilité</Text>
          <Text style={styles.paragraph}>
            CHILDREN'S KITCHEN s'engage à fournir un service conforme aux normes d'hygiène et de sécurité en vigueur.
          </Text>
          <Text style={styles.paragraph}>
            La responsabilité de la société ne saurait être engagée en cas de force majeure ou de fait imputable à l'utilisateur ou à l'établissement scolaire partenaire.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Données personnelles</Text>
          <Text style={styles.paragraph}>
            Les données personnelles collectées sont traitées conformément à la réglementation en vigueur et à la politique de confidentialité disponible dans l'application.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Droit applicable et litiges</Text>
          <Text style={styles.paragraph}>Les présentes Conditions Générales de Vente sont soumises au droit marocain.</Text>
          <Text style={styles.paragraph}>Tout litige relève de la compétence exclusive des tribunaux marocains.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mentions légales</Text>
          <Text style={styles.paragraph}>Application Children's Kitchen</Text>
          <Text style={styles.paragraph}>Éditeur de l'application : CHILDREN'S KITCHEN, SARL Associé Unique</Text>
          <Text style={styles.paragraph}>Siège social : Apt 15 Imb 12 Lot Sidi Ali Mellah, Ait Melloul, Marrakech, Maroc</Text>
          <Text style={styles.paragraph}>Registre de commerce : RC n° 74339</Text>
          <Text style={styles.paragraph}>ICE : 002565498000016</Text>
          <Text style={styles.paragraph}>Responsable légal : Toumi Taiki</Text>
          <Text style={styles.paragraph}>Contact : kitchenschool60@gmail.com - 07 06 06 11 55</Text>
          <Text style={styles.paragraph}>
            Hébergement : L'application Children's Kitchen est hébergée sur des serveurs sécurisés répondant aux standards de sécurité et de fiabilité en vigueur.
          </Text>
          <Text style={styles.paragraph}>
            Propriété intellectuelle : L'ensemble des contenus présents dans l'application (textes, visuels, logos, interfaces, fonctionnalités) est la propriété exclusive de CHILDREN'S KITCHEN. Toute reproduction, représentation ou exploitation non autorisée est strictement interdite.
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
