import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, Parent, School, Provider } from './supabase';

const ACCESS_CODE_KEY = 'access_code';
const PARENT_DATA_KEY = 'parent_data';
const SCHOOL_DATA_KEY = 'school_data';
const PROVIDER_DATA_KEY = 'provider_data';
const USER_TYPE_KEY = 'user_type';

export type UserType = 'parent' | 'school' | 'provider';

export const authService = {
  async authenticateWithCode(code: string): Promise<{ success: boolean; parent?: Parent; school?: School; userType?: UserType; error?: string }> {
    try {
      const { data: parentData, error: parentError } = await supabase
        .from('parents')
        .select('*')
        .eq('access_code', code.toUpperCase())
        .maybeSingle();

      if (parentData) {
        await AsyncStorage.setItem(ACCESS_CODE_KEY, code.toUpperCase());
        await AsyncStorage.setItem(PARENT_DATA_KEY, JSON.stringify(parentData));
        await AsyncStorage.setItem(USER_TYPE_KEY, 'parent');

        return { success: true, parent: parentData, userType: 'parent' };
      }

      const { data: schoolData, error: schoolError } = await supabase
        .from('schools')
        .select('*')
        .eq('access_code', code.toUpperCase())
        .eq('is_school_user', true)
        .maybeSingle();

      if (schoolData) {
        await AsyncStorage.setItem(ACCESS_CODE_KEY, code.toUpperCase());
        await AsyncStorage.setItem(SCHOOL_DATA_KEY, JSON.stringify(schoolData));
        await AsyncStorage.setItem(USER_TYPE_KEY, 'school');

        return { success: true, school: schoolData, userType: 'school' };
      }

      return { success: false, error: 'Code invalide' };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Erreur de connexion' };
    }
  },

  async getCurrentAccessCode(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(ACCESS_CODE_KEY);
    } catch {
      return null;
    }
  },

  async getCurrentParent(): Promise<Parent | null> {
    try {
      const parentData = await AsyncStorage.getItem(PARENT_DATA_KEY);
      if (!parentData) return null;

      return JSON.parse(parentData);
    } catch {
      return null;
    }
  },

  async getCurrentSchool(): Promise<School | null> {
    try {
      const schoolData = await AsyncStorage.getItem(SCHOOL_DATA_KEY);
      if (!schoolData) return null;

      return JSON.parse(schoolData);
    } catch {
      return null;
    }
  },

  async getUserType(): Promise<UserType | null> {
    try {
      const userType = await AsyncStorage.getItem(USER_TYPE_KEY);
      return userType as UserType | null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(ACCESS_CODE_KEY);
    await AsyncStorage.removeItem(PARENT_DATA_KEY);
    await AsyncStorage.removeItem(SCHOOL_DATA_KEY);
    await AsyncStorage.removeItem(PROVIDER_DATA_KEY);
    await AsyncStorage.removeItem(USER_TYPE_KEY);
  },

  async signOut(): Promise<void> {
    await this.logout();
  },

  async getCurrentParentFromAuth(): Promise<Parent | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data } = await supabase
        .from('parents')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      return data;
    } catch {
      return null;
    }
  },

  async getCurrentSchoolFromAuth(): Promise<School | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data } = await supabase
        .from('schools')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      return data;
    } catch {
      return null;
    }
  },

  async refreshParentData(): Promise<void> {
    try {
      const code = await this.getCurrentAccessCode();
      if (!code) return;

      const { data } = await supabase
        .from('parents')
        .select('*')
        .eq('access_code', code)
        .maybeSingle();

      if (data) {
        await AsyncStorage.setItem(PARENT_DATA_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error refreshing parent data:', error);
    }
  },

  async refreshSchoolData(): Promise<void> {
    try {
      const code = await this.getCurrentAccessCode();
      if (!code) return;

      const { data } = await supabase
        .from('schools')
        .select('*')
        .eq('access_code', code)
        .maybeSingle();

      if (data) {
        await AsyncStorage.setItem(SCHOOL_DATA_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error refreshing school data:', error);
    }
  },

  async getCurrentProviderFromAuth(): Promise<Provider | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data } = await supabase
        .from('providers')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      return data;
    } catch {
      return null;
    }
  },

  async getCurrentProvider(): Promise<Provider | null> {
    try {
      const providerData = await AsyncStorage.getItem(PROVIDER_DATA_KEY);
      if (!providerData) return null;

      return JSON.parse(providerData);
    } catch {
      return null;
    }
  },

  async setCurrentProvider(provider: Provider): Promise<void> {
    await AsyncStorage.setItem(PROVIDER_DATA_KEY, JSON.stringify(provider));
    await AsyncStorage.setItem(USER_TYPE_KEY, 'provider');
  }
};
