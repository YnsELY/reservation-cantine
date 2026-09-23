import { supabase, School } from './supabase';

export async function joinSchoolByCode(code: string, role: 'parent' | 'provider'): Promise<School> {
  const { data, error } = await supabase.rpc('join_school_by_code', { p_code: code.trim(), p_role: role });
  if (error) throw error;
  if (data?.error || !data?.school) throw new Error(data?.error || 'École indisponible.');
  return data.school as School;
}
