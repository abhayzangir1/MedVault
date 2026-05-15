export type PlanType = 'free' | 'pro' | 'pro_family';
export type BillingRegion = 'IN' | 'INTL';
export type BillingProvider = 'google_play' | 'razorpay' | 'manual';
export type SubscriptionStatus =
  | 'inactive'
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'revoked'
  | 'paused'
  | 'grace_period'
  | 'in_grace_period'
  | 'on_hold';
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
export type Relationship = 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'other';
export type CareProfileKind = 'self' | 'family';
export type EventCategory = 'diagnosis' | 'medication' | 'surgery' | 'vaccination' | 'allergy' | 'injury' | 'lab_test' | 'imaging' | 'consultation' | 'hospitalization' | 'other';
export type MedicationStatus = 'active' | 'paused' | 'discontinued' | 'completed';
export type CheckinStatus = 'taken' | 'missed' | 'skipped';
export type LabFlag = 'normal' | 'low' | 'high' | 'critical';
export type DocumentCategory = 'lab_report' | 'prescription' | 'insurance' | 'imaging' | 'discharge_summary' | 'other';
export type BillingEntitlementSource = 'google_play' | 'razorpay_legacy' | 'manual';
export type CostCategory = 'consultation' | 'medication' | 'lab' | 'imaging' | 'surgery' | 'insurance_premium' | 'other';
export type ReimbursementStatus = 'pending' | 'submitted' | 'reimbursed' | 'not_applicable';

export interface Profile {
  id: string;
  full_name: string | null;
  date_of_birth: string | null;
  blood_type: BloodType | null;
  gender: string | null;
  country: string;
  avatar_url: string | null;
  allergies: string[];
  chronic_conditions: string[];
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  emergency_id_enabled: boolean;
  emergency_id_token: string | null;
  ai_interpretations_used: number;
  ai_quota_reset_at: string;
  plan: PlanType;
  billing_region: BillingRegion;
  billing_provider?: BillingProvider | null;
  google_play_subscription_id?: string | null;
  google_play_purchase_token?: string | null;
  google_play_order_id?: string | null;
  subscription_product_id?: string | null;
  subscription_checked_at?: string | null;
  razorpay_subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  created_at: string;
}

export interface ProfileSettingsInput {
  full_name: string;
  date_of_birth?: string | null;
  blood_type?: BloodType | null;
  gender?: string | null;
  country?: string;
  allergies?: string[];
  chronic_conditions?: string[];
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
}

export interface CareProfile {
  id: string;
  owner_user_id: string;
  kind: CareProfileKind;
  relationship: Relationship;
  full_name: string;
  date_of_birth: string | null;
  blood_type: BloodType | null;
  gender: string | null;
  avatar_url: string | null;
  allergies: string[];
  chronic_conditions: string[];
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  emergency_id_enabled: boolean;
  emergency_id_token: string | null;
  is_active: boolean;
  created_at: string;
}

export type FamilyProfile = CareProfile;

export interface CareProfileInput {
  relationship: Relationship;
  full_name: string;
  date_of_birth?: string | null;
  blood_type?: BloodType | null;
  gender?: string | null;
  allergies?: string[];
  chronic_conditions?: string[];
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
}

export interface OnboardingProgress {
  user_id: string;
  added_first_event: boolean;
  added_first_medication: boolean;
  uploaded_first_document: boolean;
  checklist_dismissed: boolean;
  created_at: string;
}

