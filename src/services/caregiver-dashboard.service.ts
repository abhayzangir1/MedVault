import { supabase } from '@/lib/supabase';
import type {
  CareProfile,
  CaregiverDashboardActivity,
  CaregiverDashboardSummary,
  HealthcareCost,
  HealthEvent,
  LabResult,
  Medication,
  MedicationCheckin,
  SymptomEntry
} from '@/types';

const dayMs = 24 * 60 * 60 * 1000;

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function profileNameById(careProfiles: CareProfile[]) {
  return new Map(careProfiles.map((profile) => [profile.id, profile.full_name]));
}

function isRecordForCareProfiles<T extends { care_profile_id: string | null; profile_id?: string | null }>(
  record: T,
  careProfileIds: Set<string>
) {
  if (record.care_profile_id && careProfileIds.has(record.care_profile_id)) return true;
  if (record.profile_id && careProfileIds.has(record.profile_id)) return true;
  return !record.care_profile_id && !record.profile_id;
}

function mapActivityName(
  names: Map<string, string>,
  careProfileId: string | null,
  fallback: string
) {
  return careProfileId ? names.get(careProfileId) ?? fallback : fallback;
}

export const caregiverDashboardService = {
  async getSummary(userId: string, careProfiles: CareProfile[]): Promise<CaregiverDashboardSummary> {
    const activeProfiles = careProfiles.filter((profile) => profile.is_active);
    const careProfileIds = new Set(activeProfiles.map((profile) => profile.id));
    const names = profileNameById(activeProfiles);
    const today = startOfToday();
    const todayIso = today.toISOString().slice(0, 10);
    const in30Days = new Date(today.getTime() + 30 * dayMs).toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const ninetyDaysAgo = new Date(today.getTime() - 90 * dayMs).toISOString().slice(0, 10);

    const [
      medicationsResult,
      checkinsResult,
      labsResult,
      eventsResult,
      symptomsResult,
      costsResult
    ] = await Promise.all([
      supabase
        .from('medications')
        .select('id, care_profile_id, profile_id, drug_name, status, refill_date, reminder_time, deleted_at, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase
        .from('medication_checkins')
        .select('id, medication_id, user_id, checkin_date, status, checkin_timestamp, created_at')
        .eq('user_id', userId)
        .eq('checkin_date', todayIso),
      supabase
        .from('lab_results')
        .select('id, care_profile_id, profile_id, test_name, test_date, results, deleted_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('test_date', ninetyDaysAgo),
      supabase
        .from('health_events')
        .select('id, care_profile_id, profile_id, title, event_date, is_critical, deleted_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('event_date', ninetyDaysAgo),
      supabase
        .from('symptom_entries')
        .select('id, care_profile_id, profile_id, symptom_name, severity, onset_date, resolved, deleted_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('onset_date', ninetyDaysAgo),
      supabase
        .from('healthcare_costs')
        .select('id, care_profile_id, profile_id, amount, cost_date, description, reimbursement_amount, deleted_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('cost_date', monthStart)
    ]);

    if (medicationsResult.error) throw medicationsResult.error;
    if (checkinsResult.error) throw checkinsResult.error;
    if (labsResult.error) throw labsResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (symptomsResult.error) throw symptomsResult.error;
    if (costsResult.error) throw costsResult.error;

    const medications = ((medicationsResult.data ?? []) as Medication[])
      .filter((medication) => isRecordForCareProfiles(medication, careProfileIds));
    const checkins = (checkinsResult.data ?? []) as MedicationCheckin[];
    const checkinsByMedication = new Map(checkins.map((checkin) => [checkin.medication_id, checkin]));
    const labs = ((labsResult.data ?? []) as LabResult[])
      .filter((lab) => isRecordForCareProfiles(lab, careProfileIds));
    const events = ((eventsResult.data ?? []) as HealthEvent[])
      .filter((event) => isRecordForCareProfiles(event, careProfileIds));
    const symptoms = ((symptomsResult.data ?? []) as SymptomEntry[])
      .filter((symptom) => isRecordForCareProfiles(symptom, careProfileIds));
    const costs = ((costsResult.data ?? []) as HealthcareCost[])
      .filter((cost) => isRecordForCareProfiles(cost, careProfileIds));

    const medicinesDueToday = medications.filter((medication) => medication.reminder_time).length;
    const missedMedicationCheckins = medications.filter((medication) => {
      if (!medication.reminder_time) return false;
      const checkin = checkinsByMedication.get(medication.id);
      return !checkin || checkin.status === 'missed';
    }).length;
    const upcomingRefills = medications.filter((medication) => {
      const refillDate = toDate(medication.refill_date);
      if (!refillDate) return false;
      const refillIso = refillDate.toISOString().slice(0, 10);
      return refillIso >= todayIso && refillIso <= in30Days;
    }).length;

    const abnormalLabs = labs.filter((lab) => lab.results.some((marker) => marker.flag !== 'normal')).length;
    const criticalLabs = labs.filter((lab) => lab.results.some((marker) => marker.flag === 'critical')).length;
    const followUpsDue = events.filter((event) => {
      const eventDate = toDate(event.event_date);
      if (!eventDate) return false;
      const daysOld = Math.floor((today.getTime() - eventDate.getTime()) / dayMs);
      return event.is_critical && daysOld >= 14 && daysOld <= 90;
    }).length;
    const missingEmergencyInfo = activeProfiles.filter((profile) => {
      return !profile.blood_type || profile.blood_type === 'Unknown' || !profile.emergency_contact_phone;
    }).length;
    const monthlyOutOfPocket = costs.reduce((sum, cost) => {
      return sum + Number(cost.amount ?? 0) - Number(cost.reimbursement_amount ?? 0);
    }, 0);

    const recentActivity: CaregiverDashboardActivity[] = [
      ...events.map((event) => ({
        id: event.id,
        care_profile_id: event.care_profile_id ?? event.profile_id ?? null,
        care_profile_name: mapActivityName(names, event.care_profile_id ?? event.profile_id ?? null, 'Self'),
        title: event.title,
        type: 'timeline' as const,
        date: event.event_date,
        is_critical: event.is_critical
      })),
      ...labs.map((lab) => ({
        id: lab.id,
        care_profile_id: lab.care_profile_id ?? lab.profile_id ?? null,
        care_profile_name: mapActivityName(names, lab.care_profile_id ?? lab.profile_id ?? null, 'Self'),
        title: lab.test_name,
        type: 'lab' as const,
        date: lab.test_date,
        is_critical: lab.results.some((marker) => marker.flag === 'critical')
      })),
      ...symptoms.map((symptom) => ({
        id: symptom.id,
        care_profile_id: symptom.care_profile_id ?? symptom.profile_id ?? null,
        care_profile_name: mapActivityName(names, symptom.care_profile_id ?? symptom.profile_id ?? null, 'Self'),
        title: symptom.symptom_name,
        type: 'symptom' as const,
        date: symptom.onset_date,
        is_critical: symptom.severity >= 8
      })),
      ...costs.map((cost) => ({
        id: cost.id,
        care_profile_id: cost.care_profile_id ?? cost.profile_id ?? null,
        care_profile_name: mapActivityName(names, cost.care_profile_id ?? cost.profile_id ?? null, 'Self'),
        title: cost.description || `Cost ${Number(cost.amount ?? 0).toLocaleString('en-IN')}`,
        type: 'cost' as const,
        date: cost.cost_date,
        is_critical: false
      }))
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return {
      activeCareProfiles: activeProfiles.length,
      medicinesDueToday,
      missedMedicationCheckins,
      upcomingRefills,
      abnormalLabs,
      criticalLabs,
      followUpsDue,
      missingEmergencyInfo,
      monthlyOutOfPocket,
      recentActivity
    };
  }
};
