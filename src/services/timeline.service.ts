import { supabase } from '@/lib/supabase';
import { isMissingCareProfileColumn, toLegacyProfileId } from '@/lib/supabaseCompat';
import type { EventCategory, HealthEvent, HealthEventInput } from '@/types';

const eventFields = 'id, user_id, care_profile_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at';
const legacyEventFields = 'id, user_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at';

export interface TimelineFilters {
  category?: EventCategory | 'all';
  criticalOnly?: boolean;
  search?: string;
}

function withCareProfile<T extends { care_profile_id?: string | null; profile_id: string | null }>(userId: string, row: T): T {
  return {
    ...row,
    care_profile_id: row.care_profile_id ?? row.profile_id ?? userId
  };
}

export const timelineService = {
  async getEvents(userId: string, careProfileId: string | null, filters: TimelineFilters = {}): Promise<HealthEvent[]> {
    const data = await this.getEventsWithFields(userId, careProfileId, filters, eventFields, true);
    return data.map((event: HealthEvent) => withCareProfile(userId, event)) as HealthEvent[];
  },

  async getEventsWithFields(userId: string, careProfileId: string | null, filters: TimelineFilters, fields: string, useCareProfileId: boolean): Promise<HealthEvent[]> {
    let query = (supabase
      .from('health_events')
      .select(fields)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('event_date', { ascending: false }) as any);

    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    query = useCareProfileId
      ? query.eq('care_profile_id', careProfileId ?? userId)
      : legacyProfileId
        ? query.eq('profile_id', legacyProfileId)
        : query.is('profile_id', null);

    if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
    if (filters.criticalOnly) query = query.eq('is_critical', true);
    if (filters.search?.trim()) query = query.ilike('title', `%${filters.search.trim()}%`);

    const { data, error } = await query;
    if (error && useCareProfileId && isMissingCareProfileColumn(error)) {
      return this.getEventsWithFields(userId, careProfileId, filters, legacyEventFields, false);
    }
    if (error) throw error;
    return (data ?? []) as unknown as HealthEvent[];
  },

  async createEvent(userId: string, careProfileId: string | null, input: HealthEventInput) {
    const legacyProfileId = toLegacyProfileId(userId, careProfileId);
    const { data, error } = await supabase
      .from('health_events')
      .insert({
        user_id: userId,
        care_profile_id: careProfileId ?? userId,
        profile_id: legacyProfileId,
        title: input.title.trim(),
        category: input.category,
        event_date: input.event_date,
        description: input.description?.trim() || null,
        is_critical: input.is_critical,
        source_document_id: input.source_document_id ?? null
      })
      .select(eventFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      return this.createLegacyEvent(userId, legacyProfileId, input);
    }
    if (error) throw error;
    await this.markOnboardingEventAdded(userId);
    return withCareProfile(userId, data as unknown as HealthEvent);
  },

  async createLegacyEvent(userId: string, profileId: string | null, input: HealthEventInput) {
    const { data, error } = await supabase
      .from('health_events')
      .insert({
        user_id: userId,
        profile_id: profileId,
        title: input.title.trim(),
        category: input.category,
        event_date: input.event_date,
        description: input.description?.trim() || null,
        is_critical: input.is_critical
      })
      .select(legacyEventFields)
      .single();

    if (error) throw error;
    await this.markOnboardingEventAdded(userId);
    return withCareProfile(userId, data as unknown as HealthEvent);
  },

  async updateEvent(eventId: string, input: HealthEventInput) {
    const { data, error } = await supabase
      .from('health_events')
      .update({
        title: input.title.trim(),
        category: input.category,
        event_date: input.event_date,
        description: input.description?.trim() || null,
        is_critical: input.is_critical
      })
      .eq('id', eventId)
      .select(eventFields)
      .single();

    if (error && isMissingCareProfileColumn(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('health_events')
        .update({
          title: input.title.trim(),
          category: input.category,
          event_date: input.event_date,
          description: input.description?.trim() || null,
          is_critical: input.is_critical
        })
        .eq('id', eventId)
        .select(legacyEventFields)
        .single();

      if (legacyError) throw legacyError;
      const legacyEvent = legacyData as unknown as HealthEvent;
      return withCareProfile(legacyEvent.user_id, legacyEvent);
    }
    if (error) throw error;
    const event = data as unknown as HealthEvent;
    return withCareProfile(event.user_id, event);
  },

  async softDeleteEvent(eventId: string) {
    const { error } = await supabase
      .from('health_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) throw error;
  },

  async markOnboardingEventAdded(userId: string) {
    const { error } = await supabase
      .from('onboarding_progress')
      .update({ added_first_event: true })
      .eq('user_id', userId);

    if (error) throw error;
  }
};
