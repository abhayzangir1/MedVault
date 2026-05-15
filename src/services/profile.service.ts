import { supabase } from '@/lib/supabase';
import type { Profile, ProfileSettingsInput } from '@/types';

const defaultProfileFields =
  'id, full_name, date_of_birth, blood_type, gender, country, avatar_url, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_id_enabled, emergency_id_token, ai_interpretations_used, ai_quota_reset_at, plan, billing_region, billing_provider, google_play_subscription_id, google_play_purchase_token, google_play_order_id, subscription_product_id, subscription_checked_at, razorpay_subscription_id, subscription_status, created_at';

function normalizeArray(value?: string[] | null) {
  return value?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function safeProfileUpdate(updates: Partial<Profile>) {
  const {
    full_name,
    date_of_birth,
    blood_type,
    gender,
    country,
    avatar_url,
    allergies,
    chronic_conditions,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    emergency_id_enabled,
    emergency_id_token
  } = updates;

  return {
    ...(full_name !== undefined ? { full_name } : {}),
    ...(date_of_birth !== undefined ? { date_of_birth } : {}),
    ...(blood_type !== undefined ? { blood_type } : {}),
    ...(gender !== undefined ? { gender } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(avatar_url !== undefined ? { avatar_url } : {}),
    ...(allergies !== undefined ? { allergies } : {}),
    ...(chronic_conditions !== undefined ? { chronic_conditions } : {}),
    ...(emergency_contact_name !== undefined ? { emergency_contact_name } : {}),
    ...(emergency_contact_phone !== undefined ? { emergency_contact_phone } : {}),
    ...(emergency_contact_relation !== undefined ? { emergency_contact_relation } : {}),
    ...(emergency_id_enabled !== undefined ? { emergency_id_enabled } : {}),
    ...(emergency_id_token !== undefined ? { emergency_id_token } : {})
  };
}

export const profileService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select(defaultProfileFields)
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(safeProfileUpdate(updates))
      .eq('id', userId)
      .select(defaultProfileFields)
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async updateProfileSettings(userId: string, input: ProfileSettingsInput) {
    const payload = {
      full_name: input.full_name.trim(),
      date_of_birth: input.date_of_birth || null,
      blood_type: input.blood_type ?? 'Unknown',
      gender: input.gender?.trim() || null,
      country: input.country?.trim() || 'IN',
      allergies: normalizeArray(input.allergies),
      chronic_conditions: normalizeArray(input.chronic_conditions),
      emergency_contact_name: input.emergency_contact_name?.trim() || null,
      emergency_contact_phone: input.emergency_contact_phone?.trim() || null,
      emergency_contact_relation: input.emergency_contact_relation?.trim() || null
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select(defaultProfileFields)
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async requestAccountDeletion(userId: string, reason?: string) {
    const { error } = await supabase
      .from('account_deletion_requests')
      .insert({
        user_id: userId,
        reason: reason?.trim() || null,
        status: 'requested'
      });

    if (error) throw error;
  },

  async deleteAccount(reason?: string) {
    const { data, error } = await supabase.functions.invoke<{ deleted: boolean }>('delete-account', {
      body: {
        confirmation: 'DELETE',
        reason: reason?.trim() || null
      }
    });

    if (error) throw error;
    if (!data?.deleted) throw new Error('Account deletion was not completed.');
    return data;
  }
};
