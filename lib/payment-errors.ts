/** Supabase errors can be plain objects rather than Error instances. */
export function getPaymentErrorMessage(error: unknown, paidWithCredits: boolean): string {
  const fallback = paidWithCredits
    ? 'Impossible de valider la commande avec la cagnotte. Veuillez réessayer.'
    : "Erreur lors de l'initialisation du paiement";

  if (error && typeof error === 'object' && 'message' in error &&
      typeof error.message === 'string' && error.message.trim()) {
    // A database policy failure is an application issue, not a card refusal.
    if ('code' in error && error.code === '42P17') {
      return 'La commande ne peut pas être enregistrée pour le moment. Veuillez contacter le support.';
    }
    return error.message;
  }
  return fallback;
}
