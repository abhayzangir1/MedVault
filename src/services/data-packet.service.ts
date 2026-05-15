import { subDays, subYears } from 'date-fns';
import type { DataDomain, DataScopeSelection } from '@/lib/dataScopes';
import { getScopedCareProfileIds } from '@/lib/dataScopes';
import { supabase } from '@/lib/supabase';
import type {
  CareProfile,
  DataPacketCollection,
  DataPacketPreview,
  DataPacketPreviewDomain,
  DataPacketRecord,
  HealthEvent,
  HealthcareCost,
  LabResult,
  Medication,
  MedicalDocument,
  SymptomEntry
} from '@/types';

type ScopedRecord = {
  id: string;
  care_profile_id: string | null;
  profile_id?: string | null;
  date: string;
  critical: boolean;
  attachments: number;
};

type PacketDomain = Exclude<DataDomain, 'profile' | 'family' | 'emergency'>;

const domainTables: Record<Exclude<DataDomain, 'profile' | 'family' | 'emergency'>, {
  table: string;
  dateField: string;
  select: string;
}> = {
  timeline: {
    table: 'health_events',
    dateField: 'event_date',
    select: 'id, care_profile_id, profile_id, event_date, is_critical, deleted_at'
  },
  medications: {
    table: 'medications',
    dateField: 'created_at',
    select: 'id, care_profile_id, profile_id, status, refill_date, reminder_time, deleted_at, created_at'
  },
  labs: {
    table: 'lab_results',
    dateField: 'test_date',
    select: 'id, care_profile_id, profile_id, test_date, results, deleted_at'
  },
  documents: {
    table: 'documents',
    dateField: 'created_at',
    select: 'id, care_profile_id, profile_id, document_category, storage_path, deleted_at, created_at'
  },
  symptoms: {
    table: 'symptom_entries',
    dateField: 'onset_date',
    select: 'id, care_profile_id, profile_id, severity, onset_date, deleted_at'
  },
  costs: {
    table: 'healthcare_costs',
    dateField: 'cost_date',
    select: 'id, care_profile_id, profile_id, amount, reimbursement_amount, cost_date, deleted_at'
  }
};

