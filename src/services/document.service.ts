import * as DocumentPicker from 'expo-document-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import { notificationService } from '@/services/notification.service';
import type { DocumentCategory, DocumentInput, MedicalDocument } from '@/types';

const documentFields = 'id, user_id, care_profile_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at';
const legacyDocumentFields = 'id, user_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at';

function withCareProfile<T extends { user_id: string; care_profile_id?: string | null; profile_id: string | null }>(row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? row.user_id
  };
}

export const documentService = {
  async getDocuments(userId: string, careProfileId: string | null): Promise<MedicalDocument[]> {
    return this.getDocumentsWithFields(userId, careProfileId, documentFields, true);
  },

  async getDocumentsWithFields(userId: string, careProfileId: string | null, fields: string, useCareProfileId: boolean): Promise<MedicalDocument[]> {
    let query = (supabase
      .from('documents')
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }) as any);

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    query = useCareProfileId
      ? query.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? query.eq('profile_id', legacyProfileId)
        : query.is('profile_id', null);

    const { data, error } = await query;
    if (error && useCareProfileId && isMissingCareProfileColumn(error)) {
      return this.getDocumentsWithFields(userId, careProfileId, legacyDocumentFields, false);
    }
    if (error) throw error;
    return ((data ?? []) as unknown as MedicalDocument[]).map(withCareProfile);
  },

  async pickAndUploadDocument(userId: string, careProfileId: string | null, category: DocumentCategory) {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      base64: true
    });

    if (picked.canceled || picked.assets.length === 0) return null;

    const asset = picked.assets[0];
    if (!asset.base64) throw new Error('Unable to read selected file.');

    const safeName = asset.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const storagePath = `${userId}/${Date.now()}-${safeName}`;
    const contentType = asset.mimeType ?? 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, decode(asset.base64), {
        contentType,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 60);

    if (signedUrlError) throw signedUrlError;

    const created = await this.createDocument(userId, careProfileId, {
      file_name: asset.name,
      file_url: signedUrlData.signedUrl,
      storage_path: storagePath,
      file_type: contentType,
      file_size: asset.size ?? null,
      document_category: category
    });

    await this.markOnboardingDocumentUploaded(userId);
    return created;
  },

  async createDocument(userId: string, careProfileId: string | null, input: DocumentInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        care_profile_id: careProfileId ?? userId,
        profile_id: legacyProfileId,
        ...input
      })
      .select(documentFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          profile_id: legacyProfileId,
          ...input
        })
        .select(legacyDocumentFields)
        .single();

      if (legacyError) throw legacyError;
      return withCareProfile(legacyData as unknown as MedicalDocument);
    }
    if (error) throw error;
    return withCareProfile(data as unknown as MedicalDocument);
  },

  async softDeleteDocument(documentId: string) {
    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', documentId);

    if (error) throw error;
  },

  async scanDocument(documentId: string) {
    const { data, error } = await supabase.functions.invoke<MedicalDocument>('scan-document', {
      body: { documentId }
    });

    if (error) throw error;
    if (!data) throw new Error('OCR result was not returned.');

    await notificationService.scheduleFeatureNotification({
      title: 'Document OCR ready',
      body: `${data.file_name} has been scanned.`,
      feature: 'documents'
    });

    return data;
  },

  async markOnboardingDocumentUploaded(userId: string) {
    const { error } = await supabase
      .from('onboarding_progress')
      .update({ uploaded_first_document: true })
      .eq('user_id', userId);

    if (error) throw error;
  }
};
