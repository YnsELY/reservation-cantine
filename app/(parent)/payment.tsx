import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { ArrowLeft, X, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';
import { payzoneService } from '@/lib/payzone';

type PaymentStatus = 'loading' | 'ready' | 'processing' | 'success' | 'failure' | 'cancelled' | 'error';

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    paywallUrl: string;
    payload: string;
    signature: string;
    orderId: string;
  }>();

  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [webViewHtml, setWebViewHtml] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = () => {
    try {
      if (!params.paywallUrl || !params.payload || !params.signature) {
        setStatus('error');
        setErrorMessage('Paramètres de paiement manquants');
        return;
      }

      // Générer le HTML pour le POST vers PayZone
      const html = payzoneService.generatePaywallHtml(
        params.paywallUrl,
        params.payload,
        params.signature
      );

      setWebViewHtml(html);
      setStatus('ready');
    } catch (error) {
      console.error('Error initializing payment:', error);
      setStatus('error');
      setErrorMessage('Erreur lors de l\'initialisation du paiement');
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const { url } = navState;

    // Détecter uniquement les URLs de retour de NOTRE app (pas les URLs 3DS bancaires)
    const isOurUrl = url.includes('childrens-kitchen.netlify.app') || url.includes('localhost');
    if (!isOurUrl) return;

    if (url.includes('/payment-success')) {
      setStatus('success');
      checkPaymentConfirmation();
    } else if (url.includes('/payment-failure')) {
      setStatus('failure');
      setErrorMessage('Le paiement a été refusé');
    } else if (url.includes('/payment-cancel')) {
      setStatus('cancelled');
      setErrorMessage('Paiement annulé');
    }
  };

  const checkPaymentConfirmation = async () => {
    if (!params.orderId) return;

    try {
      // Attendre la confirmation du callback (max 30 secondes)
      const payment = await payzoneService.waitForPaymentConfirmation(
        params.orderId,
        30000,
        2000
      );

      if (payment) {
        if (payment.status === 'completed') {
          // Rediriger vers la page de récapitulatif de commande
          router.replace({
            pathname: '/(parent)/order-summary',
            params: { orderId: params.orderId },
          });
        } else if (payment.status === 'failed') {
          setStatus('failure');
          setErrorMessage(payment.failure_reason || 'Le paiement a échoué');
        }
      }
    } catch (error) {
      console.error('Error checking payment:', error);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Annuler le paiement',
      'Êtes-vous sûr de vouloir annuler le paiement ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const handleRetry = () => {
    setStatus('loading');
    setErrorMessage('');
    initializePayment();
  };

  const handleGoToHistory = () => {
    router.replace('/(parent)/history');
  };

  const handleGoBack = () => {
    router.back();
  };

  // Écran de chargement
  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Préparation du paiement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Écran de succès
  if (status === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.successIcon}>
            <CheckCircle size={80} color="#10B981" />
          </View>
          <Text style={styles.resultTitle}>Paiement réussi !</Text>
          <Text style={styles.resultText}>
            Votre commande a été confirmée. Vous pouvez retrouver vos réservations dans l'historique.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoToHistory}>
            <Text style={styles.primaryButtonText}>Voir mes réservations</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
            <Text style={styles.secondaryButtonText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Écran d'échec
  if (status === 'failure') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.failureIcon}>
            <XCircle size={80} color="#EF4444" />
          </View>
          <Text style={styles.resultTitle}>Paiement refusé</Text>
          <Text style={styles.resultText}>
            {errorMessage || 'Le paiement n\'a pas pu être effectué. Veuillez vérifier vos informations de carte et réessayer.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <RefreshCw size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
            <Text style={styles.secondaryButtonText}>Retour au panier</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Écran d'annulation
  if (status === 'cancelled') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.cancelIcon}>
            <AlertCircle size={80} color="#F59E0B" />
          </View>
          <Text style={styles.resultTitle}>Paiement annulé</Text>
          <Text style={styles.resultText}>
            Vous avez annulé le paiement. Vos articles sont toujours dans votre panier.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoBack}>
            <Text style={styles.primaryButtonText}>Retour au panier</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Écran d'erreur
  if (status === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.failureIcon}>
            <XCircle size={80} color="#EF4444" />
          </View>
          <Text style={styles.resultTitle}>Erreur</Text>
          <Text style={styles.resultText}>
            {errorMessage || 'Une erreur est survenue lors du paiement.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <RefreshCw size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
            <Text style={styles.secondaryButtonText}>Retour au panier</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // WebView pour le paiement PayZone
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <X size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paiement sécurisé</Text>
        <View style={styles.headerSpacer} />
      </View>

      {Platform.OS === 'web' ? (
        // Pour le web, utiliser une iframe ou rediriger
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackText}>
            Vous allez être redirigé vers la page de paiement sécurisée PayZone.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              // Créer un formulaire et le soumettre
              const form = document.createElement('form');
              form.method = 'POST';
              form.action = params.paywallUrl || '';

              const payloadInput = document.createElement('input');
              payloadInput.type = 'hidden';
              payloadInput.name = 'payload';
              payloadInput.value = params.payload || '';
              form.appendChild(payloadInput);

              const signatureInput = document.createElement('input');
              signatureInput.type = 'hidden';
              signatureInput.name = 'signature';
              signatureInput.value = params.signature || '';
              form.appendChild(signatureInput);

              document.body.appendChild(form);
              form.submit();
            }}
          >
            <Text style={styles.primaryButtonText}>Procéder au paiement</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: webViewHtml }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={true}
          mixedContentMode="compatibility"
          originWhitelist={['*']}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={styles.loadingText}>Chargement...</Text>
            </View>
          )}
          onError={(error) => {
            console.error('WebView error:', error);
            setStatus('error');
            setErrorMessage('Erreur de connexion à la page de paiement');
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 40,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    marginBottom: 24,
  },
  failureIcon: {
    marginBottom: 24,
  },
  cancelIcon: {
    marginBottom: 24,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  resultText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  webFallbackText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
});