const collectionSelects: Record<PacketDomain, {
  table: string;
  dateField: string;
  select: string;
}> = {
  timeline: {
    table: 'health_events',
    dateField: 'event_date',
    select: 'id, user_id, care_profile_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at'
  },
  medications: {
    table: 'medications',
    dateField: 'created_at',
    select: 'id, user_id, care_profile_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at'
  },
  labs: {
    table: 'lab_results',
    dateField: 'test_date',
    select: 'id, user_id, care_profile_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at'
  },
  documents: {
    table: 'documents',
    dateField: 'created_at',
    select: 'id, user_id, care_profile_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at'
  },
  symptoms: {
    table: 'symptom_entries',
    dateField: 'onset_date',
    select: 'id, user_id, care_profile_id, profile_id, symptom_name, severity, onset_date, notes, resolved, resolved_date, source_document_id, deleted_at, created_at'
  },
  costs: {
    table: 'healthcare_costs',
    dateField: 'cost_date',
    select: 'id, user_id, care_profile_id, profile_id, amount, cost_date, category, description, provider_name, reimbursement_status, reimbursement_amount, source_document_id, deleted_at, created_at'
  }
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateBounds(scope: DataScopeSelection) {
  const now = new Date();
  if (scope.dateRange === 'last_30_days') return { start: isoDate(subDays(now, 30)), end: isoDate(now) };
  if (scope.dateRange === 'last_90_days') return { start: isoDate(subDays(now, 90)), end: isoDate(now) };
  if (scope.dateRange === 'last_1_year') return { start: isoDate(subYears(now, 1)), end: isoDate(now) };
  if (scope.dateRange === 'custom') {
    return {
      start: scope.customStartDate || null,
      end: scope.customEndDate || null
    };
  }
  return { start: null, end: null };
}

function isWithinBounds(dateValue: string, start: string | null, end: string | null) {
  const normalized = dateValue.slice(0, 10);
  if (start && normalized < start) return false;
  if (end && normalized > end) return false;
  return true;
}

function belongsToSelectedCareProfile(record: Pick<ScopedRecord, 'care_profile_id' | 'profile_id'>, selectedIds: Set<string>) {
  if (record.care_profile_id && selectedIds.has(record.care_profile_id)) return true;
  if (record.profile_id && selectedIds.has(record.profile_id)) return true;
  return false;
}

function mapRecords(domain: DataDomain, rows: unknown[]): ScopedRecord[] {
  if (domain === 'timeline') {
    return (rows as HealthEvent[]).map((row) => ({
      id: row.id,
      care_profile_id: row.care_profile_id,
      profile_id: row.profile_id,
      date: row.event_date,
      critical: row.is_critical,
      attachments: 0
    }));
  }

  if (domain === 'medications') {
    return (rows as Medication[]).map((row) => ({
      id: row.id,
      care_profile_id: row.care_profile_id,
      profile_id: row.profile_id,
      date: row.created_at,
      critical: row.status === 'active' && (!!row.reminder_time || !!row.refill_date),
      attachments: 0
    }));
  }

  if (domain === 'labs') {
    return (rows as LabResult[]).map((row) => ({
      id: row.id,
      care_profile_id: row.care_profile_id,
      profile_id: row.profile_id,
      date: row.test_date,
      critical: row.results.some((marker) => marker.flag !== 'normal'),
      attachments: 0
    }));
  }

  if (domain === 'documents') {
    return (rows as MedicalDocument[]).map((row) => ({
      id: row.id,
      care_profile_id: row.care_profile_id,
      profile_id: row.profile_id,
      date: row.created_at,
      critical: row.document_category === 'discharge_summary' || row.document_category === 'prescription',
      attachments: row.storage_path ? 1 : 0
    }));
  }

  if (domain === 'symptoms') {
    return (rows as SymptomEntry[]).map((row) => ({
      id: row.id,
      care_profile_id: row.care_profile_id,
      profile_id: row.profile_id,
      date: row.onset_date,
      critical: row.severity >= 8,
      attachments: row.photos?.length ?? 0
    }));
  }

  return (rows as HealthcareCost[]).map((row) => ({
    id: row.id,
    care_profile_id: row.care_profile_id,
    profile_id: row.profile_id,
    date: row.cost_date,
    critical: Number(row.amount ?? 0) >= 10000,
    attachments: row.photos?.length ?? 0
  }));
}

function staticDomainPreview(domain: DataDomain, careProfileCount: number): DataPacketPreviewDomain {
  return {
    domain,
    count: careProfileCount,
    criticalCount: 0,
    attachmentCount: 0
  };
}

function isCriticalCollectionRecord(domain: PacketDomain, record: unknown) {
  if (domain === 'timeline') return (record as HealthEvent).is_critical;
  if (domain === 'medications') {
    const medication = record as Medication;
    return medication.status === 'active' && (!!medication.reminder_time || !!medication.refill_date);
  }
  if (domain === 'labs') return (record as LabResult).results.some((marker) => marker.flag !== 'normal');
  if (domain === 'documents') {
    const document = record as MedicalDocument;
    return document.document_category === 'discharge_summary' || document.document_category === 'prescription';
  }
  if (domain === 'symptoms') return (record as SymptomEntry).severity >= 8;
  if (domain === 'costs') return Number((record as HealthcareCost).amount ?? 0) >= 10000;
  return false;
}

async function getScopedRows<T extends { care_profile_id: string | null; profile_id?: string | null }>(
  userId: string,
  domain: PacketDomain,
  selectedIds: Set<string>,
  start: string | null,
  end: string | null,
  criticalOnly: boolean
): Promise<T[]> {
  const config = collectionSelects[domain];
  const { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) throw error;

  return ((data ?? []) as unknown as T[])
    .filter((record) => belongsToSelectedCareProfile(record, selectedIds))
    .filter((record) => isWithinBounds(String((record as Record<string, unknown>)[config.dateField]), start, end))
    .filter((record) => !criticalOnly || isCriticalCollectionRecord(domain, record));
}

export const dataPacketService = {
  getDateBounds,

  async getPreview(
    userId: string,
    careProfiles: CareProfile[],
    scope: DataScopeSelection
  ): Promise<DataPacketPreview> {
    const selectedIds = new Set(getScopedCareProfileIds(scope));
    const selectedCareProfiles = careProfiles.filter((profile) => selectedIds.has(profile.id));
    const { start, end } = getDateBounds(scope);
    const warnings: string[] = [];

    if (selectedCareProfiles.length === 0) {
      warnings.push('Choose at least one care profile before creating a packet.');
    }
    if (scope.domains.length === 0) {
      warnings.push('Choose at least one data domain.');
    }
    if (scope.dateRange === 'custom' && (!start || !end)) {
      warnings.push('Custom date range needs both start and end dates.');
    }
    if (scope.includeAttachments) {
      warnings.push('Attachments may include sensitive original files. Review before sharing.');
    }

    const domainPreviews: DataPacketPreviewDomain[] = [];

    for (const domain of scope.domains) {
      if (domain === 'profile' || domain === 'family' || domain === 'emergency') {
        domainPreviews.push(staticDomainPreview(domain, selectedCareProfiles.length));
        continue;
      }

      const config = domainTables[domain];
      const { data, error } = await supabase
        .from(config.table)
        .select(config.select)
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (error) throw error;

      let records = mapRecords(domain, data ?? [])
        .filter((record) => belongsToSelectedCareProfile(record, selectedIds))
        .filter((record) => isWithinBounds(record.date, start, end));

      if (scope.includeCriticalOnly) {
        records = records.filter((record) => record.critical);
      }

      domainPreviews.push({
        domain,
        count: records.length,
        criticalCount: records.filter((record) => record.critical).length,
        attachmentCount: scope.includeAttachments
          ? records.reduce((sum, record) => sum + record.attachments, 0)
          : 0
      });
    }

    return {
      careProfileCount: selectedCareProfiles.length,
      dateStart: start,
      dateEnd: end,
      domains: domainPreviews,
      totalRecords: domainPreviews.reduce((sum, domain) => sum + domain.count, 0),
      totalAttachments: domainPreviews.reduce((sum, domain) => sum + domain.attachmentCount, 0),
      criticalRecords: domainPreviews.reduce((sum, domain) => sum + domain.criticalCount, 0),
      warnings
    };
  },

  async saveDraft(userId: string, scope: DataScopeSelection): Promise<DataPacketRecord> {
    const { start, end } = getDateBounds(scope);
    const { data, error } = await supabase
      .from('data_packets')
      .insert({
        user_id: userId,
        purpose: scope.purpose,
        care_profile_ids: getScopedCareProfileIds(scope),
        domains: scope.domains,
        date_range: scope.dateRange,
        custom_start_date: start,
        custom_end_date: end,
        include_attachments: !!scope.includeAttachments,
        include_critical_only: !!scope.includeCriticalOnly,
        reason_for_visit: scope.reasonForVisit?.trim() || null,
        expires_at: scope.expiresAt || null
      })
      .select('id, user_id, purpose, care_profile_ids, domains, date_range, custom_start_date, custom_end_date, include_attachments, include_critical_only, reason_for_visit, expires_at, created_at')
      .single();

    if (error) throw error;
    return data as DataPacketRecord;
  },

  async collectScopedData(
    userId: string,
    careProfiles: CareProfile[],
    scope: DataScopeSelection
  ): Promise<DataPacketCollection> {
    const selectedIds = new Set(getScopedCareProfileIds(scope));
    const { start, end } = getDateBounds(scope);
    const criticalOnly = !!scope.includeCriticalOnly;
    const collection: DataPacketCollection = {
      careProfiles: careProfiles.filter((profile) => selectedIds.has(profile.id)),
      timeline: [],
      medications: [],
      labs: [],
      documents: [],
      symptoms: [],
      costs: []
    };

    if (scope.domains.includes('timeline')) {
      collection.timeline = await getScopedRows<HealthEvent>(userId, 'timeline', selectedIds, start, end, criticalOnly);
    }
    if (scope.domains.includes('medications')) {
      collection.medications = await getScopedRows<Medication>(userId, 'medications', selectedIds, start, end, criticalOnly);
    }
    if (scope.domains.includes('labs')) {
      collection.labs = await getScopedRows<LabResult>(userId, 'labs', selectedIds, start, end, criticalOnly);
    }
    if (scope.domains.includes('documents')) {
      collection.documents = await getScopedRows<MedicalDocument>(userId, 'documents', selectedIds, start, end, criticalOnly);
    }
    if (scope.domains.includes('symptoms')) {
      collection.symptoms = await getScopedRows<SymptomEntry>(userId, 'symptoms', selectedIds, start, end, criticalOnly);
    }
    if (scope.domains.includes('costs')) {
      collection.costs = await getScopedRows<HealthcareCost>(userId, 'costs', selectedIds, start, end, criticalOnly);
    }

    return collection;
  }
};
