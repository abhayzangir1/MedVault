import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { startOfMonth } from 'date-fns';
import { DataScopeSelection, getScopedCareProfileIds } from '@/lib/dataScopes';
import { canCreateDoctorPacket, isProProfile } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { dataPacketService } from '@/services/data-packet.service';
import type {
  CareProfile,
  DoctorPacketBuildResult,
  DoctorPacketRecord,
  HealthcareCost,
  HealthEvent,
  LabResult,
  MedicalDocument,
  Medication,
  Profile,
  SymptomEntry
} from '@/types';

type PacketCollections = {
  careProfiles: CareProfile[];
  timeline: HealthEvent[];
  medications: Medication[];
  labs: LabResult[];
  documents: MedicalDocument[];
  symptoms: SymptomEntry[];
  costs: HealthcareCost[];
};

function escapeHtml(value: string | null | undefined) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(value: number | null | undefined) {
  return `INR ${Number(value ?? 0).toLocaleString('en-IN')}`;
}

function isSelected(record: { care_profile_id: string | null; profile_id?: string | null }, selectedIds: Set<string>) {
  if (record.care_profile_id && selectedIds.has(record.care_profile_id)) return true;
  if (record.profile_id && selectedIds.has(record.profile_id)) return true;
  return false;
}

function isWithinDate(value: string, start: string | null, end: string | null) {
  const date = value.slice(0, 10);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function isCriticalDomainRecord(domain: keyof Omit<PacketCollections, 'careProfiles'>, record: unknown) {
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

function findProfileName(careProfiles: CareProfile[], careProfileId: string | null, profileId?: string | null) {
  const id = careProfileId ?? profileId ?? null;
  return careProfiles.find((profile) => profile.id === id)?.full_name ?? 'Selected profile';
}

async function selectScopedRows<T extends { care_profile_id: string | null; profile_id?: string | null }>(
  userId: string,
  table: string,
  select: string,
  dateField: string,
  selectedIds: Set<string>,
  start: string | null,
  end: string | null,
  criticalOnly: boolean,
  criticalDomain: keyof Omit<PacketCollections, 'careProfiles'>
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) throw error;

  return ((data ?? []) as unknown as T[])
    .filter((record) => isSelected(record, selectedIds))
    .filter((record) => isWithinDate(String((record as Record<string, unknown>)[dateField]), start, end))
    .filter((record) => !criticalOnly || isCriticalDomainRecord(criticalDomain, record));
}

function section(title: string, body: string) {
  if (!body.trim()) return '';
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderList(items: string[]) {
  if (items.length === 0) return '<p class="muted">No selected records.</p>';
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function buildDoctorPacketHtml(title: string, scope: DataScopeSelection, collections: PacketCollections) {
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const selectedNames = collections.careProfiles.map((profile) => profile.full_name).join(', ');

  const profileSection = section('Care Profiles', collections.careProfiles.map((profile) => `
    <div class="card">
      <strong>${escapeHtml(profile.full_name)}</strong>
      <div>${escapeHtml(profile.relationship)} | DOB: ${escapeHtml(formatDate(profile.date_of_birth))} | Blood: ${escapeHtml(profile.blood_type ?? 'Unknown')}</div>
      <div>Allergies: ${escapeHtml(profile.allergies.length ? profile.allergies.join(', ') : 'None recorded')}</div>
      <div>Conditions: ${escapeHtml(profile.chronic_conditions.length ? profile.chronic_conditions.join(', ') : 'None recorded')}</div>
      <div>Emergency: ${escapeHtml(profile.emergency_contact_name || 'Not set')} ${escapeHtml(profile.emergency_contact_phone || '')}</div>
    </div>
  `).join(''));

  const timelineSection = section('Timeline', renderList(collections.timeline.map((event) => (
    `<strong>${escapeHtml(event.title)}</strong> (${escapeHtml(event.category)}, ${escapeHtml(formatDate(event.event_date))})${event.is_critical ? ' - Critical' : ''}${event.description ? `<br/>${escapeHtml(event.description)}` : ''}`
  ))));

  const medicationsSection = section('Medications', renderList(collections.medications.map((medication) => (
    `<strong>${escapeHtml(medication.drug_name)}</strong> - ${escapeHtml(medication.dosage)} | ${escapeHtml(medication.frequency)} | ${escapeHtml(medication.status)}${medication.refill_date ? ` | Refill: ${escapeHtml(formatDate(medication.refill_date))}` : ''}${medication.notes ? `<br/>${escapeHtml(medication.notes)}` : ''}`
  ))));

  const labsSection = section('Labs', renderList(collections.labs.map((lab) => {
    const abnormal = lab.results.filter((marker) => marker.flag !== 'normal');
    return `<strong>${escapeHtml(lab.test_name)}</strong> (${escapeHtml(formatDate(lab.test_date))})${abnormal.length ? `<br/>Flags: ${escapeHtml(abnormal.map((marker) => `${marker.marker} ${marker.value}${marker.unit} ${marker.flag}`).join(', '))}` : '<br/>No abnormal markers selected.'}`;
  })));

  const documentsSection = section('Documents', renderList(collections.documents.map((document) => (
    `<strong>${escapeHtml(document.file_name)}</strong> - ${escapeHtml(document.document_category ?? 'other')} | OCR confidence: ${document.ocr_confidence ?? 'N/A'}`
  ))));

  const symptomsSection = section('Symptoms', renderList(collections.symptoms.map((symptom) => (
    `<strong>${escapeHtml(symptom.symptom_name)}</strong> - severity ${symptom.severity}/10 | ${escapeHtml(formatDate(symptom.onset_date))}${symptom.resolved ? ` | Resolved ${escapeHtml(formatDate(symptom.resolved_date))}` : ''}${symptom.notes ? `<br/>${escapeHtml(symptom.notes)}` : ''}`
  ))));

  const costsSection = section('Costs', renderList(collections.costs.map((cost) => (
    `<strong>${escapeHtml(cost.description || cost.category)}</strong> - ${escapeHtml(formatCurrency(cost.amount))} | ${escapeHtml(formatDate(cost.cost_date))}${cost.provider_name ? ` | ${escapeHtml(cost.provider_name)}` : ''}${cost.reimbursement_amount ? ` | Reimbursed ${escapeHtml(formatCurrency(cost.reimbursement_amount))}` : ''}`
  ))));

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; padding: 28px; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      h2 { font-size: 18px; margin: 24px 0 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
      .meta { color: #4b5563; line-height: 1.5; margin-bottom: 18px; }
      .notice { background: #ecfdf5; border: 1px solid #99f6e4; padding: 12px; border-radius: 8px; margin: 16px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin: 8px 0; }
      ul { padding-left: 20px; }
      li { margin: 9px 0; line-height: 1.45; }
      .muted { color: #6b7280; }
      footer { margin-top: 28px; color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      Generated: ${escapeHtml(generatedAt)}<br/>
      Profiles: ${escapeHtml(selectedNames || 'None selected')}<br/>
      Reason: ${escapeHtml(scope.reasonForVisit || 'Not specified')}<br/>
      Critical only: ${scope.includeCriticalOnly ? 'Yes' : 'No'} | Attachments included in scope: ${scope.includeAttachments ? 'Yes' : 'No'}
    </div>
    <div class="notice">This packet contains only the records selected by the MedVault user. It is a visit-prep summary and is not a medical diagnosis.</div>
    ${scope.domains.includes('profile') ? profileSection : ''}
    ${scope.domains.includes('timeline') ? timelineSection : ''}
    ${scope.domains.includes('medications') ? medicationsSection : ''}
    ${scope.domains.includes('labs') ? labsSection : ''}
    ${scope.domains.includes('documents') ? documentsSection : ''}
    ${scope.domains.includes('symptoms') ? symptomsSection : ''}
    ${scope.domains.includes('costs') ? costsSection : ''}
    <footer>MedVault Doctor Packet. Share only with people you trust.</footer>
  </body>
</html>`;
}

export const doctorPacketService = {
  async countDoctorPacketsThisMonth(userId: string) {
    const since = startOfMonth(new Date()).toISOString();
    const { count, error } = await supabase
      .from('doctor_packets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);

    if (error) throw error;
    return count ?? 0;
  },

  async buildDoctorPacket(
    userId: string,
    accountProfile: Profile,
    careProfiles: CareProfile[],
    scope: DataScopeSelection,
    packetsThisMonth: number
  ): Promise<DoctorPacketBuildResult> {
    const selectedIds = new Set(getScopedCareProfileIds(scope));
    const selectedCareProfiles = careProfiles.filter((profile) => selectedIds.has(profile.id));
    const includesFamily = selectedCareProfiles.some((profile) => profile.kind === 'family') || selectedCareProfiles.length > 1;
    const gate = canCreateDoctorPacket(accountProfile, packetsThisMonth, includesFamily);

    if (!gate.allowed) throw new Error(gate.reason ?? 'Doctor Packet limit reached.');
    if (!selectedCareProfiles.length) throw new Error('Choose at least one care profile.');
    if (scope.includeAttachments && !isProProfile(accountProfile)) throw new Error('Doctor Packet attachments require Pro Family.');

    const { start, end } = dataPacketService.getDateBounds(scope);
    const criticalOnly = !!scope.includeCriticalOnly;

    const collections: PacketCollections = {
      careProfiles: selectedCareProfiles,
      timeline: [],
      medications: [],
      labs: [],
      documents: [],
      symptoms: [],
      costs: []
    };

    if (scope.domains.includes('timeline')) {
      collections.timeline = await selectScopedRows<HealthEvent>(
        userId,
        'health_events',
        'id, user_id, care_profile_id, profile_id, title, category, event_date, description, is_critical, deleted_at, created_at',
        'event_date',
        selectedIds,
        start,
        end,
        criticalOnly,
        'timeline'
      );
    }

    if (scope.domains.includes('medications')) {
      collections.medications = await selectScopedRows<Medication>(
        userId,
        'medications',
        'id, user_id, care_profile_id, profile_id, drug_name, dosage, frequency, notes, status, refill_date, reminder_time, deleted_at, created_at',
        'created_at',
        selectedIds,
        start,
        end,
        criticalOnly,
        'medications'
      );
    }

    if (scope.domains.includes('labs')) {
      collections.labs = await selectScopedRows<LabResult>(
        userId,
        'lab_results',
        'id, user_id, care_profile_id, profile_id, test_name, test_date, results, ai_interpretation, ai_interpreted_at, translations, deleted_at, created_at',
        'test_date',
        selectedIds,
        start,
        end,
        criticalOnly,
        'labs'
      );
    }

    if (scope.domains.includes('documents')) {
      collections.documents = await selectScopedRows<MedicalDocument>(
        userId,
        'documents',
        'id, user_id, care_profile_id, profile_id, file_name, file_url, storage_path, file_type, file_size, document_category, ocr_text, ocr_confidence, is_handwritten, deleted_at, created_at',
        'created_at',
        selectedIds,
        start,
        end,
        criticalOnly,
        'documents'
      );
    }

    if (scope.domains.includes('symptoms')) {
      collections.symptoms = await selectScopedRows<SymptomEntry>(
        userId,
        'symptom_entries',
        'id, user_id, care_profile_id, profile_id, symptom_name, severity, onset_date, notes, resolved, resolved_date, source_document_id, deleted_at, created_at',
        'onset_date',
        selectedIds,
        start,
        end,
        criticalOnly,
        'symptoms'
      );
    }

    if (scope.domains.includes('costs')) {
      collections.costs = await selectScopedRows<HealthcareCost>(
        userId,
        'healthcare_costs',
        'id, user_id, care_profile_id, profile_id, amount, cost_date, category, description, provider_name, reimbursement_status, reimbursement_amount, source_document_id, deleted_at, created_at',
        'cost_date',
        selectedIds,
        start,
        end,
        criticalOnly,
        'costs'
      );
    }

    const title = selectedCareProfiles.length === 1
      ? `${selectedCareProfiles[0].full_name} Doctor Packet`
      : `Family Doctor Packet (${selectedCareProfiles.length} profiles)`;
    const html = buildDoctorPacketHtml(title, scope, collections);
    const pdf = await Print.printToFileAsync({ html, base64: false });
    const dataPacket = await dataPacketService.saveDraft(userId, { ...scope, purpose: 'doctor_packet' });

    const { data, error } = await supabase
      .from('doctor_packets')
      .insert({
        user_id: userId,
        data_packet_id: dataPacket.id,
        title,
        pdf_storage_path: null,
        status: 'ready'
      })
      .select('id, user_id, data_packet_id, title, pdf_storage_path, ai_summary, status, created_at')
      .single();

    if (error) throw error;

    return {
      doctorPacket: data as DoctorPacketRecord,
      dataPacket,
      pdfUri: pdf.uri
    };
  },

  async sharePdf(pdfUri: string) {
    const available = await Sharing.isAvailableAsync();
    if (!available) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Doctor Packet',
      UTI: 'com.adobe.pdf'
    });
  },

  getProfileNameForRecord: findProfileName
};
