import { supabase } from './supabase';

export interface OrderConfirmationEmailItem {
  childFirstName: string;
  childLastName?: string;
  mealName: string;
  date: string;
  totalPrice: number;
  supplements?: ({ name?: string; price?: number } | string)[];
  annotations?: string | null;
}

export async function sendSignupConfirmationEmail() {
  return supabase.functions.invoke('send-transactional-email', {
    body: {
      type: 'signup_confirmation',
    },
  });
}

export async function sendOrderConfirmationEmail(payload: {
  orderId: string;
  totalAmount: number;
  paymentReference?: string | null;
  paidAt?: string;
  items: OrderConfirmationEmailItem[];
}) {
  return supabase.functions.invoke('send-transactional-email', {
    body: {
      type: 'order_confirmation',
      ...payload,
    },
  });
}
