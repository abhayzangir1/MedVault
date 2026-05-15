export type DataDomain =
  | 'profile'
  | 'family'
  | 'timeline'
  | 'medications'
  | 'labs'
  | 'documents'
  | 'symptoms'
  | 'costs'
  | 'emergency';

export type DataPurpose =
  | 'export'
  | 'ai_analysis'
  | 'emergency_id'
  | 'doctor_packet'
  | 'share_link'
  | 'monthly_digest';

export type DateRangePreset = 'all_time' | 'last_30_days' | 'last_90_days' | 'last_1_year' | 'custom';

export interface DataScopeSelection {
  purpose: DataPurpose;
  domains: DataDomain[];
  dateRange: DateRangePreset;
  customStartDate?: string;
  customEndDate?: string;
  includeCriticalOnly?: boolean;
  includeAttachments?: boolean;
  careProfileIds: string[];
  reasonForVisit?: string;
  expiresAt?: string;

  // Backward-compatible alias for slices that have not yet migrated.
  profileIds?: Array<string | null>;
}

export const DEFAULT_EXPORT_SCOPE: DataScopeSelection = {
  purpose: 'export',
  domains: ['profile', 'timeline', 'medications', 'labs', 'documents', 'symptoms', 'costs'],
  dateRange: 'all_time',
  includeCriticalOnly: false,
  includeAttachments: true,
  careProfileIds: []
};

export const DEFAULT_AI_ANALYSIS_SCOPE: DataScopeSelection = {
  purpose: 'ai_analysis',
  domains: ['timeline', 'medications', 'labs', 'symptoms'],
  dateRange: 'last_90_days',
  includeCriticalOnly: false,
  includeAttachments: false,
  careProfileIds: []
};

export const DEFAULT_EMERGENCY_SCOPE: DataScopeSelection = {
  purpose: 'emergency_id',
  domains: ['profile', 'medications', 'timeline', 'emergency'],
  dateRange: 'all_time',
  includeCriticalOnly: true,
  includeAttachments: false,
  careProfileIds: []
};

export const DEFAULT_DOCTOR_PACKET_SCOPE: DataScopeSelection = {
  purpose: 'doctor_packet',
  domains: ['profile', 'timeline', 'medications', 'labs', 'documents', 'symptoms', 'costs'],
  dateRange: 'last_1_year',
  includeCriticalOnly: false,
  includeAttachments: false,
  careProfileIds: []
};

export const DEFAULT_SHARE_LINK_SCOPE: DataScopeSelection = {
  purpose: 'share_link',
  domains: ['profile', 'timeline', 'medications', 'labs', 'documents'],
  dateRange: 'last_90_days',
  includeCriticalOnly: false,
  includeAttachments: false,
  careProfileIds: []
};

export const DEFAULT_MONTHLY_DIGEST_SCOPE: DataScopeSelection = {
  purpose: 'monthly_digest',
  domains: ['timeline', 'medications', 'labs', 'symptoms', 'costs'],
  dateRange: 'last_30_days',
  includeCriticalOnly: false,
  includeAttachments: false,
  careProfileIds: []
};

export const DATA_PURPOSE_OPTIONS: Array<{ id: DataPurpose; label: string; note: string }> = [
  { id: 'doctor_packet', label: 'Doctor Packet', note: 'Appointment-ready summary from selected records.' },
  { id: 'export', label: 'Export', note: 'Personal backup or selected record bundle.' },
  { id: 'ai_analysis', label: 'AI Analysis', note: 'Only selected records are sent for analysis.' },
  { id: 'emergency_id', label: 'Emergency ID', note: 'Emergency-safe data only.' },
  { id: 'share_link', label: 'Share Link', note: 'Time-limited packet for a doctor or caregiver.' },
  { id: 'monthly_digest', label: 'Monthly Digest', note: 'Family summary for Pro Family users.' }
];

export const DATA_DOMAIN_OPTIONS: Array<{ id: DataDomain; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'family', label: 'Family' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'medications', label: 'Medications' },
  { id: 'labs', label: 'Labs' },
  { id: 'documents', label: 'Documents' },
  { id: 'symptoms', label: 'Symptoms' },
  { id: 'costs', label: 'Costs' },
  { id: 'emergency', label: 'Emergency' }
];

export const DATE_RANGE_OPTIONS: Array<{ id: DateRangePreset; label: string }> = [
  { id: 'last_30_days', label: '30 days' },
  { id: 'last_90_days', label: '90 days' },
  { id: 'last_1_year', label: '1 year' },
  { id: 'all_time', label: 'All time' },
  { id: 'custom', label: 'Custom' }
];

export function getDefaultScopeForPurpose(purpose: DataPurpose): DataScopeSelection {
  if (purpose === 'ai_analysis') return { ...DEFAULT_AI_ANALYSIS_SCOPE };
  if (purpose === 'emergency_id') return { ...DEFAULT_EMERGENCY_SCOPE };
  if (purpose === 'doctor_packet') return { ...DEFAULT_DOCTOR_PACKET_SCOPE };
  if (purpose === 'share_link') return { ...DEFAULT_SHARE_LINK_SCOPE };
  if (purpose === 'monthly_digest') return { ...DEFAULT_MONTHLY_DIGEST_SCOPE };
  return { ...DEFAULT_EXPORT_SCOPE };
}

export function isDomainSelected(scope: DataScopeSelection, domain: DataDomain) {
  return scope.domains.includes(domain);
}

export function describeDateRange(scope: Pick<DataScopeSelection, 'dateRange' | 'customStartDate' | 'customEndDate'>) {
  if (scope.dateRange === 'last_30_days') return 'Last 30 days';
  if (scope.dateRange === 'last_90_days') return 'Last 90 days';
  if (scope.dateRange === 'last_1_year') return 'Last 1 year';
  if (scope.dateRange === 'custom') return `${scope.customStartDate ?? 'Start'} to ${scope.customEndDate ?? 'End'}`;
  return 'All time';
}

export function getScopedCareProfileIds(scope: DataScopeSelection) {
  if (scope.careProfileIds.length > 0) return scope.careProfileIds;
  return (scope.profileIds ?? []).filter((id): id is string => Boolean(id));
}
