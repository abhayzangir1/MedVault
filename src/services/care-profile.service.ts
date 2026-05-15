import { supabase } from '@/lib/supabase';
import { canAddFamilyMember } from '@/lib/subscription';
import type { CareProfile, CareProfileInput, FamilyProfile, Profile } from '@/types';

const careProfileFields =
  'id, owner_user_id, kind, relationship, full_name, date_of_birth, blood_type, gender, avatar_url, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_id_enabled, emergency_id_token, is_active, created_at';

function toSelfCareProfile(profile: Profile): CareProfile {
  return {
    id: profile.id,
    owner_user_id: profile.id,
    kind: 'self',
    relationship: 'self',
    full_name: profile.full_name ?? 'Self',
    date_of_birth: profile.date_of_birth,
    blood_type: profile.blood_type,
    gender: profile.gender,
    avatar_url: profile.avatar_url,
    allergies: profile.allergies ?? [],
    chronic_conditions: profile.chronic_conditions ?? [],
    emergency_contact_name: profile.emergency_contact_name,
    emergency_contact_phone: profile.emergency_contact_phone,
    emergency_contact_relation: profile.emergency_contact_relation,
    emergency_id_enabled: profile.emergency_id_enabled,
    emergency_id_token: profile.emergency_id_token,
    is_active: true,
    created_at: profile.created_at
  };
}

function toFamilyCareProfile(member: FamilyProfile): CareProfile {
  return {
    id: member.id,
    owner_user_id: member.owner_user_id,
    kind: member.kind ?? 'family',
    relationship: member.relationship,
    full_name: member.full_name,
    date_of_birth: member.date_of_birth,
    blood_type: member.blood_type,
    gender: member.gender ?? null,
    avatar_url: member.avatar_url ?? null,
    allergies: member.allergies ?? [],
    chronic_conditions: member.chronic_conditions ?? [],
    emergency_contact_name: member.emergency_contact_name ?? null,
    emergency_contact_phone: member.emergency_contact_phone ?? null,
    emergency_contact_relation: member.emergency_contact_relation ?? null,
    emergency_id_enabled: member.emergency_id_enabled ?? false,
    emergency_id_token: member.emergency_id_token ?? null,
    is_active: member.is_active,
    created_at: member.created_at
  };
}

function isCareProfilesTableUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('care_profiles') || message.includes('schema cache') || message.includes('relation');
}

