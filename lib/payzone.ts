// Service PayZone pour l'intégration du paiement
// Ce fichier gère les interactions entre l'app et les Edge Functions Supabase

import { supabase } from './supabase';
import Constants from 'expo-constants';

// URL de base des Edge Functions Supabase
const SUPABASE_FUNCTIONS_URL = Constants.expoConfig?.extra?.supabaseUrl
  ? `${Constants.expoConfig.extra.supabaseUrl}/functions/v1`
  : process.env.EXPO_PUBLIC_SUPABASE_URL
    ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
    : '';

export interface CartItemForPayment {
  id: string;
  child_id: string;
  menu_id: string;
  date: string;
  supplements: any[];
  annotations: string | null;
  total_price: number;
  child: { first_name: string; last_name: string };
  menu: { meal_name: string };
}

export interface PaymentInitResponse {
  success: boolean;
  paywallUrl?: string;
  payload?: string;
  signature?: string;
  orderId?: string;
  error?: string;
}

export interface PendingPayment {
  id: string;
  order_id: string;
  charge_id: string;
  parent_id: string;
  cart_items: CartItemForPayment[];
  total_amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'expired';
  payzone_transaction_id: string | null;
  payzone_status: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
}

class PayzoneService {
  /**
   * Initialise un paiement PayZone
   * Appelle l'Edge Function qui génère le payload signé
   */
  async initializePayment(
    parentId: string,
    cartItems: CartItemForPayment[],
    totalAmount: number,
    customerEmail?: string,
    customerName?: string
  ): Promise<PaymentInitResponse> {
    try {
      // Récupérer le token d'authentification
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Non authentifié');
      }

      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/payzone-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          parentId,
          cartItems,
          totalAmount,
          customerEmail,
          customerName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de l\'initialisation du paiement');
      }

      const data: PaymentInitResponse = await response.json();
      return data;

    } catch (error) {
      console.error('PayZone init error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Vérifie le statut d'un paiement en attente
   */
  async checkPaymentStatus(orderId: string): Promise<PendingPayment | null> {
    try {
      const { data, error } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (error) {
        console.error('Error checking payment status:', error);
        return null;
      }

      return data as PendingPayment;
    } catch (error) {
      console.error('Error checking payment status:', error);
      return null;
    }
  }

  /**
   * Attend que le paiement soit confirmé ou échoue
   * Utilise un polling avec timeout
   */
  async waitForPaymentConfirmation(
    orderId: string,
    maxWaitMs: number = 120000, // 2 minutes par défaut
    pollIntervalMs: number = 2000 // Vérifier toutes les 2 secondes
  ): Promise<PendingPayment | null> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkStatus = async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= maxWaitMs) {
          resolve(null);
          return;
        }

        const payment = await this.checkPaymentStatus(orderId);

        if (payment && payment.status !== 'pending') {
          resolve(payment);
          return;
        }

        // Continuer à vérifier
        setTimeout(checkStatus, pollIntervalMs);
      };

      checkStatus();
    });
  }

  /**
   * Génère le HTML pour le formulaire POST vers PayZone
   * À utiliser dans une WebView
   */
  generatePaywallHtml(paywallUrl: string, payload: string, signature: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Paiement en cours...</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #F9FAFB;
          }
          .loader {
            text-align: center;
          }
          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #E5E7EB;
            border-top: 4px solid #4F46E5;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          p {
            color: #6B7280;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="loader">
          <div class="spinner"></div>
          <p>Redirection vers la page de paiement...</p>
        </div>
        <form id="payzoneForm" action="${paywallUrl}" method="POST" style="display:none;">
          <input type="hidden" name="payload" value='${payload.replace(/'/g, "&#39;")}' />
          <input type="hidden" name="signature" value="${signature}" />
        </form>
        <script>
          document.getElementById('payzoneForm').submit();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Récupère les paiements en attente d'un parent
   */
  async getPendingPayments(parentId: string): Promise<PendingPayment[]> {
    try {
      const { data, error } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('parent_id', parentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending payments:', error);
        return [];
      }

      return data as PendingPayment[];
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      return [];
    }
  }

  /**
   * Récupère l'historique des paiements d'un parent
   */
  async getPaymentHistory(parentId: string): Promise<PendingPayment[]> {
    try {
      const { data, error } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching payment history:', error);
        return [];
      }

      return data as PendingPayment[];
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }
}

export const payzoneService = new PayzoneService();