export interface HealthEvent {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  title: string;
  category: EventCategory;
  event_date: string;
  description: string | null;
  is_critical: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface HealthEventInput {
  title: string;
  category: EventCategory;
  event_date: string;
  description?: string;
  is_critical: boolean;
  source_document_id?: string | null;
}

export interface Medication {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  drug_name: string;
  dosage: string;
  frequency: string;
  notes: string | null;
  status: MedicationStatus;
  refill_date: string | null;
  reminder_time: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface MedicationInput {
  drug_name: string;
  dosage: string;
  frequency: string;
  notes?: string;
  status: MedicationStatus;
  refill_date?: string;
  reminder_time?: string;
  source_document_id?: string | null;
}

export interface MedicationCheckin {
  id: string;
  medication_id: string;
  user_id: string;
  checkin_date: string;
  status: CheckinStatus;
  checkin_timestamp: string;
  created_at: string;
}

export interface MedicationWithTodayCheckin extends Medication {
  today_checkin: MedicationCheckin | null;
  adherence_30d: number;
}

export interface LabMarker {
  marker: string;
  value: number;
  unit: string;
  reference_low: number;
  reference_high: number;
  flag: LabFlag;
}

export interface LabResult {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  test_name: string;
  test_date: string;
  results: LabMarker[];
  ai_interpretation: string | null;
  ai_interpreted_at: string | null;
  translations: Record<string, string>;
  deleted_at: string | null;
  created_at: string;
}

export interface LabMarkerInput {
  marker: string;
  value: string;
  unit: string;
  reference_low: string;
  reference_high: string;
}

export interface LabResultInput {
  test_name: string;
  test_date: string;
  markers: LabMarkerInput[];
  source_document_id?: string | null;
}

export interface MedicalDocument {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  file_name: string;
  file_url: string;
  storage_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_category: DocumentCategory | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  is_handwritten: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface DocumentInput {
  file_name: string;
  file_url: string;
  storage_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  document_category: DocumentCategory;
  source_document_id?: string | null;
}

export interface SymptomPhoto {
  id: string;
  symptom_id: string;
  photo_url: string;
  storage_path: string | null;
  created_at: string;
}

export interface SymptomEntry {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  symptom_name: string;
  severity: number;
  onset_date: string;
  notes: string | null;
  resolved: boolean;
  resolved_date: string | null;
  source_document_id?: string | null;
  deleted_at: string | null;
  created_at: string;
  photos?: SymptomPhoto[];
}

export interface SymptomInput {
  symptom_name: string;
  severity: number;
  onset_date: string;
  notes?: string;
  resolved: boolean;
  resolved_date?: string;
  source_document_id?: string | null;
}

export interface CostPhoto {
  id: string;
  cost_id: string;
  photo_url: string;
  storage_path: string | null;
  created_at: string;
}

export interface HealthcareCost {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  profile_id: string | null;
  amount: number;
  cost_date: string;
  category: CostCategory;
  description: string | null;
  provider_name: string | null;
  reimbursement_status: ReimbursementStatus;
  reimbursement_amount: number | null;
  source_document_id?: string | null;
  deleted_at: string | null;
  created_at: string;
  photos?: CostPhoto[];
}

export interface HealthcareCostInput {
  amount: string;
  cost_date: string;
  category: CostCategory;
  description?: string;
  provider_name?: string;
  reimbursement_status: ReimbursementStatus;
  reimbursement_amount?: string;
  source_document_id?: string | null;
}

export interface CostMonthlyTotal {
  month: string;
  total: number;
  reimbursed: number;
}

export interface GooglePlayPurchaseVerificationInput {
  productId: string;
  purchaseToken: string;
  packageName: string;
}

export interface DataPacketDraft {
  id?: string;
  purpose: 'export' | 'ai_analysis' | 'emergency_id' | 'doctor_packet' | 'share_link' | 'monthly_digest';
  care_profile_ids: string[];
  domains: string[];
  date_range: string;
  include_attachments: boolean;
  include_critical_only: boolean;
  reason_for_visit?: string | null;
  expires_at?: string | null;
}

export interface DataPacketRecord extends DataPacketDraft {
  id: string;
  user_id: string;
  custom_start_date: string | null;
  custom_end_date: string | null;
  created_at: string;
}

export interface DataPacketPreviewDomain {
  domain: string;
  count: number;
  criticalCount: number;
  attachmentCount: number;
}

export interface DataPacketPreview {
  careProfileCount: number;
  dateStart: string | null;
  dateEnd: string | null;
  domains: DataPacketPreviewDomain[];
  totalRecords: number;
  totalAttachments: number;
  criticalRecords: number;
  warnings: string[];
}

export interface DataPacketCollection {
  careProfiles: CareProfile[];
  timeline: HealthEvent[];
  medications: Medication[];
  labs: LabResult[];
  documents: MedicalDocument[];
  symptoms: SymptomEntry[];
  costs: HealthcareCost[];
}

export interface ExportBuildResult {
  dataPacket: DataPacketRecord;
  pdfUri: string;
  jsonUri: string;
  fileBaseName: string;
  recordCount: number;
}

export interface DoctorPacketRecord {
  id: string;
  user_id: string;
  data_packet_id: string;
  title: string;
  pdf_storage_path: string | null;
  ai_summary: string | null;
  status: 'draft' | 'ready' | 'failed';
  created_at: string;
}

export interface DoctorPacketBuildResult {
  doctorPacket: DoctorPacketRecord;
  dataPacket: DataPacketRecord;
  pdfUri: string;
}

export type SmartImportTargetDomain = 'medications' | 'labs' | 'timeline' | 'costs' | 'documents';
export type SmartImportStatus = 'pending' | 'approved' | 'rejected';

export interface SmartImportSuggestion {
  id: string;
  user_id: string;
  care_profile_id: string | null;
  source_document_id: string;
  target_domain: SmartImportTargetDomain;
  suggested_payload: Record<string, unknown>;
  confidence: number | null;
  status: SmartImportStatus;
  created_record_id: string | null;
  created_at: string;
  source_document?: MedicalDocument | null;
}

export interface ShareLinkRecord {
  id: string;
  user_id: string;
  data_packet_id: string;
  token: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  created_at: string;
}

export interface EmergencyProfileScope {
  care_profile_id: string;
  user_id: string;
  data_packet_id: string;
  token: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicHealthPacket {
  ok: boolean;
  error?: string;
  token_type?: 'share_link' | 'emergency_id';
  expires_at?: string | null;
  scope?: {
    purpose: string;
    domains: string[];
    date_range: string;
    include_attachments: boolean;
    include_critical_only: boolean;
    reason_for_visit: string | null;
  };
  care_profiles?: Array<{
    id: string;
    full_name: string;
    relationship: string;
    date_of_birth: string | null;
    blood_type: string | null;
    allergies: string[];
    chronic_conditions: string[];
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relation: string | null;
  }>;
  records?: Record<string, Array<Record<string, unknown>>>;
}

export interface MonthlyDigestRecord {
  id: string;
  user_id: string;
  data_packet_id: string;
  title: string;
  digest_text: string;
  ai_summary: string | null;
  status: 'draft' | 'ready' | 'failed';
  month_key: string;
  created_at: string;
}

export interface MonthlyDigestBuildResult {
  digest: MonthlyDigestRecord;
  dataPacket: DataPacketRecord;
}

export interface DashboardSummary {
  eventsThisMonth: number;
  activeMedications: number;
  todayCheckins: number;
  upcomingRefills: Medication[];
  recentEvents: HealthEvent[];
  onboarding: OnboardingProgress | null;
  activityScore: number;
}

export interface CaregiverDashboardActivity {
  id: string;
  care_profile_id: string | null;
  care_profile_name: string;
  title: string;
  type: 'timeline' | 'lab' | 'symptom' | 'cost';
  date: string;
  is_critical: boolean;
}

export interface CaregiverDashboardSummary {
  activeCareProfiles: number;
  medicinesDueToday: number;
  missedMedicationCheckins: number;
  upcomingRefills: number;
  abnormalLabs: number;
  criticalLabs: number;
  followUpsDue: number;
  missingEmergencyInfo: number;
  monthlyOutOfPocket: number;
  recentActivity: CaregiverDashboardActivity[];
}