function normalizeArray(value?: string[] | null) {
  return value?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function toCareProfileInsert(userId: string, input: CareProfileInput) {
  return {
    owner_user_id: userId,
    kind: 'family',
    relationship: input.relationship,
    full_name: input.full_name.trim(),
    date_of_birth: input.date_of_birth || null,
    blood_type: input.blood_type ?? 'Unknown',
    gender: input.gender || null,
    allergies: normalizeArray(input.allergies),
    chronic_conditions: normalizeArray(input.chronic_conditions),
    emergency_contact_name: input.emergency_contact_name || null,
    emergency_contact_phone: input.emergency_contact_phone || null,
    emergency_contact_relation: input.emergency_contact_relation || null,
    is_active: true
  };
}

export const careProfileService = {
  async getCareProfiles(userId: string, accountProfile: Profile): Promise<CareProfile[]> {
    const { data, error } = await supabase
      .from('care_profiles')
      .select(careProfileFields)
      .eq('owner_user_id', userId)
      .eq('is_active', true)
      .order('kind', { ascending: false })
      .order('full_name', { ascending: true });

    if (!error) {
      const careProfiles = (data ?? []) as CareProfile[];
      if (careProfiles.length > 0) return careProfiles;
    }

    return this.getLegacyCareProfiles(userId, accountProfile);
  },

  async getLegacyCareProfiles(userId: string, accountProfile: Profile): Promise<CareProfile[]> {
    const { data, error } = await supabase
      .from('family_profiles')
      .select('id, owner_user_id, relationship, full_name, date_of_birth, blood_type, is_active, created_at')
      .eq('owner_user_id', userId)
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;

    const selfProfile = toSelfCareProfile(accountProfile);
    const familyCareProfiles = ((data ?? []) as FamilyProfile[]).map(toFamilyCareProfile);
    return [selfProfile, ...familyCareProfiles];
  },

  async createFamilyCareProfile(
    userId: string,
    accountProfile: Profile,
    currentFamilyCount: number,
    input: CareProfileInput
  ): Promise<CareProfile> {
    const gate = canAddFamilyMember(accountProfile, currentFamilyCount);
    if (!gate.allowed) throw new Error(gate.reason ?? 'Care profile limit reached.');

    const insert = toCareProfileInsert(userId, input);
    const { data, error } = await supabase
      .from('care_profiles')
      .insert(insert)
      .select(careProfileFields)
      .single();

    if (!error) return data as CareProfile;
    if (!isCareProfilesTableUnavailable(error)) throw error;

    const { data: legacyData, error: legacyError } = await supabase
      .from('family_profiles')
      .insert({
        owner_user_id: userId,
        relationship: input.relationship,
        full_name: input.full_name.trim(),
        date_of_birth: input.date_of_birth || null,
        blood_type: input.blood_type ?? 'Unknown',
        is_active: true
      })
      .select('id, owner_user_id, relationship, full_name, date_of_birth, blood_type, is_active, created_at')
      .single();

    if (legacyError) throw legacyError;
    return toFamilyCareProfile(legacyData as FamilyProfile);
  },

  async updateCareProfile(
    userId: string,
    accountProfile: Profile,
    careProfileId: string,
    input: CareProfileInput
  ): Promise<void> {
    const update = {
      relationship: input.relationship,
      full_name: input.full_name.trim(),
      date_of_birth: input.date_of_birth || null,
      blood_type: input.blood_type ?? 'Unknown',
      gender: input.gender || null,
      allergies: normalizeArray(input.allergies),
      chronic_conditions: normalizeArray(input.chronic_conditions),
      emergency_contact_name: input.emergency_contact_name || null,
      emergency_contact_phone: input.emergency_contact_phone || null,
      emergency_contact_relation: input.emergency_contact_relation || null
    };

    if (this.isSelfCareProfile(accountProfile, careProfileId)) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: update.full_name,
          date_of_birth: update.date_of_birth,
          blood_type: update.blood_type,
          gender: update.gender,
          allergies: update.allergies,
          chronic_conditions: update.chronic_conditions,
          emergency_contact_name: update.emergency_contact_name,
          emergency_contact_phone: update.emergency_contact_phone,
          emergency_contact_relation: update.emergency_contact_relation
        })
        .eq('id', userId);

      if (error) throw error;

      await supabase
        .from('care_profiles')
        .update({ ...update, relationship: 'self', kind: 'self' })
        .eq('id', careProfileId)
        .eq('owner_user_id', userId);
      return;
    }

    const { error } = await supabase
      .from('care_profiles')
      .update(update)
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);

    if (!error) return;
    if (!isCareProfilesTableUnavailable(error)) throw error;

    const { error: legacyError } = await supabase
      .from('family_profiles')
      .update({
        relationship: update.relationship,
        full_name: update.full_name,
        date_of_birth: update.date_of_birth,
        blood_type: update.blood_type
      })
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);

    if (legacyError) throw legacyError;
  },

  async deactivateCareProfile(userId: string, accountProfile: Profile, careProfileId: string): Promise<void> {
    if (this.isSelfCareProfile(accountProfile, careProfileId)) {
      throw new Error('The account owner profile cannot be deactivated.');
    }

    const { error } = await supabase
      .from('care_profiles')
      .update({ is_active: false })
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);

    if (!error) return;
    if (!isCareProfilesTableUnavailable(error)) throw error;

    const { error: legacyError } = await supabase
      .from('family_profiles')
      .update({ is_active: false })
      .eq('id', careProfileId)
      .eq('owner_user_id', userId);

    if (legacyError) throw legacyError;
  },

  getSelfCareProfileId(accountProfile: Profile | null) {
    return accountProfile?.id ?? null;
  },

  isSelfCareProfile(accountProfile: Profile | null, careProfileId: string | null) {
    return !!accountProfile?.id && accountProfile.id === careProfileId;
  },

  toLegacyProfileId(accountProfile: Profile | null, careProfileId: string | null) {
    if (!careProfileId || this.isSelfCareProfile(accountProfile, careProfileId)) return null;
    return careProfileId;
  }
};
