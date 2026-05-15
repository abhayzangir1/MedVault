import { supabase } from '@/lib/supabase';
import type { FamilyProfile } from '@/types';

export const familyService = {
  async getFamilyProfiles(userId: string) {
    const { data, error } = await supabase
      .from('family_profiles')
      .select('id, owner_user_id, relationship, full_name, date_of_birth, blood_type, is_active, created_at')
      .eq('owner_user_id', userId)
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return ((data ?? []) as FamilyProfile[]).map((profile) => ({
      ...profile,
      kind: profile.kind ?? 'family',
      gender: profile.gender ?? null,
      avatar_url: profile.avatar_url ?? null,
      allergies: profile.allergies ?? [],
      chronic_conditions: profile.chronic_conditions ?? [],
      emergency_contact_name: profile.emergency_contact_name ?? null,
      emergency_contact_phone: profile.emergency_contact_phone ?? null,
      emergency_contact_relation: profile.emergency_contact_relation ?? null,
      emergency_id_enabled: profile.emergency_id_enabled ?? false,
      emergency_id_token: profile.emergency_id_token ?? null
    })) as FamilyProfile[];
  }
};
