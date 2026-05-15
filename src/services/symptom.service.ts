import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import type { SymptomEntry, SymptomInput, SymptomPhoto } from '@/types';

const symptomFields =
  'id, user_id, care_profile_id, profile_id, symptom_name, severity, onset_date, notes, resolved, resolved_date, source_document_id, deleted_at, created_at';
const legacySymptomFields =
  'id, user_id, profile_id, symptom_name, severity, onset_date, notes, resolved, resolved_date, deleted_at, created_at';
const symptomPhotoFields = 'id, symptom_id, photo_url, storage_path, created_at';

export interface SymptomFilters {
  search?: string;
  resolved?: 'all' | 'active' | 'resolved';
  minSeverity?: number;
}

export interface PickedSymptomPhoto {
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

export const symptomService = {
  async getSymptoms(userId: string, careProfileId: string | null, filters: SymptomFilters = {}): Promise<SymptomEntry[]> {
    return this.getSymptomsWithFields(userId, careProfileId, filters, symptomFields, true);
  },

  async getSymptomsWithFields(
    userId: string,
    careProfileId: string | null,
    filters: SymptomFilters,
    fields: string,
    useCareProfileId: boolean
  ): Promise<SymptomEntry[]> {
    let query = (supabase.from('symptom_entries') as any)
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('onset_date', { ascending: false })
      .order('created_at', { ascending: false });

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    query = useCareProfileId
      ? query.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? query.eq('profile_id', legacyProfileId)
        : query.is('profile_id', null);

    if (filters.search?.trim()) query = query.ilike('symptom_name', `%${filters.search.trim()}%`);
    if (filters.resolved === 'active') query = query.eq('resolved', false);
    if (filters.resolved === 'resolved') query = query.eq('resolved', true);
    if (filters.minSeverity && filters.minSeverity > 1) query = query.gte('severity', filters.minSeverity);

    const { data, error } = await query;
    if (error && useCareProfileId && isMissingCareProfileColumn(error)) {
      return this.getSymptomsWithFields(userId, careProfileId, filters, legacySymptomFields, false);
    }
    if (error) throw error;

    const symptoms = ((data ?? []) as unknown as SymptomEntry[]).map(withCareProfile);
    return this.attachPhotos(symptoms);
  },

  async createSymptom(userId: string, careProfileId: string | null, input: SymptomInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const payload = {
      user_id: userId,
      care_profile_id: careProfileId ?? userId,
      profile_id: legacyProfileId,
      symptom_name: input.symptom_name.trim(),
      severity: input.severity,
      onset_date: input.onset_date,
      notes: input.notes?.trim() || null,
      resolved: input.resolved,
      resolved_date: input.resolved ? input.resolved_date || new Date().toISOString().slice(0, 10) : null,
      source_document_id: input.source_document_id ?? null
    };

    const { data, error } = await supabase
      .from('symptom_entries')
      .insert(payload)
      .select(symptomFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      return this.createLegacySymptom(userId, legacyProfileId, input);
    }
    if (error) throw error;
    return withCareProfile(data as unknown as SymptomEntry);
  },

  async createLegacySymptom(userId: string, profileId: string | null, input: SymptomInput) {
    const { data, error } = await supabase
      .from('symptom_entries')
      .insert({
        user_id: userId,
        profile_id: profileId,
        symptom_name: input.symptom_name.trim(),
        severity: input.severity,
        onset_date: input.onset_date,
        notes: input.notes?.trim() || null,
        resolved: input.resolved,
        resolved_date: input.resolved ? input.resolved_date || new Date().toISOString().slice(0, 10) : null
      })
      .select(legacySymptomFields)
      .single();

    if (error) throw error;
    return withCareProfile(data as unknown as SymptomEntry);
  },

  async updateSymptom(symptomId: string, input: SymptomInput) {
    const updatePayload = {
      symptom_name: input.symptom_name.trim(),
      severity: input.severity,
      onset_date: input.onset_date,
      notes: input.notes?.trim() || null,
      resolved: input.resolved,
      resolved_date: input.resolved ? input.resolved_date || new Date().toISOString().slice(0, 10) : null,
      source_document_id: input.source_document_id ?? null
    };

    const { data, error } = await supabase
      .from('symptom_entries')
      .update(updatePayload)
      .eq('id', symptomId)
      .select(symptomFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('symptom_entries')
        .update({
          symptom_name: input.symptom_name.trim(),
          severity: input.severity,
          onset_date: input.onset_date,
          notes: input.notes?.trim() || null,
          resolved: input.resolved,
          resolved_date: input.resolved ? input.resolved_date || new Date().toISOString().slice(0, 10) : null
        })
        .eq('id', symptomId)
        .select(legacySymptomFields)
        .single();

      if (legacyError) throw legacyError;
      return withCareProfile(legacyData as unknown as SymptomEntry);
    }
    if (error) throw error;
    return withCareProfile(data as unknown as SymptomEntry);
  },

  async softDeleteSymptom(symptomId: string) {
    const { error } = await supabase
      .from('symptom_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', symptomId);

    if (error) throw error;
  },

  async pickSymptomPhoto(): Promise<PickedSymptomPhoto | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Photo permission is required to attach symptom photos.');

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.82,
      base64: true
    });

    if (picked.canceled || picked.assets.length === 0) return null;
    const asset = picked.assets[0];
    if (!asset.base64) throw new Error('Unable to read selected photo.');

    const mimeType = asset.mimeType ?? 'image/jpeg';
    const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    return {
      uri: asset.uri,
      base64: asset.base64,
      fileName: asset.fileName ?? `symptom-photo.${extension}`,
      mimeType
    };
  },

  async uploadSymptomPhoto(userId: string, symptomId: string, photo: PickedSymptomPhoto) {
    const safeName = photo.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const storagePath = `${userId}/symptoms/${symptomId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('health_photos')
      .upload(storagePath, decode(photo.base64), {
        contentType: photo.mimeType,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('health_photos')
      .createSignedUrl(storagePath, 60 * 60);

    if (signedUrlError) throw signedUrlError;

    const { data, error } = await supabase
      .from('symptom_photos')
      .insert({
        symptom_id: symptomId,
        photo_url: signedUrlData.signedUrl,
        storage_path: storagePath
      })
      .select(symptomPhotoFields)
      .single();

    if (error) throw error;
    return data as SymptomPhoto;
  },

  async attachPhotos(symptoms: SymptomEntry[]) {
    if (symptoms.length === 0) return symptoms;
    const symptomIds = symptoms.map((symptom) => symptom.id);
    const { data, error } = await supabase
      .from('symptom_photos')
      .select(symptomPhotoFields)
      .in('symptom_id', symptomIds);

    if (error) throw error;
    const photos = (data ?? []) as SymptomPhoto[];
    return symptoms.map((symptom) => ({
      ...symptom,
      photos: photos.filter((photo) => photo.symptom_id === symptom.id)
    }));
  }
};
