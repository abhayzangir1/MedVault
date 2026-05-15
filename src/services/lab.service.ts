import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import { notificationService } from '@/services/notification.service';
import type { LabFlag, LabMarker, LabMarkerInput, LabResult, LabResultInput } from '@/types';

const labFields = 'id, user_id, care_profile_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at';
const legacyLabFields = 'id, user_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at';

function withCareProfile<T extends { user_id: string; care_profile_id?: string | null; profile_id: string | null }>(row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? row.user_id
  };
}

export const labService = {
  async getLabResults(userId: string, careProfileId: string | null): Promise<LabResult[]> {
    return this.getLabResultsWithFields(userId, careProfileId, labFields, true);
  },

  async getLabResultsWithFields(userId: string, careProfileId: string | null, fields: string, useCareProfileId: boolean): Promise<LabResult[]> {
    let query = (supabase
      .from('lab_results')
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('test_date', { ascending: false }) as any);

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    query = useCareProfileId
      ? query.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? query.eq('profile_id', legacyProfileId)
        : query.is('profile_id', null);

    const { data, error } = await query;
    if (error && useCareProfileId && isMissingCareProfileColumn(error)) {
      return this.getLabResultsWithFields(userId, careProfileId, legacyLabFields, false);
    }
    if (error) throw error;
    return ((data ?? []) as unknown as LabResult[]).map(withCareProfile);
  },

  async createLabResult(userId: string, careProfileId: string | null, input: LabResultInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const { data, error } = await supabase
      .from('lab_results')
      .insert({
        user_id: userId,
        care_profile_id: careProfileId ?? userId,
        profile_id: legacyProfileId,
        test_name: input.test_name.trim(),
        test_date: input.test_date,
        results: normalizeMarkers(input.markers),
        translations: {},
        source_document_id: input.source_document_id ?? null
      })
      .select(labFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      return this.createLegacyLabResult(userId, legacyProfileId, input);
    }
    if (error) throw error;
    return withCareProfile(data as unknown as LabResult);
  },

  async createLegacyLabResult(userId: string, profileId: string | null, input: LabResultInput) {
    const { data, error } = await supabase
      .from('lab_results')
      .insert({
        user_id: userId,
        profile_id: profileId,
        test_name: input.test_name.trim(),
        test_date: input.test_date,
        results: normalizeMarkers(input.markers),
        translations: {}
      })
      .select(legacyLabFields)
      .single();

    if (error) throw error;
    return withCareProfile(data as unknown as LabResult);
  },

  async updateLabResult(labId: string, input: LabResultInput) {
    const { data, error } = await supabase
      .from('lab_results')
      .update({
        test_name: input.test_name.trim(),
        test_date: input.test_date,
        results: normalizeMarkers(input.markers)
      })
      .eq('id', labId)
      .select(labFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('lab_results')
        .update({
          test_name: input.test_name.trim(),
          test_date: input.test_date,
          results: normalizeMarkers(input.markers)
        })
        .eq('id', labId)
        .select(legacyLabFields)
        .single();

      if (legacyError) throw legacyError;
      return withCareProfile(legacyData as unknown as LabResult);
    }
    if (error) throw error;
    return withCareProfile(data as unknown as LabResult);
  },

  async softDeleteLabResult(labId: string) {
    const { error } = await supabase
      .from('lab_results')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', labId);

    if (error) throw error;
  },

  async generateInterpretation(labId: string) {
    const { data, error } = await supabase.functions.invoke<LabResult>('generate-lab-interpretation', {
      body: { labId }
    });

    if (error) throw error;
    if (!data) throw new Error('AI interpretation was not returned.');

    await notificationService.scheduleFeatureNotification({
      title: 'Lab interpretation ready',
      body: `${data.test_name} now has an AI summary.`,
      feature: 'ai'
    });

    return data;
  }
};

export function normalizeMarkers(markers: LabMarkerInput[]): LabMarker[] {
  return markers
    .filter((marker) => marker.marker.trim())
    .map((marker) => {
      const value = Number(marker.value);
      const referenceLow = Number(marker.reference_low);
      const referenceHigh = Number(marker.reference_high);

      return {
        marker: marker.marker.trim(),
        value,
        unit: marker.unit.trim(),
        reference_low: referenceLow,
        reference_high: referenceHigh,
        flag: calculateLabFlag(value, referenceLow, referenceHigh)
      };
    });
}

export function calculateLabFlag(value: number, referenceLow: number, referenceHigh: number): LabFlag {
  if (!Number.isFinite(value) || !Number.isFinite(referenceLow) || !Number.isFinite(referenceHigh)) return 'normal';
  if (referenceHigh > 0 && value > referenceHigh * 2) return 'critical';
  if (referenceLow > 0 && value < referenceLow * 0.5) return 'critical';
  if (value < referenceLow) return 'low';
  if (value > referenceHigh) return 'high';
  return 'normal';
}
