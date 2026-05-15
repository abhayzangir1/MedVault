import { endOfMonth, format, startOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import type { DashboardSummary, HealthEvent, Medication, MedicationCheckin, OnboardingProgress } from '@/types';

const medicationFields = 'id, user_id, care_profile_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at';
const legacyMedicationFields = 'id, user_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at';
const eventFields = 'id, user_id, care_profile_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at';
const legacyEventFields = 'id, user_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at';

function withCareProfile<T extends { user_id: string; care_profile_id?: string | null; profile_id: string | null }>(row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? row.user_id
  };
}

export const dashboardService = {
  async getSummary(userId: string, careProfileId: string | null): Promise<DashboardSummary> {
    return this.getSummaryWithMode(userId, careProfileId, true);
  },

  async getSummaryWithMode(userId: string, careProfileId: string | null, useCareProfileId: boolean): Promise<DashboardSummary> {
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');
    const refillLimit = format(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);

    const eventCountBase = ((supabase.from('health_events') as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('event_date', monthStart)
      .lte('event_date', monthEnd) as any);
    const eventCountQuery = this.applyProfileFilter(eventCountBase, userId, careProfileId, legacyProfileId, useCareProfileId);

    const activeMedicationsBase = ((supabase.from('medications') as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null) as any);
    const activeMedicationsQuery = this.applyProfileFilter(activeMedicationsBase, userId, careProfileId, legacyProfileId, useCareProfileId);

    const refillsBase = ((supabase.from('medications') as any)
      .select(useCareProfileId ? medicationFields : legacyMedicationFields)
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('refill_date', 'is', null)
      .lte('refill_date', refillLimit)
      .order('refill_date', { ascending: true })
      .limit(3) as any);
    const refillsQuery = this.applyProfileFilter(refillsBase, userId, careProfileId, legacyProfileId, useCareProfileId);

    const recentEventsBase = ((supabase.from('health_events') as any)
      .select(useCareProfileId ? eventFields : legacyEventFields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('event_date', { ascending: false })
      .limit(3) as any);
    const recentEventsQuery = this.applyProfileFilter(recentEventsBase, userId, careProfileId, legacyProfileId, useCareProfileId);

    const checkinsQuery = supabase
      .from('medication_checkins')
      .select('id, medication_id, user_id, checkin_date, status, checkin_timestamp, created_at')
      .eq('user_id', userId)
      .eq('checkin_date', today);

    const onboardingQuery = supabase
      .from('onboarding_progress')
      .select('user_id, added_first_event, added_first_medication, uploaded_first_document, checklist_dismissed, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    const [
      eventCountResult,
      activeMedicationsResult,
      refillsResult,
      recentEventsResult,
      checkinsResult,
      onboardingResult
    ] = await Promise.all([
      eventCountQuery,
      activeMedicationsQuery,
      refillsQuery,
      recentEventsQuery,
      checkinsQuery,
      onboardingQuery
    ]);

    const firstError = [
      eventCountResult.error,
      activeMedicationsResult.error,
      refillsResult.error,
      recentEventsResult.error,
      checkinsResult.error,
      onboardingResult.error
    ].find(Boolean);

    if (firstError && useCareProfileId && isMissingCareProfileColumn(firstError)) {
      return this.getSummaryWithMode(userId, careProfileId, false);
    }
    if (firstError) throw firstError;

    const recentEvents = ((recentEventsResult.data ?? []) as unknown as HealthEvent[]).map(withCareProfile);
    const todayCheckins = ((checkinsResult.data ?? []) as MedicationCheckin[]).length;
    const eventsThisMonth = eventCountResult.count ?? 0;
    const activeMedications = activeMedicationsResult.count ?? 0;

    return {
      eventsThisMonth,
      activeMedications,
      todayCheckins,
      upcomingRefills: ((refillsResult.data ?? []) as unknown as Medication[]).map(withCareProfile),
      recentEvents,
      onboarding: (onboardingResult.data ?? null) as OnboardingProgress | null,
      activityScore: eventsThisMonth * 10 + todayCheckins * 5
    };
  },

  applyProfileFilter<T>(
    query: T,
    userId: string,
    careProfileId: string | null,
    legacyProfileId: string | null,
    useCareProfileId: boolean
  ) {
    const filterableQuery = query as T & {
      eq: (column: string, value: string) => T;
      is: (column: string, value: null) => T;
    };

    if (useCareProfileId) return filterableQuery.eq('care_profile_id', careProfileId ?? userId);
    return legacyProfileId ? filterableQuery.eq('profile_id', legacyProfileId) : filterableQuery.is('profile_id', null);
  }
};
