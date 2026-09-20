import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPaymentErrorMessage } from '../lib/payment-errors.ts';

test('plain Supabase errors retain their message, and policy errors do not blame payment', () => {
  assert.equal(getPaymentErrorMessage({ message: 'Réservation déjà enregistrée' }, true), 'Réservation déjà enregistrée');
  assert.match(getPaymentErrorMessage({ code: '42P17', message: 'infinite recursion' }, true), /commande.*enregistrée/);
  assert.equal(getPaymentErrorMessage(new Error('Session expirée'), false), 'Session expirée');
  assert.match(getPaymentErrorMessage(null, true), /cagnotte/);
  assert.match(getPaymentErrorMessage({}, false), /initialisation du paiement/);
});
