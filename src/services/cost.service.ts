import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { format, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import type { CostMonthlyTotal, CostPhoto, HealthcareCost, HealthcareCostInput } from '@/types';

const costFields =
  'id, user_id, care_profile_id, profile_id, amount, cost_date, category, description, provider_name, reimbursement_status, reimbursement_amount, source_document_id, deleted_at, created_at';
const legacyCostFields =
  'id, user_id, profile_id, amount, cost_date, category, description, provider_name, reimbursement_status, reimbursement_amount, deleted_at, created_at';
const costPhotoFields = 'id, cost_id, photo_url, storage_path, created_at';

export interface CostFilters {
  search?: string;
  category?: string;
  reimbursement?: string;
}

export interface PickedCostReceipt {
  uri: string;
  base64: string;
  fileName: string;
  mimeType: string;
}

function withCareProfile<T extends { user_id: string; care_profile_id?: string | null; profile_id: string | null }>(row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? row.user_id
  };
}

function normalizeCost(row: HealthcareCost): HealthcareCost {
  return {
    ...row,
    amount: Number(row.amount),
    reimbursement_amount: row.reimbursement_amount === null ? null : Number(row.reimbursement_amount)
  };
}

export const costService = {
  async getCosts(userId: string, careProfileId: string | null, filters: CostFilters = {}): Promise<HealthcareCost[]> {
    return this.getCostsWithFields(userId, careProfileId, filters, costFields, true);
  },

  async getCostsWithFields(userId: string, careProfileId: string | null, filters: CostFilters, fields: string, useCareProfileId: boolean): Promise<HealthcareCost[]> {
    let query = (supabase.from('healthcare_costs') as any)
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('cost_date', { ascending: false });

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    query = useCareProfileId
      ? query.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? query.eq('profile_id', legacyProfileId)
        : query.is('profile_id', null);

    if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
    if (filters.reimbursement && filters.reimbursement !== 'all') query = query.eq('reimbursement_status', filters.reimbursement);
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.or(`description.ilike.${search},provider_name.ilike.${search}`);
    }

    const { data, error } = await query;
    if (error && useCareProfileId && isMissingCareProfileColumn(error)) {
      return this.getCostsWithFields(userId, careProfileId, filters, legacyCostFields, false);
    }
    if (error) throw error;

    const costs = ((data ?? []) as unknown as HealthcareCost[]).map(withCareProfile).map(normalizeCost);
    return this.attachPhotos(costs);
  },

  async createCost(userId: string, careProfileId: string | null, input: HealthcareCostInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const payload = {
      user_id: userId,
      care_profile_id: careProfileId ?? userId,
      profile_id: legacyProfileId,
      amount: Number(input.amount),
      cost_date: input.cost_date,
      category: input.category,
      description: input.description?.trim() || null,
      provider_name: input.provider_name?.trim() || null,
      reimbursement_status: input.reimbursement_status,
      reimbursement_amount: input.reimbursement_amount ? Number(input.reimbursement_amount) : null,
      source_document_id: input.source_document_id ?? null
    };

    const { data, error } = await supabase
      .from('healthcare_costs')
      .insert(payload)
      .select(costFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      return this.createLegacyCost(userId, legacyProfileId, input);
    }
    if (error) throw error;
    return normalizeCost(withCareProfile(data as unknown as HealthcareCost));
  },

  async createLegacyCost(userId: string, profileId: string | null, input: HealthcareCostInput) {
    const { data, error } = await supabase
      .from('healthcare_costs')
      .insert({
        user_id: userId,
        profile_id: profileId,
        amount: Number(input.amount),
        cost_date: input.cost_date,
        category: input.category,
        description: input.description?.trim() || null,
        provider_name: input.provider_name?.trim() || null,
        reimbursement_status: input.reimbursement_status,
        reimbursement_amount: input.reimbursement_amount ? Number(input.reimbursement_amount) : null
      })
      .select(legacyCostFields)
      .single();

    if (error) throw error;
    return normalizeCost(withCareProfile(data as unknown as HealthcareCost));
  },

  async updateCost(costId: string, input: HealthcareCostInput) {
    const updatePayload = {
      amount: Number(input.amount),
      cost_date: input.cost_date,
      category: input.category,
      description: input.description?.trim() || null,
      provider_name: input.provider_name?.trim() || null,
      reimbursement_status: input.reimbursement_status,
      reimbursement_amount: input.reimbursement_amount ? Number(input.reimbursement_amount) : null,
      source_document_id: input.source_document_id ?? null
    };

    const { data, error } = await supabase
      .from('healthcare_costs')
      .update(updatePayload)
      .eq('id', costId)
      .select(costFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('healthcare_costs')
        .update({
          amount: Number(input.amount),
          cost_date: input.cost_date,
          category: input.category,
          description: input.description?.trim() || null,
          provider_name: input.provider_name?.trim() || null,
          reimbursement_status: input.reimbursement_status,
          reimbursement_amount: input.reimbursement_amount ? Number(input.reimbursement_amount) : null
        })
        .eq('id', costId)
        .select(legacyCostFields)
        .single();

      if (legacyError) throw legacyError;
      return normalizeCost(withCareProfile(legacyData as unknown as HealthcareCost));
    }
    if (error) throw error;
    return normalizeCost(withCareProfile(data as unknown as HealthcareCost));
  },

  async softDeleteCost(costId: string) {
    const { error } = await supabase
      .from('healthcare_costs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', costId);

    if (error) throw error;
  },

  getMonthlyTotals(costs: HealthcareCost[], months = 6): CostMonthlyTotal[] {
    const monthKeys = Array.from({ length: months }, (_, index) => format(subMonths(new Date(), months - index - 1), 'yyyy-MM'));
    return monthKeys.map((month) => {
      const monthCosts = costs.filter((cost) => cost.cost_date.startsWith(month));
      return {
        month,
        total: monthCosts.reduce((sum, cost) => sum + cost.amount, 0),
        reimbursed: monthCosts.reduce((sum, cost) => sum + (cost.reimbursement_amount ?? 0), 0)
      };
    });
  },

  async pickReceipt(): Promise<PickedCostReceipt | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Photo permission is required to attach receipts.');

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.82,
      base64: true
    });

    if (picked.canceled || picked.assets.length === 0) return null;
    const asset = picked.assets[0];
    if (!asset.base64) throw new Error('Unable to read selected receipt.');

    const mimeType = asset.mimeType ?? 'image/jpeg';
    const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    return {
      uri: asset.uri,
      base64: asset.base64,
      fileName: asset.fileName ?? `receipt.${extension}`,
      mimeType
    };
  },

  async uploadCostReceipt(userId: string, costId: string, receipt: PickedCostReceipt) {
    const safeName = receipt.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const storagePath = `${userId}/costs/${costId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('health_photos')
      .upload(storagePath, decode(receipt.base64), {
        contentType: receipt.mimeType,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('health_photos')
      .createSignedUrl(storagePath, 60 * 60);

    if (signedUrlError) throw signedUrlError;

    const { data, error } = await supabase
      .from('cost_photos')
      .insert({
        cost_id: costId,
        photo_url: signedUrlData.signedUrl,
        storage_path: storagePath
      })
      .select(costPhotoFields)
      .single();

    if (error) throw error;
    return data as CostPhoto;
  },

  async attachPhotos(costs: HealthcareCost[]) {
    if (costs.length === 0) return costs;
    const costIds = costs.map((cost) => cost.id);
    const { data, error } = await supabase
      .from('cost_photos')
      .select(costPhotoFields)
      .in('cost_id', costIds);

    if (error) throw error;
    const photos = (data ?? []) as CostPhoto[];
    return costs.map((cost) => ({
      ...cost,
      photos: photos.filter((photo) => photo.cost_id === cost.id)
    }));
  }
};
