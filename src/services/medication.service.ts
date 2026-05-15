import { format, subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import { notificationService } from '@/services/notification.service';
import type { CheckinStatus, Medication, MedicationCheckin, MedicationInput, MedicationWithTodayCheckin } from '@/types';

const medicationFields = 'id, user_id, care_profile_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at';
const legacyMedicationFields = 'id, user_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at';
const checkinFields = 'id, medication_id, user_id, checkin_date, status, checkin_timestamp, created_at';

function withCareProfile<T extends { user_id: string; care_profile_id?: string | null; profile_id: string | null }>(row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? row.user_id
  };
}

export const medicationService = {
  async getMedications(userId: string, careProfileId: string | null): Promise<MedicationWithTodayCheckin[]> {
    return this.getMedicationsWithFields(userId, careProfileId, medicationFields, true);
  },

  async getMedicationsWithFields(userId: string, careProfileId: string | null, fields: string, useCareProfileId: boolean): Promise<MedicationWithTodayCheckin[]> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const since = format(subDays(new Date(), 29), 'yyyy-MM-dd');

    let medicationQuery = (supabase
      .from('medications')
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('status', { ascending: true })
      .order('drug_name', { ascending: true }) as any);

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    medicationQuery = useCareProfileId
      ? medicationQuery.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? medicationQuery.eq('profile_id', legacyProfileId)
        : medicationQuery.is('profile_id', null);

    const { data: medicationsData, error: medicationError } = await medicationQuery;
    if (medicationError && useCareProfileId && isMissingCareProfileColumn(medicationError)) {
      return this.getMedicationsWithFields(userId, careProfileId, legacyMedicationFields, false);
    }
    if (medicationError) throw medicationError;

    const medications = ((medicationsData ?? []) as unknown as Medication[]).map(withCareProfile);
    const medicationIds = medications.map((medication) => medication.id);
    if (medicationIds.length === 0) return [];

    const { data: checkinsData, error: checkinError } = await supabase
      .from('medication_checkins')
      .select(checkinFields)
      .eq('user_id', userId)
      .gte('checkin_date', since)
      .in('medication_id', medicationIds);

    if (checkinError) throw checkinError;

    const checkins = (checkinsData ?? []) as MedicationCheckin[];
    return medications.map((medication) => {
      const medicationCheckins = checkins.filter((checkin) => checkin.medication_id === medication.id);
      const todayCheckin = medicationCheckins.find((checkin) => checkin.checkin_date === today) ?? null;
      const takenCount = medicationCheckins.filter((checkin) => checkin.status === 'taken').length;

      return {
        ...medication,
        today_checkin: todayCheckin,
        adherence_30d: Math.round((takenCount / 30) * 100)
      };
    });
  },

  async createMedication(userId: string, careProfileId: string | null, input: MedicationInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const { data, error } = await supabase
      .from('medications')
      .insert({
        user_id: userId,
        care_profile_id: careProfileId ?? userId,
        profile_id: legacyProfileId,
        drug_name: input.drug_name.trim(),
        dosage: input.dosage.trim(),
        frequency: input.frequency.trim(),
        notes: input.notes?.trim() || null,
        status: input.status,
        refill_date: input.refill_date || null,
        reminder_time: input.reminder_time || null,
        source_document_id: input.source_document_id ?? null
      })
      .select(medicationFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      return this.createLegacyMedication(userId, legacyProfileId, input);
    }
    if (error) throw error;
    const medication = withCareProfile(data as unknown as Medication);
    await this.markOnboardingMedicationAdded(userId);
    await notificationService.syncMedicationNotifications(medication);
    return medication;
  },

  async createLegacyMedication(userId: string, profileId: string | null, input: MedicationInput) {
    const { data, error } = await supabase
      .from('medications')
      .insert({
        user_id: userId,
        profile_id: profileId,
        drug_name: input.drug_name.trim(),
        dosage: input.dosage.trim(),
        frequency: input.frequency.trim(),
        notes: input.notes?.trim() || null,
        status: input.status,
        refill_date: input.refill_date || null,
        reminder_time: input.reminder_time || null
      })
      .select(legacyMedicationFields)
      .single();

    if (error) throw error;
    const medication = withCareProfile(data as unknown as Medication);
    await this.markOnboardingMedicationAdded(userId);
    await notificationService.syncMedicationNotifications(medication);
    return medication;
  },

  async updateMedication(medicationId: string, input: MedicationInput) {
    const { data, error } = await supabase
      .from('medications')
      .update({
        drug_name: input.drug_name.trim(),
        dosage: input.dosage.trim(),
        frequency: input.frequency.trim(),
        notes: input.notes?.trim() || null,
        status: input.status,
        refill_date: input.refill_date || null,
        reminder_time: input.reminder_time || null
      })
      .eq('id', medicationId)
      .select(medicationFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('medications')
        .update({
          drug_name: input.drug_name.trim(),
          dosage: input.dosage.trim(),
          frequency: input.frequency.trim(),
          notes: input.notes?.trim() || null,
          status: input.status,
          refill_date: input.refill_date || null,
          reminder_time: input.reminder_time || null
        })
        .eq('id', medicationId)
        .select(legacyMedicationFields)
        .single();

      if (legacyError) throw legacyError;
      const medication = withCareProfile(legacyData as unknown as Medication);
      await notificationService.syncMedicationNotifications(medication);
      return medication;
    }
    if (error) throw error;
    const medication = withCareProfile(data as unknown as Medication);
    await notificationService.syncMedicationNotifications(medication);
    return medication;
  },

  async softDeleteMedication(medicationId: string) {
    const { error } = await supabase
      .from('medications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', medicationId);

    if (error) throw error;
    await notificationService.cancelMedicationNotifications(medicationId);
  },

  async upsertTodayCheckin(userId: string, medicationId: string, status: CheckinStatus) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('medication_checkins')
      .upsert({
        medication_id: medicationId,
        user_id: userId,
        checkin_date: today,
        status,
        checkin_timestamp: new Date().toISOString()
      }, {
        onConflict: 'medication_id,checkin_date'
      })
      .select(checkinFields)
      .single();

    if (error) throw error;
    return data as MedicationCheckin;
  },

  async markOnboardingMedicationAdded(userId: string) {
    const { error } = await supabase
      .from('onboarding_progress')
      .update({ added_first_medication: true })
      .eq('user_id', userId);

    if (error) throw error;
  }
};
