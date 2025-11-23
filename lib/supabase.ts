import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const createSupabaseStorage = () => {
  if (Platform.OS === 'web') {
    return {
      getItem: (key: string) => {
        if (typeof window !== 'undefined') {
          return window.localStorage.getItem(key);
        }
        return null;
      },
      setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
      },
      removeItem: (key: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
      },
    };
  }
  return AsyncStorage;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createSupabaseStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export interface School {
  id: string;
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  access_code: string | null;
  is_school_user: boolean;
  created_at: string;
}

export interface Parent {
  id: string;
  access_code: string;
  email: string | null;
  phone: string | null;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  school_id: string | null;
  created_at: string;
}

export interface Child {
  id: string;
  parent_id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  allergies: string[];
  dietary_restrictions: string[];
  created_at: string;
}

export interface Menu {
  id: string;
  school_id: string;
  date: string;
  meal_name: string;
  description: string | null;
  price: number;
  allergens: string[];
  image_url: string | null;
  available: boolean;
  card_color: string;
  created_at: string;
}

export interface Supplement {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  created_at: string;
}

export interface Reservation {
  id: string;
  child_id: string;
  menu_id: string;
  parent_id: string;
  date: string;
  supplements: string[];
  annotations: string | null;
  total_price: number;
  payment_status: 'pending' | 'paid' | 'cancelled';
  payment_intent_id: string | null;
  created_by_school: boolean;
  school_payment_pending: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  parent_id: string;
  child_id: string;
  menu_id: string;
  date: string;
  supplements: any[];
  annotations: string | null;
  total_price: number;
  created_at: string;
}

export interface Provider {
  id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  user_id: string | null;
  registration_code: string | null;
  email: string | null;
  company_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface SchoolProvider {
  id: string;
  school_id: string;
  provider_id: string;
  active: boolean;
  created_at: string;
}

export interface ProviderSchoolAccess {
  id: string;
  provider_id: string;
  school_id: string;
  granted_at: string;
  granted_by: string | null;
}
